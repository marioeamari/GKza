migrate(
  (app) => {
    // Cria a categoria de despesa "Dízimos e Ofertas" caso ainda não exista
    const categoriasCol = app.findCollectionByNameOrId('categorias')
    try {
      app.findFirstRecordByData('categorias', 'nome', 'Dízimos e Ofertas')
    } catch (_) {
      const record = new Record(categoriasCol)
      record.set('nome', 'Dízimos e Ofertas')
      record.set('tipo', 'despesa')
      record.set('cor', '#DF5830')
      app.save(record)
    }
  },
  (app) => {
    try {
      const record = app.findFirstRecordByData('categorias', 'nome', 'Dízimos e Ofertas')
      app.delete(record)
    } catch (_) {}
  },
)
