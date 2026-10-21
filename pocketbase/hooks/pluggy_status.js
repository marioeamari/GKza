routerAdd(
  'GET',
  '/backend/v1/pluggy/status',
  (e) => {
    const clientId = $os.getenv('PLUGGY_CLIENT_ID')
    const clientSecret = $os.getenv('PLUGGY_CLIENT_SECRET')

    const instanceUrl =
      $os.getenv('PB_INSTANCE_URL') ||
      'https://gestao-financeira-e-marketplaces-d7ede.shrd00.internal.goskip.dev'

    const expectedWebhookUrl = instanceUrl + '/backend/v1/pluggy/webhook'

    let authOk = false
    let authError = null

    if (clientId && clientSecret) {
      try {
        const res = $http.send({
          url: 'https://api.pluggy.ai/auth',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, clientSecret }),
          timeout: 10,
        })
        if (res.statusCode === 200 && res.json && res.json.apiKey) {
          authOk = true
        } else {
          authError = res.raw || 'Erro ao autenticar'
        }
      } catch (err) {
        authError = '' + err
      }
    }

    return e.json(200, {
      configured: !!(clientId && clientSecret),
      auth_ok: authOk,
      auth_error: authError,
      expected_webhook_url: expectedWebhookUrl,
    })
  },
  $apis.requireAuth(),
)
