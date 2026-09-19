/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Limpar sessões antigas corrompidas ou travadas em awaiting_categoria / awaiting_conta
    try {
      app
        .db()
        .newQuery(
          "UPDATE telegram_sessions SET state = 'idle', draft_data = '{}', pending_question = ''",
        )
        .execute()
    } catch (_) {}
  },
  (app) => {},
)
