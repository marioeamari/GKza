migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('orcamentos')
    if (!col.fields.getByName('fretes')) {
      col.fields.add(
        new JSONField({
          name: 'fretes',
          maxSize: 2000000,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('orcamentos')
    const field = col.fields.getByName('fretes')
    if (field) {
      col.fields.removeByName('fretes')
      app.save(col)
    }
  },
)
