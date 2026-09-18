migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"
    const canWriteTransactions = "@request.auth.id != '' && @request.auth.role != 'visualizador'"

    const users = app.findCollectionByNameOrId('users')
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: true,
          maxSelect: 1,
          values: ['admin', 'gestor', 'financeiro', 'visualizador'],
        }),
      )
    }
    if (!users.fields.getByName('phone')) {
      users.fields.add(new TextField({ name: 'phone', required: false, max: 30 }))
    }
    users.listRule = authenticated
    users.viewRule = authenticated
    users.createRule = null
    users.updateRule = "@request.auth.id = id || @request.auth.role = 'admin'"
    users.deleteRule = "@request.auth.role = 'admin'"
    app.save(users)

    const empresas = new Collection({
      name: 'empresas',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome_fantasia', type: 'text', required: true, max: 180 },
        { name: 'razao_social', type: 'text', required: true, max: 220 },
        { name: 'cnpj', type: 'text', required: true, max: 18 },
        { name: 'email', type: 'email', required: false },
        { name: 'telefone', type: 'text', required: false, max: 30 },
        { name: 'endereco', type: 'text', required: false, max: 500 },
        { name: 'observacoes', type: 'text', required: false, max: 2000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_empresas_cnpj ON empresas (cnpj)',
        'CREATE INDEX idx_empresas_nome_fantasia ON empresas (nome_fantasia)',
      ],
    })
    app.save(empresas)

    const pessoas = new Collection({
      name: 'pessoas',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 180 },
        { name: 'cpf', type: 'text', required: true, max: 14 },
        { name: 'email', type: 'email', required: false },
        { name: 'telefone', type: 'text', required: false, max: 30 },
        { name: 'observacoes', type: 'text', required: false, max: 2000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_pessoas_cpf ON pessoas (cpf)',
        'CREATE INDEX idx_pessoas_nome ON pessoas (nome)',
      ],
    })
    app.save(pessoas)

    const contas = new Collection({
      name: 'contas',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 160 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['bancaria', 'caixa', 'cartao', 'marketplace'],
        },
        { name: 'saldo_inicial', type: 'number', required: false },
        { name: 'cor', type: 'text', required: false, max: 20 },
        { name: 'ativa', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_contas_tipo ON contas (tipo)'],
    })
    app.save(contas)

    const categorias = new Collection({
      name: 'categorias',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 160 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['receita', 'despesa'],
        },
        { name: 'cor', type: 'text', required: false, max: 20 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_categorias_tipo_nome ON categorias (tipo, nome)'],
    })
    app.save(categorias)

    const marketplaces = new Collection({
      name: 'marketplaces',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 160 },
        { name: 'slug', type: 'text', required: true, max: 80 },
        { name: 'cor', type: 'text', required: true, max: 20 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_marketplaces_slug ON marketplaces (slug)'],
    })
    app.save(marketplaces)

    const marketplaceContas = new Collection({
      name: 'marketplace_contas',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'apelido', type: 'text', required: true, max: 160 },
        {
          name: 'marketplace',
          type: 'relation',
          required: true,
          collectionId: marketplaces.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'conta',
          type: 'relation',
          required: true,
          collectionId: contas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'comissao_percentual', type: 'number', required: true, min: 0, max: 100 },
        { name: 'ativa', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_marketplace_contas_marketplace ON marketplace_contas (marketplace)',
      ],
    })
    app.save(marketplaceContas)

    const lancamentos = new Collection({
      name: 'lancamentos',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: canWriteTransactions,
      updateRule: canWriteTransactions,
      deleteRule: adminOrManager,
      fields: [
        { name: 'descricao', type: 'text', required: true, max: 240 },
        { name: 'valor', type: 'number', required: true, min: 0.01 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['receita', 'despesa'],
        },
        { name: 'data', type: 'date', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pendente', 'pago'],
        },
        {
          name: 'conta',
          type: 'relation',
          required: true,
          collectionId: contas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'categoria',
          type: 'relation',
          required: true,
          collectionId: categorias.id,
          cascadeDelete: false,
          maxSelect: 1,
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
        { name: 'observacoes', type: 'text', required: false, max: 2000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_lancamentos_data ON lancamentos (data)',
        'CREATE INDEX idx_lancamentos_tipo ON lancamentos (tipo)',
        'CREATE INDEX idx_lancamentos_status ON lancamentos (status)',
        'CREATE INDEX idx_lancamentos_conta ON lancamentos (conta)',
        'CREATE INDEX idx_lancamentos_categoria ON lancamentos (categoria)',
      ],
    })
    app.save(lancamentos)
  },
  (app) => {
    const names = [
      'lancamentos',
      'marketplace_contas',
      'marketplaces',
      'categorias',
      'contas',
      'pessoas',
      'empresas',
    ]
    for (let i = 0; i < names.length; i++) {
      try {
        app.delete(app.findCollectionByNameOrId(names[i]))
      } catch (_) {}
    }
    const users = app.findCollectionByNameOrId('users')
    try {
      users.fields.removeByName('role')
    } catch (_) {}
    try {
      users.fields.removeByName('phone')
    } catch (_) {}
    users.listRule = 'id = @request.auth.id'
    users.viewRule = 'id = @request.auth.id'
    users.createRule = ''
    users.updateRule = 'id = @request.auth.id'
    users.deleteRule = 'id = @request.auth.id'
    app.save(users)
  },
)
