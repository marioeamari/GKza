migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    if (!users.fields.getByName('active')) {
      users.fields.add(new BoolField({ name: 'active', required: false }))
    }
    users.createRule =
      "(@request.auth.role = 'admin') || (@request.auth.id = '' && @request.body.role = 'visualizador' && @request.body.active = true)"
    users.authRule = 'active = true'
    app.save(users)
    app.db().newQuery('UPDATE users SET active = 1 WHERE active = 0').execute()
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.createRule = null
    users.authRule = null
    try {
      users.fields.removeByName('active')
    } catch (_) {}
    app.save(users)
  },
)
