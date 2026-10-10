migrate(
  (app) => {
    const kitPedidos = app.findCollectionByNameOrId('kit_pedidos')

    if (!kitPedidos.fields.getByName('codigo_rastreio')) {
      kitPedidos.fields.add(
        new TextField({
          name: 'codigo_rastreio',
          required: false,
          max: 120,
        }),
      )
    }

    app.save(kitPedidos)

    // Adiciona índice para busca rápida por codigo_rastreio
    try {
      kitPedidos.addIndex('idx_kit_pedidos_rastreio', false, 'codigo_rastreio', '')
      app.save(kitPedidos)
    } catch (e) {
      console.log('Aviso ao criar índice de codigo_rastreio em kit_pedidos:', e)
    }

    // Também adicionamos em kit_historico_separacao para rastreabilidade de ponta a ponta
    try {
      const kitHistorico = app.findCollectionByNameOrId('kit_historico_separacao')
      if (!kitHistorico.fields.getByName('codigo_rastreio')) {
        kitHistorico.fields.add(
          new TextField({
            name: 'codigo_rastreio',
            required: false,
            max: 120,
          }),
        )
        app.save(kitHistorico)
      }
    } catch (e) {
      console.log('Aviso ao adicionar codigo_rastreio em kit_historico_separacao:', e)
    }
  },
  (app) => {
    try {
      const kitPedidos = app.findCollectionByNameOrId('kit_pedidos')
      try {
        kitPedidos.removeIndex('idx_kit_pedidos_rastreio')
      } catch (_) {}
      if (kitPedidos.fields.getByName('codigo_rastreio')) {
        kitPedidos.fields.removeByName('codigo_rastreio')
      }
      app.save(kitPedidos)
    } catch (_) {}

    try {
      const kitHistorico = app.findCollectionByNameOrId('kit_historico_separacao')
      if (kitHistorico.fields.getByName('codigo_rastreio')) {
        kitHistorico.fields.removeByName('codigo_rastreio')
      }
      app.save(kitHistorico)
    } catch (_) {}
  },
)
