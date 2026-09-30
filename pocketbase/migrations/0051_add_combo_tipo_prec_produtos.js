migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('prec_produtos')
    const tipoField = col.fields.getByName('tipo')
    if (tipoField) {
      tipoField.values = ['fabricacao_propria', 'revenda', 'kit', 'combo']
      tipoField.maxSelect = 1
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('prec_produtos')
    const tipoField = col.fields.getByName('tipo')
    if (tipoField) {
      tipoField.values = ['fabricacao_propria', 'revenda', 'kit']
      tipoField.maxSelect = 1
      app.save(col)
    }
  },
)
