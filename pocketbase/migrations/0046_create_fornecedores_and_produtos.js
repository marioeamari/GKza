migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    // 1. Coleção fornecedores
    const fornecedores = new Collection({
      name: 'fornecedores',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'razao_social', type: 'text', required: true, max: 220 },
        { name: 'nome_fantasia', type: 'text', required: true, max: 180 },
        { name: 'cnpj', type: 'text', required: false, max: 18 },
        { name: 'cpf', type: 'text', required: false, max: 14 },
        { name: 'inscricao_estadual', type: 'text', required: false, max: 30 },
        { name: 'email', type: 'email', required: false },
        { name: 'telefone', type: 'text', required: false, max: 30 },
        { name: 'contato_nome', type: 'text', required: false, max: 120 },
        { name: 'endereco', type: 'text', required: false, max: 500 },
        { name: 'cep', type: 'text', required: false, max: 10 },
        { name: 'cidade', type: 'text', required: false, max: 120 },
        { name: 'uf', type: 'text', required: false, max: 2 },
        { name: 'site', type: 'text', required: false, max: 250 },
        { name: 'prazo_entrega_dias', type: 'number', required: false, min: 0 },
        { name: 'condicao_pagamento', type: 'text', required: false, max: 120 },
        { name: 'observacoes', type: 'text', required: false, max: 3000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_fornecedores_nome_fantasia ON fornecedores (nome_fantasia)',
        'CREATE INDEX idx_fornecedores_razao_social ON fornecedores (razao_social)',
        'CREATE INDEX idx_fornecedores_cnpj ON fornecedores (cnpj)',
      ],
    })
    app.save(fornecedores)

    // 2. Coleção fornecedores_produtos
    const fornecedoresProdutos = new Collection({
      name: 'fornecedores_produtos',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'fornecedor',
          type: 'relation',
          required: true,
          collectionId: fornecedores.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'descricao', type: 'text', required: true, max: 250 },
        { name: 'sku_fornecedor', type: 'text', required: false, max: 100 },
        { name: 'codigo_barras', type: 'text', required: false, max: 50 },
        { name: 'marca', type: 'text', required: false, max: 100 },
        { name: 'categoria', type: 'text', required: false, max: 100 },
        { name: 'unidade', type: 'text', required: false, max: 20 },
        { name: 'preco_custo_unitario', type: 'number', required: true, min: 0 },
        { name: 'preco_ultima_compra', type: 'number', required: false, min: 0 },
        { name: 'embalagem', type: 'text', required: false, max: 100 },
        { name: 'peso_g', type: 'number', required: false, min: 0 },
        { name: 'comprimento_cm', type: 'number', required: false, min: 0 },
        { name: 'largura_cm', type: 'number', required: false, min: 0 },
        { name: 'altura_cm', type: 'number', required: false, min: 0 },
        { name: 'moeda', type: 'text', required: false, max: 10 },
        { name: 'ncm', type: 'text', required: false, max: 20 },
        { name: 'observacoes', type: 'text', required: false, max: 2000 },
        { name: 'ativo', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_forn_prod_fornecedor ON fornecedores_produtos (fornecedor)',
        'CREATE INDEX idx_forn_prod_sku ON fornecedores_produtos (sku_fornecedor)',
        'CREATE INDEX idx_forn_prod_descricao ON fornecedores_produtos (descricao)',
      ],
    })
    app.save(fornecedoresProdutos)

    // 3. Atualizar prec_produtos para ter relation opcional com fornecedor e fornecedor_produto, codigo_barras e embalagem se não existirem
    try {
      const precProdCol = app.findCollectionByNameOrId('prec_produtos')
      if (!precProdCol.fields.getByName('fornecedor')) {
        precProdCol.fields.add(
          new RelationField({
            name: 'fornecedor',
            required: false,
            collectionId: fornecedores.id,
            cascadeDelete: false,
            maxSelect: 1,
          }),
        )
      }
      if (!precProdCol.fields.getByName('fornecedor_produto')) {
        precProdCol.fields.add(
          new RelationField({
            name: 'fornecedor_produto',
            required: false,
            collectionId: fornecedoresProdutos.id,
            cascadeDelete: false,
            maxSelect: 1,
          }),
        )
      }
      if (!precProdCol.fields.getByName('codigo_barras')) {
        precProdCol.fields.add(
          new TextField({
            name: 'codigo_barras',
            required: false,
            max: 50,
          }),
        )
      }
      if (!precProdCol.fields.getByName('embalagem')) {
        precProdCol.fields.add(
          new TextField({
            name: 'embalagem',
            required: false,
            max: 100,
          }),
        )
      }
      app.save(precProdCol)
    } catch (_) {}
  },
  (app) => {
    try {
      const precProdCol = app.findCollectionByNameOrId('prec_produtos')
      if (precProdCol.fields.getByName('fornecedor_produto')) {
        precProdCol.fields.removeByName('fornecedor_produto')
      }
      if (precProdCol.fields.getByName('fornecedor')) {
        precProdCol.fields.removeByName('fornecedor')
      }
      if (precProdCol.fields.getByName('codigo_barras')) {
        precProdCol.fields.removeByName('codigo_barras')
      }
      if (precProdCol.fields.getByName('embalagem')) {
        precProdCol.fields.removeByName('embalagem')
      }
      app.save(precProdCol)
    } catch (_) {}

    try {
      app.delete(app.findCollectionByNameOrId('fornecedores_produtos'))
    } catch (_) {}

    try {
      app.delete(app.findCollectionByNameOrId('fornecedores'))
    } catch (_) {}
  },
)
