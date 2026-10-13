migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('funcionarios_estacoes')

    if (!col.fields.getByName('token_diario')) {
      col.fields.add(
        new TextField({
          name: 'token_diario',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('token_diario_validade')) {
      col.fields.add(
        new DateField({
          name: 'token_diario_validade',
          required: false,
        }),
      )
    }

    col.addIndex('idx_fest_token_diario', false, 'token_diario', '')
    col.addIndex('idx_fest_token_diario_validade', false, 'token_diario_validade', '')

    app.save(col)

    // Inicializar token_diario nas estações já existentes
    const records = app.findRecordsByFilter(
      'funcionarios_estacoes',
      'ativa = true',
      '-created',
      100,
      0,
    )
    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      if (!rec.getString('token_diario')) {
        // Gerador criptográfico nativo PocketBase: $security.randomString(32)
        const tokenDiario = 'ponto_' + $security.randomString(32)
        rec.set('token_diario', tokenDiario)
        // Validade como hoje (data atual)
        const todayIso = new Date().toISOString()
        rec.set('token_diario_validade', todayIso)
        app.save(rec)
      }
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('funcionarios_estacoes')
    col.removeIndex('idx_fest_token_diario')
    col.removeIndex('idx_fest_token_diario_validade')

    const fieldTokenDiario = col.fields.getByName('token_diario')
    if (fieldTokenDiario) {
      col.fields.removeById(fieldTokenDiario.id)
    }

    const fieldValidade = col.fields.getByName('token_diario_validade')
    if (fieldValidade) {
      col.fields.removeById(fieldValidade.id)
    }

    app.save(col)
  },
)
