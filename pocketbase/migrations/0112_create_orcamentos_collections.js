migrate(
  (app) => {
    const pessoasId = app.findCollectionByNameOrId('pessoas').id
    const canaisId = app.findCollectionByNameOrId('prec_canais').id
    const kitTemasId = app.findCollectionByNameOrId('kit_temas').id
    const kitModelosId = app.findCollectionByNameOrId('kit_modelos').id

    // 1. Coleção orcamentos
    // Regra de visualização (viewRule): autenticado OU anônimo informando o token exato na query (@request.query.token != '' && public_token != '' && public_token = @request.query.token && link_publico_ativo = true)
    // listRule é APENAS para usuários autenticados, nunca expondo a lista inteira publicamente!
    const orcamentosCol = new Collection({
      name: 'orcamentos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule:
        "@request.auth.id != '' || (public_token != '' && link_publico_ativo = true && @request.query.token = public_token)",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'codigo', type: 'text', required: true },
        { name: 'titulo', type: 'text' },
        {
          name: 'cliente_pessoa',
          type: 'relation',
          required: false,
          collectionId: pessoasId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'cliente_nome', type: 'text', required: true },
        { name: 'cliente_whatsapp', type: 'text' },
        { name: 'data_orcamento', type: 'date', required: true },
        { name: 'validade_dias', type: 'number', required: false, min: 1 },
        { name: 'validade_data', type: 'date' },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['rascunho', 'enviado', 'aceito', 'recusado'],
          maxSelect: 1,
        },
        {
          name: 'canais_comparados',
          type: 'relation',
          required: false,
          collectionId: canaisId,
          cascadeDelete: false,
        },
        {
          name: 'tema',
          type: 'relation',
          required: false,
          collectionId: kitTemasId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'tema_nome', type: 'text' },
        { name: 'cor', type: 'text' },
        { name: 'observacoes', type: 'text' },
        { name: 'public_token', type: 'text' },
        { name: 'link_publico_ativo', type: 'bool' },
        { name: 'totais_por_canal', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_orcamentos_codigo ON orcamentos (codigo)',
        'CREATE INDEX idx_orcamentos_public_token ON orcamentos (public_token)',
        'CREATE INDEX idx_orcamentos_status ON orcamentos (status)',
        'CREATE INDEX idx_orcamentos_data ON orcamentos (data_orcamento)',
      ],
    })
    app.save(orcamentosCol)

    const orcamentosId = app.findCollectionByNameOrId('orcamentos').id

    // 2. Coleção orcamento_itens
    // viewRule e listRule: autenticados OU pelo token do orçamento pai passado em query
    const orcamentoItensCol = new Collection({
      name: 'orcamento_itens',
      type: 'base',
      listRule:
        "@request.auth.id != '' || (orcamento.public_token != '' && orcamento.link_publico_ativo = true && @request.query.token = orcamento.public_token)",
      viewRule:
        "@request.auth.id != '' || (orcamento.public_token != '' && orcamento.link_publico_ativo = true && @request.query.token = orcamento.public_token)",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'orcamento',
          type: 'relation',
          required: true,
          collectionId: orcamentosId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'modelo',
          type: 'relation',
          required: false,
          collectionId: kitModelosId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'modelo_nome', type: 'text', required: true },
        { name: 'modelo_codigo', type: 'text' },
        { name: 'quantidade', type: 'number', required: true, min: 1 },
        { name: 'precos_canais', type: 'json' },
        { name: 'fretes_canais', type: 'json' },
        { name: 'ordem', type: 'number', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_orc_itens_orcamento ON orcamento_itens (orcamento)',
        'CREATE INDEX idx_orc_itens_ordem ON orcamento_itens (ordem)',
      ],
    })
    app.save(orcamentoItensCol)
  },
  (app) => {
    try {
      const itensCol = app.findCollectionByNameOrId('orcamento_itens')
      app.delete(itensCol)
    } catch (_) {}
    try {
      const orcCol = app.findCollectionByNameOrId('orcamentos')
      app.delete(orcCol)
    } catch (_) {}
  },
)
