routerAdd(
  'GET',
  '/backend/v1/google/status',
  (e) => {
    const auth = e.auth
    const clientId = $os.getenv('GOOGLE_CLIENT_ID') || ''
    const clientSecret = $os.getenv('GOOGLE_CLIENT_SECRET') || ''

    const instanceUrl =
      $os.getenv('PB_INSTANCE_URL') ||
      'https://gestao-financeira-e-marketplaces-d7ede.shrd00.internal.goskip.dev'

    const redirectUri = instanceUrl + '/backend/v1/google/callback'

    let isConnected = false
    let connectedEmail = ''
    let lastSyncAt = null
    let lastError = null
    let syncAtivo = false

    if (auth && auth.id) {
      try {
        const record = $app.findFirstRecordByData('google_calendar_config', 'user', auth.id)
        if (record) {
          connectedEmail = record.getString('email_conectado') || ''
          isConnected = !!record.getString('refresh_token')
          lastSyncAt = record.getString('last_sync_at') || null
          lastError = record.getString('last_error') || null
          syncAtivo = record.getBool('sync_ativo')
        }
      } catch (_) {
        // Sem configuração salva ainda
      }
    }

    return e.json(200, {
      configured: !!(clientId && clientSecret),
      client_id_present: !!clientId,
      client_secret_present: !!clientSecret,
      redirect_uri: redirectUri,
      is_connected: isConnected,
      connected_email: connectedEmail,
      last_sync_at: lastSyncAt,
      last_error: lastError,
      sync_ativo: syncAtivo,
    })
  },
  $apis.requireAuth(),
)
