migrate(
  (app) => {
    // Descartar em lote todos os registros pendentes vindos do Open Finance
    // Alvo: telegram_registros_pendentes com origem_tipo = 'open_finance' e status = 'pendente'
    // Não altera registros de outras origens (telegram, pwa) nem registros já aprovados/descartados.
    app
      .db()
      .newQuery(
        "UPDATE telegram_registros_pendentes SET status = 'descartado' WHERE origem_tipo = 'open_finance' AND status = 'pendente'",
      )
      .execute()
  },
  (app) => {
    // Reversão opcional (não reverte com segurança individual, mantém idempotência sem falha)
  },
)
