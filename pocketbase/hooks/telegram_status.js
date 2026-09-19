routerAdd(
  'GET',
  '/backend/v1/telegram/status',
  (e) => {
    const token =
      $os.getenv('TELEGRAM_BOT_TOKEN') || '8648870507:AAGZPIM5pyNjbcNfFmzZDgYaC5wuBj0cq8s'

    const secret = $os.getenv('TELEGRAM_WEBHOOK_SECRET') || ''
    const instanceUrl =
      $os.getenv('PB_INSTANCE_URL') ||
      'https://gestao-financeira-e-marketplaces-d7ede.shrd00.internal.goskip.dev'

    const expectedWebhookUrl = instanceUrl + '/backend/v1/telegram/webhook'

    let webhookInfo = null
    let botInfo = null

    if (token) {
      try {
        const res = $http.send({
          url: 'https://api.telegram.org/bot' + token + '/getWebhookInfo',
          method: 'GET',
          timeout: 10,
        })
        webhookInfo = res.json
      } catch (_) {}

      try {
        const meRes = $http.send({
          url: 'https://api.telegram.org/bot' + token + '/getMe',
          method: 'GET',
          timeout: 10,
        })
        botInfo = meRes.json
      } catch (_) {}
    }

    return e.json(200, {
      configured: !!token,
      has_secret: !!secret,
      expected_webhook_url: expectedWebhookUrl,
      webhook_info: webhookInfo,
      bot_info: botInfo,
    })
  },
  $apis.requireAuth(),
)
