/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('telegram_sessions')

      const newFields = [
        { name: 'draft_tipo', type: 'text' },
        { name: 'draft_descricao', type: 'text' },
        { name: 'draft_valor', type: 'number' },
        { name: 'draft_data_transacao', type: 'text' },
        { name: 'draft_categoria', type: 'text' },
        { name: 'draft_conta', type: 'text' },
        { name: 'draft_observacoes', type: 'text' },
        { name: 'draft_comprovante_texto', type: 'text' },
        { name: 'draft_json', type: 'text' },
      ]

      for (let i = 0; i < newFields.length; i++) {
        const f = newFields[i]
        if (!col.fields.getByName(f.name)) {
          if (f.type === 'number') {
            col.fields.add(new NumberField({ name: f.name }))
          } else {
            col.fields.add(new TextField({ name: f.name }))
          }
        }
      }

      app.save(col)

      // Limpar registros corrompidos na sessão para que o usuário comece do zero
      app
        .db()
        .newQuery(
          "UPDATE telegram_sessions SET state = 'idle', pending_question = '', draft_data = '{}', draft_json = '', draft_valor = 0, draft_descricao = '', draft_tipo = ''",
        )
        .execute()
    } catch (err) {
      console.log('Migration 0017 error:', err.message)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('telegram_sessions')
      const fieldsToRemove = [
        'draft_tipo',
        'draft_descricao',
        'draft_valor',
        'draft_data_transacao',
        'draft_categoria',
        'draft_conta',
        'draft_observacoes',
        'draft_comprovante_texto',
        'draft_json',
      ]
      for (let i = 0; i < fieldsToRemove.length; i++) {
        const fName = fieldsToRemove[i]
        const f = col.fields.getByName(fName)
        if (f) col.fields.remove(f)
      }
      app.save(col)
    } catch (_) {}
  },
)
