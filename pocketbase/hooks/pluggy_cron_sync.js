cronAdd('pluggy_sync_hourly', '15 * * * *', () => {
  const clientId = $os.getenv('PLUGGY_CLIENT_ID') || '54b2a0af-7f3a-415e-8a8f-fa73d0aa6905'
  const clientSecret =
    $os.getenv('PLUGGY_CLIENT_SECRET') || 'RCqCZjybNbeJddKQ95JlAvjAbnmhLM0yXClwxpE4QYU'

  if (!clientId || !clientSecret) {
    return
  }

  // 1. Obter ApiKey
  let apiKey = ''
  try {
    const authRes = $http.send({
      url: 'https://api.pluggy.ai/auth',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
      timeout: 15,
    })
    if (authRes.statusCode === 200 && authRes.json && authRes.json.apiKey) {
      apiKey = authRes.json.apiKey
    }
  } catch (err) {
    console.log('Cron Pluggy: erro ao autenticar:', err)
    return
  }

  if (!apiKey) return

  // 2. Buscar itens cadastrados
  let savedItems = []
  try {
    savedItems = $app.findRecordsByFilter('pluggy_items', '', '-created', 100, 0)
  } catch (_) {}

  if (savedItems.length === 0) return

  const pendentesCol = $app.findCollectionByNameOrId('telegram_registros_pendentes')
  const now = new Date()
  const fromDateObj = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const fromDateStr = fromDateObj.toISOString().slice(0, 10)

  for (let i = 0; i < savedItems.length; i++) {
    const itemRec = savedItems[i]
    const itemId = itemRec.getString('item_id')
    const bancoNome = itemRec.getString('connector_name') || 'Open Finance'

    // Tentar associar conta bancária interna correspondente
    let contaInternaId = ''
    try {
      const cRec = $app.findFirstRecordByData('contas', 'nome', bancoNome)
      if (cRec) contaInternaId = cRec.id
    } catch (_) {}

    // Buscar contas
    let accounts = []
    try {
      const accRes = $http.send({
        url: 'https://api.pluggy.ai/accounts?itemId=' + itemId,
        method: 'GET',
        headers: { 'X-API-KEY': apiKey },
        timeout: 15,
      })
      if (accRes.statusCode === 200 && accRes.json && accRes.json.results) {
        accounts = accRes.json.results
      }
    } catch (_) {}

    for (let a = 0; a < accounts.length; a++) {
      const acc = accounts[a]
      let transactions = []
      try {
        const txRes = $http.send({
          url:
            'https://api.pluggy.ai/transactions?accountId=' +
            acc.id +
            '&from=' +
            fromDateStr +
            '&pageSize=100',
          method: 'GET',
          headers: { 'X-API-KEY': apiKey },
          timeout: 20,
        })
        if (txRes.statusCode === 200 && txRes.json && txRes.json.results) {
          transactions = txRes.json.results
        }
      } catch (_) {}

      for (let t = 0; t < transactions.length; t++) {
        const tx = transactions[t]
        const externalId = 'pluggy_' + tx.id

        let alreadyExists = false
        try {
          const existing = $app.findFirstRecordByData(
            'telegram_registros_pendentes',
            'external_id',
            externalId,
          )
          if (existing) alreadyExists = true
        } catch (_) {}

        if (alreadyExists) continue

        const rawAmount = tx.amount != null ? Number(tx.amount) : 0
        const absAmount = Math.abs(rawAmount)

        let tipo = 'despesa'
        if (tx.type === 'CREDIT' || rawAmount > 0) {
          tipo = 'receita'
        }

        let txDate = tx.date ? tx.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
        const desc = tx.description || tx.descriptionRaw || 'Transação ' + bancoNome

        const rec = new Record(pendentesCol)
        rec.set('descricao', desc)
        rec.set('valor', absAmount)
        rec.set('tipo', tipo)
        rec.set('data', txDate + ' 12:00:00.000Z')
        rec.set('status', 'pendente')
        if (contaInternaId) {
          rec.set('conta', contaInternaId)
        }
        rec.set('origem_tipo', 'open_finance')
        rec.set('banco_nome', bancoNome)
        rec.set('pluggy_item_id', itemId)
        rec.set('external_id', externalId)
        rec.set('telegram_origem', 'Open Finance (' + bancoNome + ')')
        rec.set(
          'comprovante_texto',
          'Transação Open Finance sincronizada via Cron | Ref: ' + externalId,
        )

        try {
          $app.save(rec)
        } catch (_) {}
      }
    }

    try {
      itemRec.set('last_sync_at', new Date().toISOString())
      $app.save(itemRec)
    } catch (_) {}
  }
})
