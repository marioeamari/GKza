routerAdd(
  'GET',
  '/backend/v1/google/auth-url',
  (e) => {
    const auth = e.auth
    const clientId = $os.getenv('GOOGLE_CLIENT_ID')

    if (!clientId) {
      return e.json(400, {
        error:
          'As credenciais do Google Calendar (GOOGLE_CLIENT_ID) ainda não foram configuradas nas variáveis de ambiente.',
      })
    }

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

    console.log('[Google AuthUrl] redirect_uri base resolvida:', backendBase)

    const redirectUri = backendBase + '/backend/v1/google/callback'

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ')

    // Captura origin do frontend passada via query param (?origin=...) ou cabeçalho Origin/Referer
    const queryOrigin = e.requestInfo().query.origin
    const headerOrigin = e.requestInfo().headers['origin'] || ''
    const headerReferer = e.requestInfo().headers['referer'] || ''
    let candidateOrigin = ''

    if (queryOrigin && typeof queryOrigin === 'string') {
      candidateOrigin = queryOrigin.trim()
    } else if (headerOrigin) {
      candidateOrigin = headerOrigin.trim()
    } else if (headerReferer) {
      try {
        const refParts = headerReferer.split('/')
        if (refParts.length >= 3) {
          candidateOrigin = refParts[0] + '//' + refParts[2]
        }
      } catch (_) {}
    }

    if (!candidateOrigin) {
      candidateOrigin =
        $os.getenv('SITE_URL') || 'https://gestao-financeira-e-marketplaces-d7ede.goskip.app'
    }

    // Normaliza removendo trailing slash
    if (candidateOrigin.endsWith('/')) {
      candidateOrigin = candidateOrigin.slice(0, -1)
    }

    // Envia o user id e a origin no state para associação no callback
    const statePayload = JSON.stringify({
      userId: auth ? auth.id : '',
      origin: candidateOrigin,
    })
    const encodedState = encodeURIComponent(statePayload)

    const authUrl =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      'client_id=' +
      encodeURIComponent(clientId) +
      '&redirect_uri=' +
      encodeURIComponent(redirectUri) +
      '&response_type=code' +
      '&scope=' +
      encodeURIComponent(scopes) +
      '&access_type=offline' +
      '&prompt=consent' +
      '&state=' +
      encodedState

    return e.json(200, {
      url: authUrl,
      redirect_uri: redirectUri,
    })
  },
  $apis.requireAuth(),
)
