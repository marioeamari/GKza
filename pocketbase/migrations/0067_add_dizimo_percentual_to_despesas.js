migrate(
  (app) => {
    const compromissos = app.findCollectionByNameOrId('despesas_compromisso')
    const ocorrencias = app.findCollectionByNameOrId('despesas_ocorrencias')

    // 1. Adiciona dizimo_percentual em despesas_compromisso (number, min 0, max 100)
    if (!compromissos.fields.getByName('dizimo_percentual')) {
      compromissos.fields.add(
        new NumberField({
          name: 'dizimo_percentual',
          required: false,
          min: 0,
          max: 100,
        }),
      )
      app.save(compromissos)
    }

    // 2. Adiciona dizimo_percentual em despesas_ocorrencias (number, min 0, max 100)
    if (!ocorrencias.fields.getByName('dizimo_percentual')) {
      ocorrencias.fields.add(
        new NumberField({
          name: 'dizimo_percentual',
          required: false,
          min: 0,
          max: 100,
        }),
      )
      app.save(ocorrencias)
    }

    // 3. Backfill: setar 100 em todos os registros existentes onde dizimo_percentual for nulo
    app
      .db()
      .newQuery(`
      UPDATE despesas_compromisso
      SET dizimo_percentual = 100
      WHERE dizimo_percentual IS NULL
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE despesas_ocorrencias
      SET dizimo_percentual = 100
      WHERE dizimo_percentual IS NULL
    `)
      .execute()
  },
  (app) => {
    const compromissos = app.findCollectionByNameOrId('despesas_compromisso')
    const ocorrencias = app.findCollectionByNameOrId('despesas_ocorrencias')

    try {
      compromissos.fields.removeByName('dizimo_percentual')
      app.save(compromissos)
    } catch (_) {}

    try {
      ocorrencias.fields.removeByName('dizimo_percentual')
      app.save(ocorrencias)
    } catch (_) {}
  },
)
