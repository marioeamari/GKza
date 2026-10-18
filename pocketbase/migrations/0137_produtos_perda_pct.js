migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    if (!col.fields.getByName('perda_pct')) {
      col.fields.add(
        new NumberField({
          name: 'perda_pct',
          min: 0,
          max: 100,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    const field = col.fields.getByName('perda_pct')
    if (field) {
      col.fields.remove(field)
      app.save(col)
    }
  },
)
