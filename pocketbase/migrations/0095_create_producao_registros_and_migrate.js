migrate(
  (app) => {
    // 1. Obter id da coleção fornecedores (opcional na relação ou texto de apoio)
    let fornecedoresId = ''
    try {
      fornecedoresId = app.findCollectionByNameOrId('fornecedores').id
    } catch (_) {}

    // 2. Criar coleção producao_registros (Registros de Pagamento de Fornecedor)
    // Range de compras editável, range de saques editável, referência a fornecedor
    const registrosFields = [
      {
        name: 'fornecedor',
        type: 'relation',
        collectionId: fornecedoresId || undefined,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: 'fornecedor_nome', type: 'text' },
      { name: 'data_inicio_compra', type: 'date', required: true },
      { name: 'data_fim_compra', type: 'date', required: true },
      { name: 'data_inicio_saques', type: 'date', required: true },
      { name: 'data_fim_saques', type: 'date', required: true },
      { name: 'label_compra', type: 'text' },
      { name: 'label_saques', type: 'text' },
      { name: 'imposto', type: 'number', min: 0 },
      { name: 'observacoes', type: 'text' },
      { name: 'datas_grade', type: 'json' }, // Array das datas dinâmicas cadastradas: ["2026-10-05", "2026-10-06", ...]
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]

    const registrosCol = new Collection({
      name: 'producao_registros',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: registrosFields,
      indexes: [],
    })
    app.save(registrosCol)

    const registrosId = app.findCollectionByNameOrId('producao_registros').id

    // 3. Adicionar campo 'registro' em producao_produtos, producao_dias_itens e producao_saques_grupos
    // Mantendo 'semana' opcional para compatibilidade e vinculando 'registro'
    const prodCol = app.findCollectionByNameOrId('producao_produtos')
    const semanaField = prodCol.fields.getByName('semana')
    if (semanaField) {
      semanaField.required = false
    }
    prodCol.fields.add(
      new RelationField({
        name: 'registro',
        collectionId: registrosId,
        cascadeDelete: true,
        maxSelect: 1,
      }),
    )
    prodCol.addIndex('idx_prod_prod_reg', false, 'registro', '')
    app.save(prodCol)

    const diasCol = app.findCollectionByNameOrId('producao_dias_itens')
    const semanaDiasField = diasCol.fields.getByName('semana')
    if (semanaDiasField) {
      semanaDiasField.required = false
    }
    diasCol.fields.add(
      new RelationField({
        name: 'registro',
        collectionId: registrosId,
        cascadeDelete: true,
        maxSelect: 1,
      }),
    )
    diasCol.addIndex('idx_prod_dias_reg', false, 'registro', '')
    app.save(diasCol)

    const gruposCol = app.findCollectionByNameOrId('producao_saques_grupos')
    const semanaGruposField = gruposCol.fields.getByName('semana')
    if (semanaGruposField) {
      semanaGruposField.required = false
    }
    gruposCol.fields.add(
      new RelationField({
        name: 'registro',
        collectionId: registrosId,
        cascadeDelete: true,
        maxSelect: 1,
      }),
    )
    gruposCol.addIndex('idx_prod_saq_grp_reg', false, 'registro', '')
    app.save(gruposCol)

    // 4. MIGRAR SEMANAS EXISTENTES PARA REGISTROS
    // Se existir fornecedor cadastrado (ex: "Eduardo Toalhas"), vincula como padrão na migração
    let defaultFornecedorId = ''
    let defaultFornecedorNome = ''
    try {
      const primeiroForn = app.findFirstRecordByData(
        'fornecedores',
        'nome_fantasia',
        'Eduardo Toalhas',
      )
      if (primeiroForn) {
        defaultFornecedorId = primeiroForn.id
        defaultFornecedorNome =
          primeiroForn.getString('nome_fantasia') || primeiroForn.getString('razao_social')
      }
    } catch (_) {
      try {
        const anyForn = app.findRecordsByFilter('fornecedores', '', 'created', 1, 0)
        if (anyForn.length > 0) {
          defaultFornecedorId = anyForn[0].id
          defaultFornecedorNome =
            anyForn[0].getString('nome_fantasia') || anyForn[0].getString('razao_social')
        }
      } catch (_) {}
    }

    // Buscar semanas existentes
    const semanas = app.findRecordsByFilter('producao_semanas', '', 'created', 100, 0)
    for (const sem of semanas) {
      const reg = new Record(registrosCol)
      if (defaultFornecedorId) {
        reg.set('fornecedor', defaultFornecedorId)
        reg.set('fornecedor_nome', defaultFornecedorNome)
      }
      reg.set('data_inicio_compra', sem.getString('data_inicio_fornecedor'))
      reg.set('data_fim_compra', sem.getString('data_fim_fornecedor'))
      reg.set('data_inicio_saques', sem.getString('data_inicio_saques'))
      reg.set('data_fim_saques', sem.getString('data_fim_saques'))
      reg.set('imposto', sem.getInt('imposto') || 0)
      reg.set('observacoes', sem.getString('observacoes') || '')

      // Gerar label_compra e label_saques amigáveis
      const dtIniCompra = sem.getString('data_inicio_fornecedor').slice(0, 10)
      const dtFimCompra = sem.getString('data_fim_fornecedor').slice(0, 10)
      const dtIniSaques = sem.getString('data_inicio_saques').slice(0, 10)
      const dtFimSaques = sem.getString('data_fim_saques').slice(0, 10)

      reg.set('label_compra', dtIniCompra + ' a ' + dtFimCompra)
      reg.set('label_saques', dtIniSaques + ' a ' + dtFimSaques)

      // Buscar se haviam dias com itens para montar datas_grade
      const itensSem = app.findRecordsByFilter(
        'producao_dias_itens',
        'semana = {:semId}',
        'data',
        1000,
        0,
        { semId: sem.id },
      )
      const datasSet = {}
      for (const it of itensSem) {
        const d = it.getString('data').slice(0, 10)
        if (d) datasSet[d] = true
      }
      const datasArr = Object.keys(datasSet)
      reg.set('datas_grade', datasArr)

      app.save(reg)

      // Atualizar registros vinculados a esta semana apontando para o novo registro
      app
        .db()
        .newQuery('UPDATE producao_produtos SET registro = {:regId} WHERE semana = {:semId}')
        .bind({ regId: reg.id, semId: sem.id })
        .execute()

      app
        .db()
        .newQuery('UPDATE producao_dias_itens SET registro = {:regId} WHERE semana = {:semId}')
        .bind({ regId: reg.id, semId: sem.id })
        .execute()

      app
        .db()
        .newQuery('UPDATE producao_saques_grupos SET registro = {:regId} WHERE semana = {:semId}')
        .bind({ regId: reg.id, semId: sem.id })
        .execute()
    }
  },
  (app) => {
    try {
      const prodCol = app.findCollectionByNameOrId('producao_produtos')
      prodCol.removeIndex('idx_prod_prod_reg')
      prodCol.fields.removeByName('registro')
      app.save(prodCol)
    } catch (_) {}

    try {
      const diasCol = app.findCollectionByNameOrId('producao_dias_itens')
      diasCol.removeIndex('idx_prod_dias_reg')
      diasCol.fields.removeByName('registro')
      app.save(diasCol)
    } catch (_) {}

    try {
      const gruposCol = app.findCollectionByNameOrId('producao_saques_grupos')
      gruposCol.removeIndex('idx_prod_saq_grp_reg')
      gruposCol.fields.removeByName('registro')
      app.save(gruposCol)
    } catch (_) {}

    try {
      const regCol = app.findCollectionByNameOrId('producao_registros')
      app.delete(regCol)
    } catch (_) {}
  },
)
