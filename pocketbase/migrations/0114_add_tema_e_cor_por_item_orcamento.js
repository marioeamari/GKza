migrate(
  (app) => {
    const kitTemasId = app.findCollectionByNameOrId('kit_temas').id
    const itensCol = app.findCollectionByNameOrId('orcamento_itens')

    // 1. Adicionar campos tema, tema_nome, cor em orcamento_itens
    if (!itensCol.fields.getByName('tema')) {
      itensCol.fields.add(
        new RelationField({
          name: 'tema',
          required: false,
          collectionId: kitTemasId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    if (!itensCol.fields.getByName('tema_nome')) {
      itensCol.fields.add(
        new TextField({
          name: 'tema_nome',
          required: false,
        }),
      )
    }

    if (!itensCol.fields.getByName('cor')) {
      itensCol.fields.add(
        new TextField({
          name: 'cor',
          required: false,
        }),
      )
    }

    app.save(itensCol)

    // 2. Migrar dados de orçamentos existentes:
    // O tema, tema_nome e cor gravados no cabeçalho de 'orcamentos' vão para os itens existentes
    app
      .db()
      .newQuery(`
      UPDATE orcamento_itens
      SET
        tema = (SELECT orcamentos.tema FROM orcamentos WHERE orcamentos.id = orcamento_itens.orcamento),
        tema_nome = (SELECT orcamentos.tema_nome FROM orcamentos WHERE orcamentos.id = orcamento_itens.orcamento),
        cor = (SELECT orcamentos.cor FROM orcamentos WHERE orcamentos.id = orcamento_itens.orcamento)
      WHERE orcamento_itens.tema IS NULL OR orcamento_itens.tema = ''
    `)
      .execute()
  },
  (app) => {
    try {
      const itensCol = app.findCollectionByNameOrId('orcamento_itens')
      itensCol.fields.removeByName('tema')
      itensCol.fields.removeByName('tema_nome')
      itensCol.fields.removeByName('cor')
      app.save(itensCol)
    } catch (_) {}
  },
)
