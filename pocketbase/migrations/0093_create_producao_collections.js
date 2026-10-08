migrate(
  (app) => {
    // 1. Coleção producao_semanas
    const semanasCol = new Collection({
      name: 'producao_semanas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        { name: 'semana_ano', type: 'text', required: true },
        { name: 'segunda_feira', type: 'date', required: true },
        { name: 'data_inicio_fornecedor', type: 'date', required: true },
        { name: 'data_fim_fornecedor', type: 'date', required: true },
        { name: 'data_inicio_saques', type: 'date', required: true },
        { name: 'data_fim_saques', type: 'date', required: true },
        { name: 'dias_offset_saques', type: 'number', min: 0 },
        { name: 'imposto', type: 'number', min: 0 },
        { name: 'observacoes', type: 'text' },
        { name: 'despesa_vinculo_id', type: 'text' }, // Ponte futura inativa com /despesas
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_prod_sem_ano ON producao_semanas (semana_ano)',
        'CREATE INDEX idx_prod_sem_seg ON producao_semanas (segunda_feira)',
      ],
    })
    app.save(semanasCol)

    const semanasId = app.findCollectionByNameOrId('producao_semanas').id

    // 2. Coleção producao_produtos (produtos e custos por semana)
    const produtosCol = new Collection({
      name: 'producao_produtos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        {
          name: 'semana',
          type: 'relation',
          required: true,
          collectionId: semanasId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'nome', type: 'text', required: true },
        { name: 'custo_unitario', type: 'number', required: true, min: 0 },
        { name: 'ordem', type: 'number', min: 0 },
        { name: 'codigo_referencia', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_prod_prod_sem ON producao_produtos (semana)',
        'CREATE INDEX idx_prod_prod_ordem ON producao_produtos (ordem)',
      ],
    })
    app.save(produtosCol)

    const produtosId = app.findCollectionByNameOrId('producao_produtos').id

    // 3. Coleção producao_dias_itens (quantidades por dia e por produto)
    const diasItensCol = new Collection({
      name: 'producao_dias_itens',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        {
          name: 'semana',
          type: 'relation',
          required: true,
          collectionId: semanasId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'data', type: 'date', required: true },
        {
          name: 'produto',
          type: 'relation',
          required: true,
          collectionId: produtosId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'quantidade', type: 'number', required: true, min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_prod_dias_sem ON producao_dias_itens (semana)',
        'CREATE INDEX idx_prod_dias_data ON producao_dias_itens (data)',
        'CREATE INDEX idx_prod_dias_prod ON producao_dias_itens (produto)',
      ],
    })
    app.save(diasItensCol)

    // 4. Coleção producao_saques_grupos (grupos por marketplace/conta de saque)
    const saquesGruposCol = new Collection({
      name: 'producao_saques_grupos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        {
          name: 'semana',
          type: 'relation',
          required: true,
          collectionId: semanasId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'titulo', type: 'text', required: true },
        { name: 'marketplace_referencia', type: 'text' }, // Apenas texto de referência, NÃO vinculado a contas financeiras
        { name: 'ordem', type: 'number', min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_prod_saq_grp_sem ON producao_saques_grupos (semana)',
        'CREATE INDEX idx_prod_saq_grp_ordem ON producao_saques_grupos (ordem)',
      ],
    })
    app.save(saquesGruposCol)

    const saquesGruposId = app.findCollectionByNameOrId('producao_saques_grupos').id

    // 5. Coleção producao_saques_itens (linhas de auto-saque por grupo)
    const saquesItensCol = new Collection({
      name: 'producao_saques_itens',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        {
          name: 'grupo',
          type: 'relation',
          required: true,
          collectionId: saquesGruposId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'descricao', type: 'text' },
        { name: 'valor', type: 'number', required: true, min: 0 },
        { name: 'ordem', type: 'number', min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_prod_saq_item_grp ON producao_saques_itens (grupo)',
        'CREATE INDEX idx_prod_saq_item_ordem ON producao_saques_itens (ordem)',
      ],
    })
    app.save(saquesItensCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('producao_saques_itens')
      app.delete(col)
    } catch (_) {}

    try {
      const col = app.findCollectionByNameOrId('producao_saques_grupos')
      app.delete(col)
    } catch (_) {}

    try {
      const col = app.findCollectionByNameOrId('producao_dias_itens')
      app.delete(col)
    } catch (_) {}

    try {
      const col = app.findCollectionByNameOrId('producao_produtos')
      app.delete(col)
    } catch (_) {}

    try {
      const col = app.findCollectionByNameOrId('producao_semanas')
      app.delete(col)
    } catch (_) {}
  },
)
