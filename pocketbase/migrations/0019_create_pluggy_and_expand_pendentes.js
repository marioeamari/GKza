/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Criar coleção pluggy_items se não existir
    try {
      app.findCollectionByNameOrId('pluggy_items')
    } catch (_) {
      const collection = new Collection({
        name: 'pluggy_items',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
        updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
        deleteRule: "@request.auth.role = 'admin' || @request.auth.role = 'gestor'",
        fields: [
          {
            name: 'item_id',
            type: 'text',
            required: true,
          },
          {
            name: 'connector_id',
            type: 'number',
            required: false,
          },
          {
            name: 'connector_name',
            type: 'text',
            required: true,
          },
          {
            name: 'connector_image_url',
            type: 'text',
            required: false,
          },
          {
            name: 'status',
            type: 'text',
            required: false,
          },
          {
            name: 'last_sync_at',
            type: 'date',
            required: false,
          },
          {
            name: 'error_message',
            type: 'text',
            required: false,
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
        indexes: ['CREATE UNIQUE INDEX idx_pluggy_items_item_id ON pluggy_items (item_id)'],
      })
      app.save(collection)
    }

    // 2. Adicionar campos na coleção telegram_registros_pendentes para rastrear transações Pluggy
    const pendentesCol = app.findCollectionByNameOrId('telegram_registros_pendentes')

    if (!pendentesCol.fields.getByName('external_id')) {
      pendentesCol.fields.add(
        new TextField({
          name: 'external_id',
          type: 'text',
          required: false,
        }),
      )
    }

    if (!pendentesCol.fields.getByName('origem_tipo')) {
      pendentesCol.fields.add(
        new TextField({
          name: 'origem_tipo',
          type: 'text',
          required: false,
        }),
      )
    }

    if (!pendentesCol.fields.getByName('banco_nome')) {
      pendentesCol.fields.add(
        new TextField({
          name: 'banco_nome',
          type: 'text',
          required: false,
        }),
      )
    }

    if (!pendentesCol.fields.getByName('pluggy_item_id')) {
      pendentesCol.fields.add(
        new TextField({
          name: 'pluggy_item_id',
          type: 'text',
          required: false,
        }),
      )
    }

    app.save(pendentesCol)

    // Adiciona índice em external_id
    try {
      pendentesCol.addIndex('idx_tel_reg_pend_ext_id', false, 'external_id', '')
      app.save(pendentesCol)
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pluggy_items')
      app.delete(col)
    } catch (_) {}

    try {
      const pendentesCol = app.findCollectionByNameOrId('telegram_registros_pendentes')
      pendentesCol.removeIndex('idx_tel_reg_pend_ext_id')
      pendentesCol.fields.removeByName('external_id')
      pendentesCol.fields.removeByName('origem_tipo')
      pendentesCol.fields.removeByName('banco_nome')
      pendentesCol.fields.removeByName('pluggy_item_id')
      app.save(pendentesCol)
    } catch (_) {}
  },
)
