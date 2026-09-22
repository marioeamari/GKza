routerAdd(
  'POST',
  '/backend/v1/pluggy/connect-token',
  (e) => {
    const clientId = $os.getenv('PLUGGY_CLIENT_ID') || '54b2a0af-7f3a-415e-8a8f-fa73d0aa6905'
    const clientSecret =
      $os.getenv('PLUGGY_CLIENT_SECRET') || 'RCqCZjybNbeJddKQ95JlAvjAbnmhLM0yXClwxpE4QYU'

    if (!clientId || !clientSecret) {
      return e.json(500, { error: 'PLUGGY_CLIENT_ID ou PLUGGY_CLIENT_SECRET não configurados' })
    }

    // 1. Obter ApiKey (Access Token) via POST https://api.pluggy.ai/auth
    let apiKey = ''
    try {
      const authRes = $http.send({
        url: 'https://api.pluggy.ai/auth',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: clientId,
          clientSecret: clientSecret,
        }),
        timeout: 15,
      })

      if (authRes.statusCode !== 200) {
        return e.json(502, {
          error: 'Falha ao autenticar com Pluggy',
          details: authRes.raw,
        })
      }

      apiKey = authRes.json.apiKey
    } catch (err) {
      return e.json(502, {
        error: 'Erro de conexão com API Pluggy',
        details: '' + err,
      })
    }

    // 2. Extrair corpo da requisição (ex: itemId se for para reconectar / atualizar)
    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const itemId = reqBody.itemId || undefined

    // 3. Gerar connect token via POST https://api.pluggy.ai/connect_token
    const payload = {}
    if (itemId) {
      payload.itemId = itemId
    }

    try {
      const tokenRes = $http.send({
        url: 'https://api.pluggy.ai/connect_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify(payload),
        timeout: 15,
      })

      if (tokenRes.statusCode !== 200 && tokenRes.statusCode !== 201) {
        return e.json(tokenRes.statusCode || 502, {
          error: 'Falha ao gerar connect_token Pluggy',
          details: tokenRes.raw,
        })
      }

      return e.json(200, {
        accessToken: tokenRes.json.accessToken,
        apiKeyCached: true,
      })
    } catch (err) {
      return e.json(502, {
        error: 'Erro ao chamar /connect_token na Pluggy',
        details: '' + err,
      })
    }
  },
  $apis.requireAuth(),
)
