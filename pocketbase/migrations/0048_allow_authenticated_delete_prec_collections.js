migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"

    const collections = [
      'prec_canais',
      'prec_canal_modalidades',
      'prec_taxas',
      'prec_precificacoes',
    ]

    for (const name of collections) {
      try {
        const col = app.findCollectionByNameOrId(name)
        col.deleteRule = authenticated
        app.save(col)
      } catch (err) {
        console.warn('Erro ao atualizar deleteRule para ' + name, err)
      }
    }
  },
  (app) => {
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    const collections = [
      'prec_canais',
      'prec_canal_modalidades',
      'prec_taxas',
      'prec_precificacoes',
    ]

    for (const name of collections) {
      try {
        const col = app.findCollectionByNameOrId(name)
        col.deleteRule = adminOrManager
        app.save(col)
      } catch (err) {
        console.warn('Erro ao reverter deleteRule para ' + name, err)
      }
    }
  },
)
