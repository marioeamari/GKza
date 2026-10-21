routerAdd(
  'POST',
  '/backend/v1/pluggy/disconnect',
  (e) => {
    const clientId = $os.getenv('PLUGGY_CLIENT_ID')
    const clientSecret = $os.getenv('PLUGGY_CLIENT_SECRET')

    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const itemId = reqBody.itemId || ''
    if (!itemId) {
      return e.json(400, { error: 'itemId é obrigatório' })
    }

    // 1. Tentar deletar item na API Pluggy se as credenciais existirem
    if (clientId && clientSecret) {
      try {
        const authRes = $http.send({
          url: 'https://api.pluggy.ai/auth',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, clientSecret }),
          timeout: 10,
        })
        if (authRes.statusCode === 200 && authRes.json && authRes.json.apiKey) {
          const apiKey = authRes.json.apiKey
          $http.send({
            url: 'https://api.pluggy.ai/items/' + itemId,
            method: 'DELETE',
            headers: { 'X-API-KEY': apiKey },
            timeout: 15,
          })
        }
      } catch (err) {
        console.log('Erro ao deletar item na Pluggy:', err)
      }
    }

    // 2. Deletar do banco local pluggy_items
    try {
      const rec = $app.findFirstRecordByData('pluggy_items', 'item_id', itemId)
      if (rec) {
        $app.delete(rec)
      }
    } catch (_) {}

    return e.json(200, { success: true, message: 'Item desconectado com sucesso' })
  },
  $apis.requireAuth(),
)
