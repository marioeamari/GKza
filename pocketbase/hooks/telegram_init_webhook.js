routerAdd('GET', '/backend/v1/telegram/init-webhook', (e) => {
  const token = $os.getenv('TELEGRAM_BOT_TOKEN') || '8648870507:AAGZPIM5pyNjbcNfFmzZDgYaC5wuBj0cq8s'

  if (!token) {
    return e.json(500, { error: 'TELEGRAM_BOT_TOKEN not configured' })
  }

  const secret = $os.getenv('TELEGRAM_WEBHOOK_SECRET') || ''
  const instanceUrl =
    $os.getenv('PB_INSTANCE_URL') ||
    'https://gestao-financeira-e-marketplaces-d7ede.shrd00.internal.goskip.dev'

  const webhookUrl = instanceUrl + '/backend/v1/telegram/webhook'

  const payload = {
    url: webhookUrl,
    allowed_updates: ['message', 'edited_message'],
  }
  if (secret) {
    payload.secret_token = secret
  }

  let setRes = null
  let info = null
  let bot = null

  try {
    const res = $http.send({
      url: 'https://api.telegram.org/bot' + token + '/setWebhook',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 15,
    })
    setRes = res.json
  } catch (err) {
    setRes = { error: err.message }
  }

  try {
    const infoRes = $http.send({
      url: 'https://api.telegram.org/bot' + token + '/getWebhookInfo',
      method: 'GET',
      timeout: 10,
    })
    info = infoRes.json
  } catch (err) {
    info = { error: err.message }
  }

  try {
    const meRes = $http.send({
      url: 'https://api.telegram.org/bot' + token + '/getMe',
      method: 'GET',
      timeout: 10,
    })
    bot = meRes.json
  } catch (err) {
    bot = { error: err.message }
  }

  return e.json(200, {
    target_webhook_url: webhookUrl,
    set_webhook_result: setRes,
    webhook_info: info,
    bot_info: bot,
  })
})
