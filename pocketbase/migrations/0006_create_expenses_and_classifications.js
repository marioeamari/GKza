migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const canWriteFinance = "@request.auth.id != '' && @request.auth.role != 'visualizador'"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    // 1. Atualizar contas com dia_fechamento e dia_vencimento
    const contas = app.findCollectionByNameOrId('contas')
    if (!contas.fields.getByName('dia_fechamento')) {
      contas.fields.add(
        new NumberField({
          name: 'dia_fechamento',
          required: false,
          min: 1,
          max: 31,
          onlyInt: true,
        }),
      )
    }
    if (!contas.fields.getByName('dia_vencimento')) {
      contas.fields.add(
        new NumberField({
          name: 'dia_vencimento',
          required: false,
          min: 1,
          max: 31,
          onlyInt: true,
        }),
      )
    }
    if (!contas.fields.getByName('bandeira')) {
      contas.fields.add(new TextField({ name: 'bandeira', required: false, max: 60 }))
    }
    app.save(contas)

    // 2. Coleção Tags
    const tags = new Collection({
      name: 'tags',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: canWriteFinance,
      updateRule: canWriteFinance,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 100 },
        { name: 'cor', type: 'text', required: false, max: 20 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_tags_nome ON tags (nome)'],
    })
    app.save(tags)

    // 3. Coleção Tipos de Despesa (Fixa, Fixa-Variável, etc.)
    const tiposDespesa = new Collection({
      name: 'tipos_despesa',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: canWriteFinance,
      updateRule: canWriteFinance,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 100 },
        { name: 'codigo', type: 'text', required: true, max: 50 },
        { name: 'descricao', type: 'text', required: false, max: 300 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_tipos_despesa_codigo ON tipos_despesa (codigo)'],
    })
    app.save(tiposDespesa)

    // 4. Coleção Métodos de Pagamento (Pix-CPF, Pix-CNPJ, Cred-CPF, boleto, etc.)
    const metodosPagamento = new Collection({
      name: 'metodos_pagamento',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: canWriteFinance,
      updateRule: canWriteFinance,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 100 },
        { name: 'codigo', type: 'text', required: true, max: 50 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pix', 'cartao', 'boleto', 'transferencia', 'dinheiro', 'outro'],
        },
        {
          name: 'conta_padrao',
          type: 'relation',
          required: false,
          collectionId: contas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'ativo', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_metodos_pagamento_codigo ON metodos_pagamento (codigo)'],
    })
    app.save(metodosPagamento)

    // 5. Coleção Tipos de Dízimo/Oferta (Dízimo, Oferta, Primícia/Prêmica, etc.)
    const tiposDizimo = new Collection({
      name: 'tipos_dizimo',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: canWriteFinance,
      updateRule: canWriteFinance,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 100 },
        { name: 'descricao', type: 'text', required: false, max: 300 },
        { name: 'soma_resumo', type: 'bool', required: false },
        { name: 'cor', type: 'text', required: false, max: 20 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_tipos_dizimo_nome ON tipos_dizimo (nome)'],
    })
    app.save(tiposDizimo)

    const empresas = app.findCollectionByNameOrId('empresas')
    const pessoas = app.findCollectionByNameOrId('pessoas')
    const categorias = app.findCollectionByNameOrId('categorias')

    // 6. Coleção Despesas Compromissos
    const despesasCompromissos = new Collection({
      name: 'despesas_compromisso',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: canWriteFinance,
      updateRule: canWriteFinance,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'contexto_tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pessoal', 'empresa'],
        },
        {
          name: 'empresa',
          type: 'relation',
          required: false,
          collectionId: empresas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'pessoa',
          type: 'relation',
          required: false,
          collectionId: pessoas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'descricao', type: 'text', required: true, max: 250 },
        { name: 'fornecedor', type: 'text', required: false, max: 150 },
        {
          name: 'categoria',
          type: 'relation',
          required: false,
          collectionId: categorias.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'tag',
          type: 'relation',
          required: false,
          collectionId: tags.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'tipo_despesa',
          type: 'relation',
          required: false,
          collectionId: tiposDespesa.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'metodo_pagamento',
          type: 'relation',
          required: false,
          collectionId: metodosPagamento.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'conta_padrao',
          type: 'relation',
          required: false,
          collectionId: contas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'secao',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['contas_mensais_pix_boleto', 'assinaturas_anuais', 'cartoes_credito'],
        },
        {
          name: 'regra_repeticao',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['mensal', 'anual', 'parcelado', 'avulso'],
        },
        { name: 'total_parcelas', type: 'number', required: false, min: 1, onlyInt: true },
        { name: 'parcela_inicial', type: 'number', required: false, min: 1, onlyInt: true },
        { name: 'dia_vencimento', type: 'number', required: false, min: 1, max: 31, onlyInt: true },
        { name: 'regra_vencimento_texto', type: 'text', required: false, max: 50 },
        { name: 'data_inicio', type: 'date', required: true },
        { name: 'valor_estimado', type: 'number', required: true, min: 0 },
        { name: 'link_pagamento', type: 'url', required: false },
        { name: 'dizimo', type: 'bool', required: false },
        {
          name: 'tipo_dizimo',
          type: 'relation',
          required: false,
          collectionId: tiposDizimo.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'ativo', type: 'bool', required: false },
        { name: 'observacoes', type: 'text', required: false, max: 3000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_desp_comp_contexto ON despesas_compromisso (contexto_tipo, empresa)',
        'CREATE INDEX idx_desp_comp_secao ON despesas_compromisso (secao)',
        'CREATE INDEX idx_desp_comp_ativo ON despesas_compromisso (ativo)',
      ],
    })
    app.save(despesasCompromissos)

    const lancamentos = app.findCollectionByNameOrId('lancamentos')

    // 7. Coleção Ocorrências das Despesas
    const despesasOcorrencias = new Collection({
      name: 'despesas_ocorrencias',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: canWriteFinance,
      updateRule: canWriteFinance,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'compromisso',
          type: 'relation',
          required: true,
          collectionId: despesasCompromissos.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'contexto_tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pessoal', 'empresa'],
        },
        {
          name: 'empresa',
          type: 'relation',
          required: false,
          collectionId: empresas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'secao',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['contas_mensais_pix_boleto', 'assinaturas_anuais', 'cartoes_credito'],
        },
        {
          name: 'conta',
          type: 'relation',
          required: false,
          collectionId: contas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'competencia', type: 'text', required: true, max: 7 }, // 'YYYY-MM'
        { name: 'numero_parcela', type: 'number', required: false, min: 1, onlyInt: true },
        { name: 'total_parcelas', type: 'number', required: false, min: 1, onlyInt: true },
        { name: 'data_vencimento', type: 'date', required: true },
        { name: 'valor_previsto', type: 'number', required: true, min: 0 },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['prevista', 'paga', 'cancelada'],
        },
        { name: 'data_pagamento', type: 'date', required: false },
        { name: 'valor_pago', type: 'number', required: false, min: 0 },
        {
          name: 'lancamento',
          type: 'relation',
          required: false,
          collectionId: lancamentos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'dizimo', type: 'bool', required: false },
        {
          name: 'tipo_dizimo',
          type: 'relation',
          required: false,
          collectionId: tiposDizimo.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'link_pagamento', type: 'url', required: false },
        { name: 'observacoes', type: 'text', required: false, max: 2000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_desp_ocorr_comp ON despesas_ocorrencias (compromisso)',
        'CREATE INDEX idx_desp_ocorr_mes ON despesas_ocorrencias (competencia)',
        'CREATE INDEX idx_desp_ocorr_venc ON despesas_ocorrencias (data_vencimento)',
        'CREATE INDEX idx_desp_ocorr_status ON despesas_ocorrencias (status)',
        'CREATE INDEX idx_desp_ocorr_ctx ON despesas_ocorrencias (contexto_tipo, empresa)',
      ],
    })
    app.save(despesasOcorrencias)
  },
  (app) => {
    const names = [
      'despesas_ocorrencias',
      'despesas_compromisso',
      'tipos_dizimo',
      'metodos_pagamento',
      'tipos_despesa',
      'tags',
    ]
    for (let i = 0; i < names.length; i++) {
      try {
        app.delete(app.findCollectionByNameOrId(names[i]))
      } catch (_) {}
    }
  },
)
