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

    const instanceUrl =
      $os.getenv('PB_INSTANCE_URL') ||
      'https://gestao-financeira-e-marketplaces-d7ede.shrd00.internal.goskip.dev'

    const redirectUri = instanceUrl + '/backend/v1/google/callback'

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
