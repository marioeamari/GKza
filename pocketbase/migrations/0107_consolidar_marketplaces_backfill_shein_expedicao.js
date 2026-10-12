migrate(
  (app) => {
    // (1) BACKFILL: garantir que SHEIN existe na coleção marketplaces (slug 'shein', cor #000000)
    const marketplacesCol = app.findCollectionByNameOrId('marketplaces')
    let sheinMp
    try {
      sheinMp = app.findFirstRecordByData('marketplaces', 'slug', 'shein')
    } catch (_) {
      sheinMp = null
    }

    if (!sheinMp) {
      sheinMp = new Record(marketplacesCol)
      sheinMp.set('nome', 'SHEIN')
      sheinMp.set('slug', 'shein')
      sheinMp.set('cor', '#000000')
      app.save(sheinMp)
    } else {
      let mudou = false
      if (sheinMp.get('cor') !== '#000000') {
        sheinMp.set('cor', '#000000')
        mudou = true
      }
      if (sheinMp.get('nome') !== 'SHEIN') {
        sheinMp.set('nome', 'SHEIN')
        mudou = true
      }
      if (mudou) {
        app.save(sheinMp)
      }
    }

    // Vincular o canal SHEIN (vcvf7xu1pjkwpys) ao registro de marketplace
    try {
      const canalShein = app.findRecordById('prec_canais', 'vcvf7xu1pjkwpys')
      if (canalShein) {
        canalShein.set('marketplace', sheinMp.id)
        if (canalShein.get('tipo') !== 'marketplace') {
          canalShein.set('tipo', 'marketplace')
        }
        app.save(canalShein)
      }
    } catch (e) {
      console.log('Aviso ao vincular canal SHEIN por id:', e)
    }

    // Garantir que todos os canais com nome SHEIN estejam vinculados
    try {
      const canaisShein = app.findRecordsByFilter(
        'prec_canais',
        "nome ~ 'SHEIN' && (marketplace = '' || marketplace = null)",
      )
      for (const c of canaisShein) {
        c.set('marketplace', sheinMp.id)
        c.set('tipo', 'marketplace')
        app.save(c)
      }
    } catch (_) {}

    // (2) EXPEDIÇÃO:
    // Limpar o histórico atual de separação conforme autorizado explicitamente pelo usuário
    try {
      app.db().newQuery('DELETE FROM kit_historico_separacao').execute()
    } catch (e) {
      console.log('Aviso ao limpar kit_historico_separacao:', e)
    }

    // Substituir o texto livre 'marketplace' em kit_historico_separacao por um campo Relation
    // apontando para a coleção marketplaces
    const histCol = app.findCollectionByNameOrId('kit_historico_separacao')
    const existingField = histCol.fields.getByName('marketplace')
    if (existingField) {
      histCol.fields.removeByName('marketplace')
    }
    histCol.fields.add(
      new RelationField({
        name: 'marketplace',
        collectionId: marketplacesCol.id,
        maxSelect: 1,
        required: false,
      }),
    )
    app.save(histCol)

    // Ajustar kit_pedidos para também relacionar com marketplaces caso ainda seja texto
    // (kit_pedidos está vazio conforme informado na tarefa, mas garante a mesma consistência)
    try {
      const pedCol = app.findCollectionByNameOrId('kit_pedidos')
      const existingPedField = pedCol.fields.getByName('marketplace')
      if (existingPedField && existingPedField.type !== 'relation') {
        pedCol.fields.removeByName('marketplace')
        pedCol.fields.add(
          new RelationField({
            name: 'marketplace',
            collectionId: marketplacesCol.id,
            maxSelect: 1,
            required: false,
          }),
        )
        app.save(pedCol)
      }
    } catch (e) {
      console.log('Aviso ao atualizar kit_pedidos marketplace field:', e)
    }
  },
  (app) => {
    // Rollback conservador
    try {
      const histCol = app.findCollectionByNameOrId('kit_historico_separacao')
      histCol.fields.removeByName('marketplace')
      histCol.fields.add(
        new TextField({
          name: 'marketplace',
          required: false,
          max: 80,
        }),
      )
      app.save(histCol)
    } catch (_) {}

    try {
      const pedCol = app.findCollectionByNameOrId('kit_pedidos')
      pedCol.fields.removeByName('marketplace')
      pedCol.fields.add(
        new TextField({
          name: 'marketplace',
          required: false,
          max: 80,
        }),
      )
      app.save(pedCol)
    } catch (_) {}
  },
)
