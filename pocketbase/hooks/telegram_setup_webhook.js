routerAdd(
  'POST',
  '/backend/v1/telegram/setup-webhook',
  (e) => {
    const token =
      $os.getenv('TELEGRAM_BOT_TOKEN') || '8648870507:AAGZPIM5pyNjbcNfFmzZDgYaC5wuBj0cq8s'

    if (!token) {
      return e.json(500, { error: 'TELEGRAM_BOT_TOKEN not configured' })
    }

    const secret = $os.getenv('TELEGRAM_WEBHOOK_SECRET') || ''
    const instanceUrl =
      $os.getenv('PB_INSTANCE_URL') ||
      'https://gestao-financeira-e-marketplaces-d7ede.shrd00.internal.goskip.dev'

    const webhookUrl = instanceUrl + '/backend/v1/telegram/webhook'

    // Chamar a API setWebhook do Telegram
    const payload = {
      url: webhookUrl,
      allowed_updates: ['message', 'edited_message'],
    }
    if (secret) {
      payload.secret_token = secret
    }

    let res = null
    try {
      res = $http.send({
        url: 'https://api.telegram.org/bot' + token + '/setWebhook',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeout: 15,
      })
    } catch (err) {
      return e.json(500, { error: 'Failed to call Telegram setWebhook: ' + err.message })
    }

    // Obter webhookInfo atual
    let info = null
    try {
      const infoRes = $http.send({
        url: 'https://api.telegram.org/bot' + token + '/getWebhookInfo',
        method: 'GET',
        timeout: 10,
      })
      info = infoRes.json
    } catch (_) {}

    // Obter me info (dados do bot)
    let me = null
    try {
      const meRes = $http.send({
        url: 'https://api.telegram.org/bot' + token + '/getMe',
        method: 'GET',
        timeout: 10,
      })
      me = meRes.json
    } catch (_) {}

    return e.json(200, {
      success: true,
      target_webhook_url: webhookUrl,
      telegram_response: res.json,
      webhook_info: info,
      bot_info: me,
    })
  },
  $apis.requireAuth(),
)
