migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const canWrite = "@request.auth.id != '' && @request.auth.role != 'visualizador'"
    const canDelete = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"
    const marketplaceContas = app.findCollectionByNameOrId('marketplace_contas')
    const lancamentos = app.findCollectionByNameOrId('lancamentos')

    const vendas = new Collection({
      name: 'vendas',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: canWrite,
      updateRule: canWrite,
      deleteRule: canDelete,
      fields: [
        { name: 'pedido_id', type: 'text', required: true, max: 120 },
        {
          name: 'marketplace_conta',
          type: 'relation',
          required: true,
          collectionId: marketplaceContas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'data', type: 'date', required: true },
        { name: 'valor_bruto', type: 'number', required: true, min: 0 },
        { name: 'comissao', type: 'number', required: true, min: 0 },
        { name: 'taxas', type: 'number', required: false, min: 0 },
        { name: 'valor_liquido', type: 'number', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pendente', 'paga', 'repassada'],
        },
        {
          name: 'lancamento',
          type: 'relation',
          required: false,
          collectionId: lancamentos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_vendas_data ON vendas (data)',
        'CREATE INDEX idx_vendas_status ON vendas (status)',
        'CREATE INDEX idx_vendas_marketplace_conta ON vendas (marketplace_conta)',
        'CREATE INDEX idx_vendas_pedido_id ON vendas (pedido_id)',
      ],
    })
    app.save(vendas)

    const repasses = new Collection({
      name: 'repasses',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: canWrite,
      updateRule: canWrite,
      deleteRule: canDelete,
      fields: [
        {
          name: 'marketplace_conta',
          type: 'relation',
          required: true,
          collectionId: marketplaceContas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'periodo_inicio', type: 'date', required: true },
        { name: 'periodo_fim', type: 'date', required: true },
        { name: 'valor', type: 'number', required: true, min: 0.01 },
        { name: 'data_prevista', type: 'date', required: true },
        { name: 'data_realizada', type: 'date', required: false },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['previsto', 'realizado'],
        },
        {
          name: 'lancamento',
          type: 'relation',
          required: false,
          collectionId: lancamentos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_repasses_status ON repasses (status)',
        'CREATE INDEX idx_repasses_data_prevista ON repasses (data_prevista)',
        'CREATE INDEX idx_repasses_marketplace_conta ON repasses (marketplace_conta)',
      ],
    })
    app.save(repasses)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('repasses'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('vendas'))
    } catch (_) {}
  },
)
