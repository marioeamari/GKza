migrate(
  (app) => {
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"
    const canWriteFinance = "@request.auth.id != '' && @request.auth.role != 'visualizador'"

    const users = app.findCollectionByNameOrId('users')
    users.updateRule =
      "(@request.auth.id = id && @request.body.role:changed = false && @request.body.active:changed = false) || @request.auth.role = 'admin'"
    app.save(users)

    const registryNames = ['empresas', 'pessoas']
    for (let i = 0; i < registryNames.length; i++) {
      const collection = app.findCollectionByNameOrId(registryNames[i])
      collection.createRule = adminOrManager
      collection.updateRule = adminOrManager
      app.save(collection)
    }

    const financeNames = ['contas', 'categorias', 'marketplaces', 'marketplace_contas']
    for (let i = 0; i < financeNames.length; i++) {
      const collection = app.findCollectionByNameOrId(financeNames[i])
      collection.createRule = canWriteFinance
      collection.updateRule = canWriteFinance
      app.save(collection)
    }
  },
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const users = app.findCollectionByNameOrId('users')
    users.updateRule = "@request.auth.id = id || @request.auth.role = 'admin'"
    app.save(users)
    const names = [
      'empresas',
      'pessoas',
      'contas',
      'categorias',
      'marketplaces',
      'marketplace_contas',
    ]
    for (let i = 0; i < names.length; i++) {
      const collection = app.findCollectionByNameOrId(names[i])
      collection.createRule = authenticated
      collection.updateRule = authenticated
      app.save(collection)
    }
  },
)
