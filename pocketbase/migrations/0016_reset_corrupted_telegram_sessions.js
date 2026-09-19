/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const sessions = app.findRecordsByFilter('telegram_sessions', '', '', 100, 0)
      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i]
        s.set('state', 'idle')
        s.set('draft_data', '{}')
        s.set('pending_question', '')
        s.set('last_message_id', '')
        app.save(s)
      }
    } catch (err) {
      console.log('Migration 0016 clear sessions error:', err.message)
    }
  },
  (app) => {},
)
