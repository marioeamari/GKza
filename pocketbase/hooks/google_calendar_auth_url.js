routerAdd(
  'GET',
  '/backend/v1/google/auth-url',
  (e) => {
    const auth = e.auth
    const clientId = $os.getenv('GOOGLE_CLIENT_ID') || ''

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

    // Envia o user id no state para associação no callback
    const statePayload = JSON.stringify({
      userId: auth ? auth.id : '',
      origin: $os.getenv('SITE_URL') || 'https://gestao-financeira-e-marketplaces-d7ede.goskip.app',
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
