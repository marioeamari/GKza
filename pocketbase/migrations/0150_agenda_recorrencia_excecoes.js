migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('agenda_eventos')

    if (!col.fields.getByName('recorrencia_excecoes')) {
      col.fields.add(
        new JSONField({
          name: 'recorrencia_excecoes',
          maxSize: 200000,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('agenda_eventos')
    const f = col.fields.getByName('recorrencia_excecoes')
    if (f) {
      col.fields.removeByName('recorrencia_excecoes')
      app.save(col)
    }
  },
)
