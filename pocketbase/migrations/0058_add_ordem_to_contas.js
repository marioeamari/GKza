migrate(
  (app) => {
    const contas = app.findCollectionByNameOrId('contas')

    // 1. Adiciona campo ordem (number) se não existir
    if (!contas.fields.getByName('ordem')) {
      contas.fields.add(
        new NumberField({
          name: 'ordem',
          required: false,
          onlyInt: true,
          min: 1,
        }),
      )
      app.save(contas)
    }

    // 2. Preenche valores iniciais ordenados por tipo (cartão primeiro, depois bancaria, caixa, marketplace) e created
    const allContas = app.findRecordsByFilter('contas', '', 'created', 200, 0)
    for (let i = 0; i < allContas.length; i++) {
      const conta = allContas[i]
      if (!conta.get('ordem') || conta.getInt('ordem') <= 0) {
        conta.set('ordem', i + 1)
        app.save(conta)
      }
    }
  },
  (app) => {
    const contas = app.findCollectionByNameOrId('contas')
    try {
      contas.fields.removeByName('ordem')
      app.save(contas)
    } catch (_) {}
  },
)
