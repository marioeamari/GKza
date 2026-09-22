routerAdd('POST', '/backend/v1/pluggy/webhook', (e) => {
  let payload = {}
  try {
    payload = e.requestInfo().body || {}
  } catch (_) {}

  console.log('Pluggy Webhook recebido:', JSON.stringify(payload))

  const event = payload.event || payload.type || ''
  const itemId = payload.itemId || (payload.data && payload.data.itemId) || ''

  if (!itemId) {
    return e.json(200, { received: true, note: 'No itemId in event' })
  }

  const clientId = $os.getenv('PLUGGY_CLIENT_ID') || '54b2a0af-7f3a-415e-8a8f-fa73d0aa6905'
  const clientSecret =
    $os.getenv('PLUGGY_CLIENT_SECRET') || 'RCqCZjybNbeJddKQ95JlAvjAbnmhLM0yXClwxpE4QYU'

  if (!clientId || !clientSecret) {
    return e.json(200, { received: true, error: 'Credentials not configured' })
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
    console.log('Erro ao autenticar Pluggy no webhook:', err)
    return e.json(200, { received: true, error: 'Auth error' })
  }

  if (!apiKey) {
    return e.json(200, { received: true, error: 'No apiKey' })
  }

  // 2. Salvar ou atualizar pluggy_items
  let bancoNome = 'Open Finance'
  try {
    const itemRes = $http.send({
      url: 'https://api.pluggy.ai/items/' + itemId,
      method: 'GET',
      headers: { 'X-API-KEY': apiKey },
      timeout: 15,
    })
    if (itemRes.statusCode === 200 && itemRes.json) {
      const itemData = itemRes.json
      const conn = itemData.connector || {}
      bancoNome = conn.name || 'Open Finance'

      let itemRecord = null
      try {
        itemRecord = $app.findFirstRecordByData('pluggy_items', 'item_id', itemId)
      } catch (_) {}

      if (!itemRecord) {
        const col = $app.findCollectionByNameOrId('pluggy_items')
        itemRecord = new Record(col)
        itemRecord.set('item_id', itemId)
      }

      itemRecord.set('connector_id', conn.id || null)
      itemRecord.set('connector_name', conn.name || 'Banco Conectado')
      itemRecord.set('connector_image_url', conn.imageUrl || '')
      itemRecord.set('status', itemData.status || 'UPDATED')
      itemRecord.set('last_sync_at', new Date().toISOString())
      if (itemData.error) {
        itemRecord.set('error_message', JSON.stringify(itemData.error))
      }
      $app.save(itemRecord)
    }
  } catch (err) {
    console.log('Erro ao atualizar item no webhook:', err)
  }

  // 3. Se for evento de transações criadas/atualizadas ou item criado/atualizado, puxar transações
  const isTransactionEvent =
    event.indexOf('transactions') !== -1 ||
    event.indexOf('TRANSACTIONS') !== -1 ||
    event.indexOf('item') !== -1 ||
    event.indexOf('ITEM') !== -1

  if (isTransactionEvent) {
    const pendentesCol = $app.findCollectionByNameOrId('telegram_registros_pendentes')

    // Tentar associar conta bancária interna correspondente se existir
    let contaInternaId = ''
    try {
      const cRec = $app.findFirstRecordByData('contas', 'nome', bancoNome)
      if (cRec) contaInternaId = cRec.id
    } catch (_) {}

    // Buscar contas do item
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
    } catch (err) {
      console.log('Erro ao buscar contas no webhook:', err)
    }

    const now = new Date()
    const fromDateObj = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
    const fromDateStr = fromDateObj.toISOString().slice(0, 10)

    let importedCount = 0

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
          'Transação Open Finance importada via Webhook Pluggy | Ref: ' + externalId,
        )

        try {
          $app.save(rec)
          importedCount++
        } catch (err) {
          console.log('Erro ao salvar tx webhook:', err)
        }
      }
    }

    console.log('Webhook processado: ' + importedCount + ' transações importadas.')
  }

  return e.json(200, { received: true, event: event, itemId: itemId })
})
