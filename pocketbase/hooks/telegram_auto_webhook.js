onBootstrap((e) => {
  e.next()

  const token = $os.getenv('TELEGRAM_BOT_TOKEN') || '8648870507:AAGZPIM5pyNjbcNfFmzZDgYaC5wuBj0cq8s'

  if (!token) return

  const secret = $os.getenv('TELEGRAM_WEBHOOK_SECRET') || ''
  const instanceUrl =
    $os.getenv('PB_INSTANCE_URL') ||
    'https://gestao-financeira-e-marketplaces-d7ede.shrd00.internal.goskip.dev'

  const webhookUrl = instanceUrl + '/backend/v1/telegram/webhook'

  try {
    const payload = {
      url: webhookUrl,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
    }
    if (secret) {
      payload.secret_token = secret
    }

    const res = $http.send({
      url: 'https://api.telegram.org/bot' + token + '/setWebhook',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 10,
    })
    console.log('Telegram auto setWebhook on bootstrap result: ' + JSON.stringify(res.json))
  } catch (err) {
    console.log('Telegram auto setWebhook on bootstrap error: ' + err.message)
  }
})
