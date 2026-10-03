/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const pendentesCol = app.findCollectionByNameOrId('telegram_registros_pendentes')
    const fornecedoresCol = app.findCollectionByNameOrId('fornecedores')
    const metodosCol = app.findCollectionByNameOrId('metodos_pagamento')

    // 1. Campo fornecedor (relação opcional com fornecedores)
    if (!pendentesCol.fields.getByName('fornecedor')) {
      pendentesCol.fields.add(
        new RelationField({
          name: 'fornecedor',
          type: 'relation',
          required: false,
          collectionId: fornecedoresCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    // 2. Campo fornecedor_nome (texto para criação instantânea ou fallback textual)
    if (!pendentesCol.fields.getByName('fornecedor_nome')) {
      pendentesCol.fields.add(
        new TextField({
          name: 'fornecedor_nome',
          type: 'text',
          required: false,
        }),
      )
    }

    // 3. Campo metodo_pagamento (relação opcional com metodos_pagamento)
    if (!pendentesCol.fields.getByName('metodo_pagamento')) {
      pendentesCol.fields.add(
        new RelationField({
          name: 'metodo_pagamento',
          type: 'relation',
          required: false,
          collectionId: metodosCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    app.save(pendentesCol)
  },
  (app) => {
    try {
      const pendentesCol = app.findCollectionByNameOrId('telegram_registros_pendentes')
      if (pendentesCol.fields.getByName('metodo_pagamento')) {
        pendentesCol.fields.removeByName('metodo_pagamento')
      }
      if (pendentesCol.fields.getByName('fornecedor_nome')) {
        pendentesCol.fields.removeByName('fornecedor_nome')
      }
      if (pendentesCol.fields.getByName('fornecedor')) {
        pendentesCol.fields.removeByName('fornecedor')
      }
      app.save(pendentesCol)
    } catch (_) {}
  },
)
