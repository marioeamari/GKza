routerAdd(
  'GET',
  '/backend/v1/google/status',
  (e) => {
    const auth = e.auth
    const clientId = $os.getenv('GOOGLE_CLIENT_ID')
    const clientSecret = $os.getenv('GOOGLE_CLIENT_SECRET')

    // Resolve a base do backend a partir da requisição REAL de entrada (host público
    // pelo qual o backend foi chamado). PB_INSTANCE_URL é só último recurso.
    let backendBase = ''
    let backendProto = ''
    let backendHost = ''
    try {
      const headers = e.requestInfo().headers || {}
      backendProto = (headers['x_forwarded_proto'] || 'https').trim()
      backendHost = (headers['x_forwarded_host'] || headers['host'] || '').trim()
    } catch (_) {}

    if (!backendHost) {
      try {
        backendHost = (e.request.host || '').trim()
      } catch (_) {}
    }

    // X-Forwarded-Host pode vir como lista: fica com o primeiro (host público original)
    if (backendHost.indexOf(',') !== -1) {
      backendHost = backendHost.split(',')[0].trim()
    }
    if (backendHost.endsWith('/')) {
      backendHost = backendHost.slice(0, -1)
    }

    if (backendHost) {
      backendBase = backendProto + '://' + backendHost
    } else {
      // Sem host na requisição (não deveria ocorrer em rota HTTP): usa a env normalizada.
      backendBase = ($os.getenv('PB_INSTANCE_URL') || '').trim()
      while (backendBase.endsWith('/')) {
        backendBase = backendBase.slice(0, -1)
      }
    }

    const redirectUri = backendBase + '/backend/v1/google/callback'

    let isConnected = false
    let connectedEmail = ''
    let lastSyncAt = null
    let lastError = null
    let syncAtivo = false
    let needsReconnect = false

    if (auth && auth.id) {
      try {
        const record = $app.findFirstRecordByData('google_calendar_config', 'user', auth.id)
        if (record) {
          connectedEmail = record.getString('email_conectado') || ''
          const hasRefreshToken = !!record.getString('refresh_token')
          lastSyncAt = record.getString('last_sync_at') || null
          lastError = record.getString('last_error') || null
          syncAtivo = record.getBool('sync_ativo')

          const errLower = (lastError || '').toLowerCase()
          if (
            errLower.includes('expired') ||
            errLower.includes('revoked') ||
            errLower.includes('invalid_grant')
          ) {
            needsReconnect = true
          }

          isConnected = hasRefreshToken && !needsReconnect
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
      needs_reconnect: needsReconnect,
    })
  },
  $apis.requireAuth(),
)
