migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('prec_canal_modalidades')
    if (!col.fields.getByName('tributos_config')) {
      col.fields.add(
        new JSONField({
          name: 'tributos_config',
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('prec_canal_modalidades')
    const field = col.fields.getByName('tributos_config')
    if (field) {
      col.fields.removeByName('tributos_config')
      app.save(col)
    }
  },
)
