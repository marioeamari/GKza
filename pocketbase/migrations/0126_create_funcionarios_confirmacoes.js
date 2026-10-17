migrate(
  (app) => {
    const funcionariosCol = app.findCollectionByNameOrId('funcionarios')

    const collection = new Collection({
      name: 'funcionarios_confirmacoes',
      type: 'base',
      listRule: "@request.auth.id != '' || @request.auth.id = ''",
      viewRule: "@request.auth.id != '' || @request.auth.id = ''",
      createRule: "@request.auth.id != '' || @request.auth.id = ''",
      updateRule: "@request.auth.id != '' || @request.auth.id = ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'funcionario',
          type: 'relation',
          required: true,
          collectionId: funcionariosCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'data',
          type: 'date',
          required: true,
        },
        {
          name: 'confirmado',
          type: 'bool',
        },
        {
          name: 'confirmado_em',
          type: 'date',
        },
        {
          name: 'divergencia_apontada',
          type: 'bool',
        },
        {
          name: 'motivo_divergencia',
          type: 'text',
        },
        {
          name: 'ip_origem',
          type: 'text',
        },
        {
          name: 'observacao',
          type: 'text',
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_fconf_func_data ON funcionarios_confirmacoes (funcionario, data)',
        'CREATE INDEX idx_fconf_func ON funcionarios_confirmacoes (funcionario)',
        'CREATE INDEX idx_fconf_data ON funcionarios_confirmacoes (data)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('funcionarios_confirmacoes')
      app.delete(col)
    } catch (_) {}
  },
)
