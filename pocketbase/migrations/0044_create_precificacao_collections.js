migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    const empresas = app.findCollectionByNameOrId('empresas')

    // 1. prec_produtos
    const precProdutos = new Collection({
      name: 'prec_produtos',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'sku', type: 'text', required: true, max: 100 },
        { name: 'nome', type: 'text', required: true, max: 200 },
        { name: 'marca', type: 'text', required: false, max: 100 },
        { name: 'categoria', type: 'text', required: false, max: 100 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['fabricacao_propria', 'revenda', 'kit'],
        },
        {
          name: 'imagem',
          type: 'file',
          required: false,
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        },
        { name: 'unidade', type: 'text', required: false, max: 20 },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['ativo', 'inativo', 'rascunho'],
        },
        { name: 'peso_g', type: 'number', required: false, min: 0 },
        { name: 'dimensao_comprimento_cm', type: 'number', required: false, min: 0 },
        { name: 'dimensao_largura_cm', type: 'number', required: false, min: 0 },
        { name: 'dimensao_altura_cm', type: 'number', required: false, min: 0 },
        {
          name: 'empresa',
          type: 'relation',
          required: false,
          collectionId: empresas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'sku_por_canal', type: 'json', required: false },
        { name: 'composicao', type: 'json', required: false },
        { name: 'custo_aquisicao_unitario', type: 'number', required: false, min: 0 },
        { name: 'despesas_compra', type: 'json', required: false },
        { name: 'custo_adicional_embalagem', type: 'number', required: false, min: 0 },
        { name: 'custo_etiqueta', type: 'number', required: false, min: 0 },
        { name: 'perda_pct', type: 'number', required: false, min: 0, max: 100 },
        { name: 'qtd_produzida', type: 'number', required: false, min: 0 },
        { name: 'qtd_por_kit', type: 'number', required: false, min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_prec_prod_sku ON prec_produtos (sku)',
        'CREATE INDEX idx_prec_prod_empresa ON prec_produtos (empresa)',
        'CREATE INDEX idx_prec_prod_status ON prec_produtos (status)',
      ],
    })
    app.save(precProdutos)

    // 2. prec_kits
    const precKits = new Collection({
      name: 'prec_kits',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'produto_pai',
          type: 'relation',
          required: true,
          collectionId: precProdutos.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'itens', type: 'json', required: false },
        { name: 'custos_adicionais', type: 'json', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_prec_kits_pai ON prec_kits (produto_pai)'],
    })
    app.save(precKits)

    // 3. prec_canais
    const precCanais = new Collection({
      name: 'prec_canais',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 120 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['site_proprio', 'marketplace'],
        },
        { name: 'ativo', type: 'bool', required: false },
        { name: 'programas_frete', type: 'json', required: false },
        { name: 'formas_pagamento', type: 'json', required: false },
        { name: 'vigencia', type: 'text', required: false, max: 100 },
        { name: 'cor', type: 'text', required: false, max: 30 },
        { name: 'ordem', type: 'number', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_prec_canais_nome ON prec_canais (nome)',
        'CREATE INDEX idx_prec_canais_ativo ON prec_canais (ativo)',
      ],
    })
    app.save(precCanais)

    // 4. prec_canal_modalidades
    const precCanalModalidades = new Collection({
      name: 'prec_canal_modalidades',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'canal',
          type: 'relation',
          required: true,
          collectionId: precCanais.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'nome', type: 'text', required: true, max: 120 },
        { name: 'formas_pagamento', type: 'json', required: false },
        { name: 'prazo_recebimento_dias', type: 'number', required: false, min: 0 },
        { name: 'ativo', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_prec_mod_canal ON prec_canal_modalidades (canal)'],
    })
    app.save(precCanalModalidades)

    // 5. prec_taxas
    const precTaxas = new Collection({
      name: 'prec_taxas',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'canal',
          type: 'relation',
          required: true,
          collectionId: precCanais.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'modalidade',
          type: 'relation',
          required: false,
          collectionId: precCanalModalidades.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'nome', type: 'text', required: true, max: 160 },
        {
          name: 'base_calculo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: [
            'preco_anunciado',
            'preco_pago_cliente',
            'prestacao_fixa',
            'peso',
            'faixa_preco',
          ],
        },
        {
          name: 'tipo_valor',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['percentual', 'fixo'],
        },
        { name: 'valor', type: 'number', required: true },
        { name: 'condicao', type: 'json', required: false },
        {
          name: 'responsavel',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['vendedor', 'marketplace'],
        },
        {
          name: 'tipo_regra',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: [
            'comissao',
            'tarifa_fixa',
            'transacao',
            'frete',
            'subsidio',
            'servico',
            'operacao',
            'afiliado',
            'campanha',
            'pagamento',
            'cupom',
            'desconto_pix',
            'cashback',
            'anuncios',
            'reserva_devolucao',
          ],
        },
        {
          name: 'financiado_por',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['vendedor', 'marketplace'],
        },
        { name: 'vigencia_inicio', type: 'date', required: false },
        { name: 'vigencia_fim', type: 'date', required: false },
        {
          name: 'status_conferencia',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pendente_conferencia', 'conferido'],
        },
        { name: 'data_conferencia', type: 'date', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_prec_taxas_canal ON prec_taxas (canal)',
        'CREATE INDEX idx_prec_taxas_mod ON prec_taxas (modalidade)',
        'CREATE INDEX idx_prec_taxas_status ON prec_taxas (status_conferencia)',
      ],
    })
    app.save(precTaxas)

    // 6. prec_perfis_tributarios
    const precPerfisTributarios = new Collection({
      name: 'prec_perfis_tributarios',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'escopo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['empresa', 'produto', 'operacao'],
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
          name: 'produto',
          type: 'relation',
          required: false,
          collectionId: precProdutos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'aliquota_das_pct', type: 'number', required: false, min: 0, max: 100 },
        { name: 'aliquota_icms_pct', type: 'number', required: false, min: 0, max: 100 },
        { name: 'outros', type: 'json', required: false },
        { name: 'vigencia', type: 'text', required: false, max: 100 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_prec_trib_empresa ON prec_perfis_tributarios (empresa)',
        'CREATE INDEX idx_prec_trib_prod ON prec_perfis_tributarios (produto)',
      ],
    })
    app.save(precPerfisTributarios)

    // 7. prec_precificacoes
    const precPrecificacoes = new Collection({
      name: 'prec_precificacoes',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'produto',
          type: 'relation',
          required: true,
          collectionId: precProdutos.id,
          cascadeDelete: true,
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
          name: 'canal',
          type: 'relation',
          required: true,
          collectionId: precCanais.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'modalidade',
          type: 'relation',
          required: false,
          collectionId: precCanalModalidades.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'versao', type: 'number', required: true, min: 1 },
        { name: 'premissas', type: 'json', required: true },
        { name: 'resultado', type: 'json', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['rascunho', 'aprovada', 'desatualizada'],
        },
        { name: 'custo_snapshot', type: 'json', required: false },
        { name: 'taxas_snapshot', type: 'json', required: false },
        {
          name: 'aprovado_por',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'aprovado_em', type: 'date', required: false },
        { name: 'preco_aprovado', type: 'number', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_prec_sim_prod ON prec_precificacoes (produto)',
        'CREATE INDEX idx_prec_sim_canal ON prec_precificacoes (canal)',
        'CREATE INDEX idx_prec_sim_status ON prec_precificacoes (status)',
      ],
    })
    app.save(precPrecificacoes)
  },
  (app) => {
    const list = [
      'prec_precificacoes',
      'prec_perfis_tributarios',
      'prec_taxas',
      'prec_canal_modalidades',
      'prec_canais',
      'prec_kits',
      'prec_produtos',
    ]
    for (let i = 0; i < list.length; i++) {
      try {
        app.delete(app.findCollectionByNameOrId(list[i]))
      } catch (_) {}
    }
  },
)
