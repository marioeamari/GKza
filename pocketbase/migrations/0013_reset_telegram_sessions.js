/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Reset any stuck draft sessions so users have a clean slate
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
