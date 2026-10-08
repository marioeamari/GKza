migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('producao_saques_itens')
    const valorField = col.fields.getByName('valor')
    if (valorField) {
      valorField.required = false
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('producao_saques_itens')
    const valorField = col.fields.getByName('valor')
    if (valorField) {
      valorField.required = true
      app.save(col)
    }
  },
)
