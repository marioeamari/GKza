/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0124: Adiciona o campo relation opcional `modalidade` em `prec_matriz_classificacoes`.
 * Permite que cada célula da Matriz de Presença por Canal (produto x canal) grave
 * explicitamente a modalidade escolhida pelo usuário para exibição de preço,
 * preservando a referência da modalidade (o valor é sempre resolvido dinamicamente da precificação).
 */
migrate(
  (app) => {
    const colClassificacoes = app.findCollectionByNameOrId('prec_matriz_classificacoes')
    const colModalidades = app.findCollectionByNameOrId('prec_canal_modalidades')

    if (!colClassificacoes.fields.getByName('modalidade')) {
      colClassificacoes.fields.add(
        new RelationField({
          name: 'modalidade',
          required: false,
          collectionId: colModalidades.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      app.save(colClassificacoes)
    }
  },
  (app) => {
    const colClassificacoes = app.findCollectionByNameOrId('prec_matriz_classificacoes')
    const field = colClassificacoes.fields.getByName('modalidade')
    if (field) {
      colClassificacoes.fields.removeByName('modalidade')
      app.save(colClassificacoes)
    }
  },
)
