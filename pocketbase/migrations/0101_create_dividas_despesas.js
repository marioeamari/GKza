migrate(
  (app) => {
    const dividasId = app.findCollectionByNameOrId('dividas').id

    // Coleção dividas_despesas
    // Nota: campos numéricos com required: true rejeitam 0 no PocketBase.
    // Usamos required: false com min: 0 ou validação compatível, similar às migrações recentes (0094, 0097).
    const despesasCol = new Collection({
      name: 'dividas_despesas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        {
          name: 'divida',
          type: 'relation',
          required: true,
          collectionId: dividasId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'data', type: 'date', required: true },
        { name: 'valor', type: 'number', required: false, min: 0 },
        { name: 'descricao', type: 'text' },
        { name: 'origem', type: 'text' },
        { name: 'observacoes', type: 'text' },
        { name: 'lancamento_id', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_dividas_despesas_divida ON dividas_despesas (divida)',
        'CREATE INDEX idx_dividas_despesas_data ON dividas_despesas (data)',
      ],
    })
    app.save(despesasCol)
  },
  (app) => {
    try {
      const despesasCol = app.findCollectionByNameOrId('dividas_despesas')
      app.delete(despesasCol)
    } catch (_) {}
  },
)
