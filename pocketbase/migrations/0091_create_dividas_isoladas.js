migrate(
  (app) => {
    // 1. Coleção dividas
    const dividasCol = new Collection({
      name: 'dividas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'credor', type: 'text', required: true },
        { name: 'valor_total', type: 'number', required: true, min: 0 },
        { name: 'data_contratacao', type: 'date', required: true },
        { name: 'taxa_juros', type: 'number', min: 0 },
        {
          name: 'taxa_juros_tipo',
          type: 'select',
          values: ['mensal', 'anual', 'total'],
          maxSelect: 1,
        },
        { name: 'numero_parcelas', type: 'number', min: 1 },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['ativa', 'quitada', 'renegociada'],
          maxSelect: 1,
        },
        { name: 'saldo_inicial_caixa', type: 'number', min: 0 },
        { name: 'observacoes', type: 'text' },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_dividas_status ON dividas (status)',
        'CREATE INDEX idx_dividas_contratacao ON dividas (data_contratacao)',
      ],
    })
    app.save(dividasCol)

    const dividasId = app.findCollectionByNameOrId('dividas').id

    // 2. Coleção dividas_parcelas
    const parcelasCol = new Collection({
      name: 'dividas_parcelas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        {
          name: 'divida',
          type: 'relation',
          required: true,
          collectionId: dividasId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'numero', type: 'number', required: true, min: 0 },
        { name: 'data_vencimento', type: 'date', required: true },
        { name: 'valor', type: 'number', required: true, min: 0 },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pendente', 'paga', 'atrasada'],
          maxSelect: 1,
        },
        { name: 'data_pagamento', type: 'date' },
        { name: 'valor_pago', type: 'number', min: 0 },
        { name: 'is_entrada', type: 'bool' },
        { name: 'observacoes', type: 'text' },
        { name: 'lancamento_id', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_dividas_parcelas_divida ON dividas_parcelas (divida)',
        'CREATE INDEX idx_dividas_parcelas_venc ON dividas_parcelas (data_vencimento)',
        'CREATE INDEX idx_dividas_parcelas_status ON dividas_parcelas (status)',
      ],
    })
    app.save(parcelasCol)

    // 3. Coleção dividas_receitas
    const receitasCol = new Collection({
      name: 'dividas_receitas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        {
          name: 'divida',
          type: 'relation',
          required: true,
          collectionId: dividasId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'data', type: 'date', required: true },
        { name: 'valor', type: 'number', required: true, min: 0 },
        { name: 'descricao', type: 'text', required: true },
        { name: 'origem', type: 'text' },
        { name: 'observacoes', type: 'text' },
        { name: 'lancamento_id', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_dividas_receitas_divida ON dividas_receitas (divida)',
        'CREATE INDEX idx_dividas_receitas_data ON dividas_receitas (data)',
      ],
    })
    app.save(receitasCol)
  },
  (app) => {
    try {
      const receitasCol = app.findCollectionByNameOrId('dividas_receitas')
      app.delete(receitasCol)
    } catch (_) {}

    try {
      const parcelasCol = app.findCollectionByNameOrId('dividas_parcelas')
      app.delete(parcelasCol)
    } catch (_) {}

    try {
      const dividasCol = app.findCollectionByNameOrId('dividas')
      app.delete(dividasCol)
    } catch (_) {}
  },
)
