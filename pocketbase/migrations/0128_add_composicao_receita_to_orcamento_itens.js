/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const itensCol = app.findCollectionByNameOrId('orcamento_itens')

    // 1. Adicionar campo 'composicao_receita' (json) em orcamento_itens se não existir
    if (!itensCol.fields.getByName('composicao_receita')) {
      itensCol.fields.add(
        new JSONField({
          name: 'composicao_receita',
          required: false,
          maxSize: 2000000,
        }),
      )
      app.save(itensCol)
    }
  },
  (app) => {
    const itensCol = app.findCollectionByNameOrId('orcamento_itens')
    if (itensCol.fields.getByName('composicao_receita')) {
      itensCol.fields.removeByName('composicao_receita')
      app.save(itensCol)
    }
  },
)
