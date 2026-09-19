/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Verificar se já existe a coleção telegram_sessions
    try {
      app.findCollectionByNameOrId('telegram_sessions')
      return
    } catch (_) {}

    const collection = new Collection({
      name: 'telegram_sessions',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        {
          name: 'chat_id',
          type: 'text',
          required: true,
        },
        {
          name: 'state',
          type: 'text',
          required: false,
        },
        {
          name: 'draft_data',
          type: 'json',
          required: false,
        },
        {
          name: 'pending_question',
          type: 'text',
          required: false,
        },
        {
          name: 'last_message_id',
          type: 'text',
          required: false,
        },
        {
          name: 'contexto_nome',
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
      indexes: ['CREATE UNIQUE INDEX idx_telegram_sessions_chat_id ON telegram_sessions (chat_id)'],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('telegram_sessions')
      app.delete(col)
    } catch (_) {}
  },
)
