migrate(
  (app) => {
    const kitPedidos = app.findCollectionByNameOrId('kit_pedidos')

    // Campo estruturado: Pedido especial do cliente
    if (!kitPedidos.fields.getByName('pedido_especial')) {
      kitPedidos.fields.add(
        new TextField({
          name: 'pedido_especial',
          required: false,
          max: 2000,
        }),
      )
    }

    // Flag indicando se há pedido especial ativo / pendente de triagem
    if (!kitPedidos.fields.getByName('tem_pedido_especial')) {
      kitPedidos.fields.add(
        new BoolField({
          name: 'tem_pedido_especial',
          required: false,
        }),
      )
    }

    // Status da triagem do pedido especial (preparado para agente nativo ou triagem manual)
    if (!kitPedidos.fields.getByName('triagem_pedido_especial')) {
      kitPedidos.fields.add(
        new SelectField({
          name: 'triagem_pedido_especial',
          required: false,
          values: ['sem_pedido_especial', 'pendente_analise', 'confirmado_chat', 'descartado'],
          maxSelect: 1,
        }),
      )
    }

    // Origem do pedido especial (manual, colagem_shopee, agente_ia, chat_shopee)
    if (!kitPedidos.fields.getByName('origem_pedido_especial')) {
      kitPedidos.fields.add(
        new SelectField({
          name: 'origem_pedido_especial',
          required: false,
          values: ['manual', 'colagem_shopee', 'agente_ia', 'chat_shopee'],
          maxSelect: 1,
        }),
      )
    }

    // Data de expedição do dia / data do pedido
    if (!kitPedidos.fields.getByName('data_expedicao')) {
      kitPedidos.fields.add(
        new DateField({
          name: 'data_expedicao',
          required: false,
        }),
      )
    }

    // Variação original do anúncio (ex: "5 modelos sortidos" ou "Pacote 40 un")
    if (!kitPedidos.fields.getByName('variacao_anuncio')) {
      kitPedidos.fields.add(
        new TextField({
          name: 'variacao_anuncio',
          required: false,
          max: 500,
        }),
      )
    }

    // Vínculo opcional direto com prec_produtos (quando reconhecido pelo catálogo)
    try {
      const precProdutos = app.findCollectionByNameOrId('prec_produtos')
      if (!kitPedidos.fields.getByName('produto_referencia')) {
        kitPedidos.fields.add(
          new RelationField({
            name: 'produto_referencia',
            required: false,
            collectionId: precProdutos.id,
            maxSelect: 1,
            cascadeDelete: false,
          }),
        )
      }
    } catch (e) {
      console.log('Aviso ao vincular prec_produtos em kit_pedidos:', e)
    }

    // ID externo da Shopee (para buscas e webchat)
    if (!kitPedidos.fields.getByName('shopee_order_id')) {
      kitPedidos.fields.add(
        new TextField({
          name: 'shopee_order_id',
          required: false,
          max: 100,
        }),
      )
    }

    app.save(kitPedidos)

    // Também adicionamos os campos correspondentes no histórico de separação para rastreabilidade completa
    try {
      const kitHistorico = app.findCollectionByNameOrId('kit_historico_separacao')
      if (!kitHistorico.fields.getByName('pedido_especial')) {
        kitHistorico.fields.add(
          new TextField({
            name: 'pedido_especial',
            required: false,
            max: 2000,
          }),
        )
      }
      if (!kitHistorico.fields.getByName('shopee_order_id')) {
        kitHistorico.fields.add(
          new TextField({
            name: 'shopee_order_id',
            required: false,
            max: 100,
          }),
        )
      }
      app.save(kitHistorico)
    } catch (e) {
      console.log('Aviso ao atualizar kit_historico_separacao:', e)
    }
  },
  (app) => {
    // Reversão
    try {
      const kitPedidos = app.findCollectionByNameOrId('kit_pedidos')
      const fieldsToRemove = [
        'pedido_especial',
        'tem_pedido_especial',
        'triagem_pedido_especial',
        'origem_pedido_especial',
        'data_expedicao',
        'variacao_anuncio',
        'produto_referencia',
        'shopee_order_id',
      ]
      fieldsToRemove.forEach((f) => {
        if (kitPedidos.fields.getByName(f)) {
          kitPedidos.fields.removeByName(f)
        }
      })
      app.save(kitPedidos)
    } catch (_) {}
  },
)
