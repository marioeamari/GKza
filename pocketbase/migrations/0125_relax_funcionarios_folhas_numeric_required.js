migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('funcionarios_folhas')

    const dividaSemanalField = col.fields.getByName('divida_semanal')
    if (dividaSemanalField) {
      dividaSemanalField.required = false
    }

    const ganhoTotalField = col.fields.getByName('ganho_total')
    if (ganhoTotalField) {
      ganhoTotalField.required = false
    }

    const aReceberField = col.fields.getByName('a_receber')
    if (aReceberField) {
      aReceberField.required = false
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('funcionarios_folhas')

    const dividaSemanalField = col.fields.getByName('divida_semanal')
    if (dividaSemanalField) {
      dividaSemanalField.required = true
    }

    const ganhoTotalField = col.fields.getByName('ganho_total')
    if (ganhoTotalField) {
      ganhoTotalField.required = true
    }

    const aReceberField = col.fields.getByName('a_receber')
    if (aReceberField) {
      aReceberField.required = true
    }

    app.save(col)
  },
)
