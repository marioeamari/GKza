migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('producao_dias_itens')
    const quantidadeField = col.fields.getByName('quantidade')
    if (quantidadeField) {
      quantidadeField.required = false
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('producao_dias_itens')
    const quantidadeField = col.fields.getByName('quantidade')
    if (quantidadeField) {
      quantidadeField.required = true
      app.save(col)
    }
  },
)
