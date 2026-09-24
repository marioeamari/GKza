routerAdd(
  'POST',
  '/backend/v1/google/disconnect',
  (e) => {
    const auth = e.auth
    if (!auth || !auth.id) {
      return e.json(401, { error: 'Não autenticado' })
    }

    try {
      const record = $app.findFirstRecordByData('google_calendar_config', 'user', auth.id)
      if (record) {
        record.set('access_token', '')
        record.set('refresh_token', '')
        record.set('email_conectado', '')
        record.set('sync_ativo', false)
        record.set('last_error', '')
        $app.save(record)
      }
      return e.json(200, { success: true, message: 'Google Calendar desconectado com sucesso.' })
    } catch (err) {
      return e.json(200, { success: true, message: 'Nenhuma conexão ativa encontrada.' })
    }
  },
  $apis.requireAuth(),
)
