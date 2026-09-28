migrate(
  (app) => {
    const marketplacesCol = app.findCollectionByNameOrId('marketplaces')
    const precCanaisCol = app.findCollectionByNameOrId('prec_canais')

    if (!precCanaisCol.fields.getByName('marketplace')) {
      precCanaisCol.fields.add(
        new RelationField({
          name: 'marketplace',
          collectionId: marketplacesCol.id,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(precCanaisCol)
    }

    // Vincular automaticamente os canais existentes por correspondência de nome/slug se existirem
    try {
      const shopeeCanal = app.findFirstRecordByData('prec_canais', 'nome', 'Shopee')
      const shopeeMp = app.findFirstRecordByData('marketplaces', 'slug', 'shopee')
      if (shopeeCanal && shopeeMp) {
        shopeeCanal.set('marketplace', shopeeMp.id)
        app.save(shopeeCanal)
      }
    } catch (_) {}

    // Adicionar campo json itens na coleção vendas para guardar linhas de itens da venda do dia
    const vendasCol = app.findCollectionByNameOrId('vendas')
    if (!vendasCol.fields.getByName('itens')) {
      vendasCol.fields.add(
        new JSONField({
          name: 'itens',
          required: false,
        }),
      )
      app.save(vendasCol)
    }
  },
  (app) => {
    const precCanaisCol = app.findCollectionByNameOrId('prec_canais')
    if (precCanaisCol.fields.getByName('marketplace')) {
      precCanaisCol.fields.removeByName('marketplace')
      app.save(precCanaisCol)
    }

    const vendasCol = app.findCollectionByNameOrId('vendas')
    if (vendasCol.fields.getByName('itens')) {
      vendasCol.fields.removeByName('itens')
      app.save(vendasCol)
    }
  },
)
