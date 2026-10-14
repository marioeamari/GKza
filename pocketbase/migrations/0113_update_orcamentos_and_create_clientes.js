migrate(
  (app) => {
    // 1. Criar a coleção 'clientes' própria do módulo de orçamentos
    // Campos: nome (required), tipo (select pessoa_fisica | pessoa_juridica), documento (opcional), whatsapp, email, telefone, observacoes
    const clientesCol = new Collection({
      name: 'clientes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'nome', type: 'text', required: true },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['pessoa_fisica', 'pessoa_juridica'],
          maxSelect: 1,
        },
        { name: 'documento', type: 'text' },
        { name: 'whatsapp', type: 'text' },
        { name: 'email', type: 'email' },
        { name: 'telefone', type: 'text' },
        { name: 'observacoes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_clientes_nome ON clientes (nome)',
        'CREATE INDEX idx_clientes_tipo ON clientes (tipo)',
        'CREATE INDEX idx_clientes_documento ON clientes (documento)',
      ],
    })
    app.save(clientesCol)

    const clientesId = app.findCollectionByNameOrId('clientes').id

    // 2. Atualizar 'orcamentos':
    // a) Atualizar listRule para incluir regra de token público quando deslogado
    // b) Adicionar campo relation 'cliente' apontando para a coleção 'clientes'
    const orcamentosCol = app.findCollectionByNameOrId('orcamentos')
    orcamentosCol.listRule =
      "@request.auth.id != '' || (public_token != '' && link_publico_ativo = true && @request.query.token = public_token)"

    if (!orcamentosCol.fields.getByName('cliente')) {
      orcamentosCol.fields.add(
        new RelationField({
          name: 'cliente',
          required: false,
          collectionId: clientesId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    app.save(orcamentosCol)

    // 3. Atualizar 'orcamento_itens':
    // Adicionar campo json 'produtos_canais' para gravar o produto vinculado por canal no item
    const itensCol = app.findCollectionByNameOrId('orcamento_itens')
    if (!itensCol.fields.getByName('produtos_canais')) {
      itensCol.fields.add(
        new JSONField({
          name: 'produtos_canais',
          required: false,
        }),
      )
    }
    app.save(itensCol)
  },
  (app) => {
    try {
      const itensCol = app.findCollectionByNameOrId('orcamento_itens')
      itensCol.fields.removeByName('produtos_canais')
      app.save(itensCol)
    } catch (_) {}

    try {
      const orcamentosCol = app.findCollectionByNameOrId('orcamentos')
      orcamentosCol.listRule = "@request.auth.id != ''"
      orcamentosCol.fields.removeByName('cliente')
      app.save(orcamentosCol)
    } catch (_) {}

    try {
      const clientesCol = app.findCollectionByNameOrId('clientes')
      app.delete(clientesCol)
    } catch (_) {}
  },
)
