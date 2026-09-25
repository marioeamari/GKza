migrate(
  (app) => {
    // Se o registro id js18wypmkoifn5v estiver pendente mas já tiver sido triado pelo usuário,
    // ou se o usuário já tiver tentado descartar/aprovar, marcar como aprovado/descartado
    // O usuário relatou que confirmou a triagem do registro de R$ 267,00 (js18wypmkoifn5v).
    try {
      const rec = app.findRecordById('telegram_registros_pendentes', 'js18wypmkoifn5v')
      if (rec.getString('status') === 'pendente') {
        rec.set('status', 'aprovado')
        app.save(rec)
      }
    } catch (_) {
      // registro não existe mais ou já ajustado
    }
  },
  (app) => {
    try {
      const rec = app.findRecordById('telegram_registros_pendentes', 'js18wypmkoifn5v')
      rec.set('status', 'pendente')
      app.save(rec)
    } catch (_) {}
  },
)
