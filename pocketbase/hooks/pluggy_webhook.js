routerAdd('POST', '/backend/v1/pluggy/webhook', (e) => {
  let payload = {}
  try {
    payload = e.requestInfo().body || {}
  } catch (_) {}

  console.log('[PluggyWebhook] Payload recebido:', JSON.stringify(payload))

  const event = payload.event || payload.type || ''
  const itemId = payload.itemId || (payload.data && payload.data.itemId) || ''

  if (!itemId) {
    return e.json(200, { received: true, note: 'No itemId in event' })
  }

  const clientId = $os.getenv('PLUGGY_CLIENT_ID')
  const clientSecret = $os.getenv('PLUGGY_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    console.log('[PluggyWebhook] Credenciais não configuradas.')
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
    console.log('[PluggyWebhook] Erro ao autenticar Pluggy no webhook:', err)
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
    console.log('[PluggyWebhook] Erro ao atualizar item no webhook:', err)
  }

  // 3. Se for evento de transações criadas/atualizadas ou item criado/atualizado, puxar transações
  const isTransactionEvent =
    event.indexOf('transactions') !== -1 ||
    event.indexOf('TRANSACTIONS') !== -1 ||
    event.indexOf('item') !== -1 ||
    event.indexOf('ITEM') !== -1

  if (isTransactionEvent) {
    const pendentesCol = $app.findCollectionByNameOrId('telegram_registros_pendentes')

    let contasCadastradas = []
    try {
      contasCadastradas = $app.findRecordsByFilter('contas', '', 'nome', 100, 0)
    } catch (_) {}

    function mapearContaInterna(bNome, accountData) {
      if (!contasCadastradas || contasCadastradas.length === 0) return ''
      const bNomeNorm = (bNome || '').toLowerCase().trim()
      const accNameNorm = (accountData && accountData.name ? accountData.name : '')
        .toLowerCase()
        .trim()

      for (let i = 0; i < contasCadastradas.length; i++) {
        const c = contasCadastradas[i]
        const cNome = (c.getString('nome') || '').toLowerCase().trim()
        if (!cNome || cNome === '0') continue

        if (cNome === bNomeNorm || cNome === accNameNorm) {
          return c.id
        }
        if (
          (bNomeNorm && cNome.indexOf(bNomeNorm) !== -1) ||
          (bNomeNorm && bNomeNorm.indexOf(cNome) !== -1)
        ) {
          return c.id
        }
      }
      return ''
    }

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
      console.log('[PluggyWebhook] Erro ao buscar contas:', err)
    }

    const now = new Date()
    const fromDateObj = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    const fromDateStr = fromDateObj.toISOString().slice(0, 10)
    const toDateStr = now.toISOString().slice(0, 10)

    let importedCount = 0

    for (let a = 0; a < accounts.length; a++) {
      const acc = accounts[a]
      const contaInternaId = mapearContaInterna(bancoNome, acc)

      let cursorNext = null
      let cursorStep = 1
      let transactions = []

      while (cursorStep <= 20) {
        try {
          let txUrl = ''
          if (cursorNext) {
            const nextQuery = cursorNext.startsWith('?') ? cursorNext : '?' + cursorNext
            txUrl = 'https://api.pluggy.ai/v2/transactions' + nextQuery
          } else {
            txUrl =
              'https://api.pluggy.ai/v2/transactions?accountId=' +
              acc.id +
              '&dateFrom=' +
              fromDateStr +
              '&dateTo=' +
              toDateStr
          }

          const txRes = $http.send({
            url: txUrl,
            method: 'GET',
            headers: { 'X-API-KEY': apiKey },
            timeout: 20,
          })
          if (txRes.statusCode === 200 && txRes.json && txRes.json.results) {
            const list = txRes.json.results || []
            for (let r = 0; r < list.length; r++) {
              transactions.push(list[r])
            }
            cursorNext = txRes.json.next || null
            if (!cursorNext) {
              break
            }
          } else {
            break
          }
        } catch (_) {
          break
        }
        cursorStep++
      }

      for (let t = 0; t < transactions.length; t++) {
        const tx = transactions[t]
        if (!tx.id) continue
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
        if (tx.type === 'CREDIT' || (tx.type !== 'DEBIT' && rawAmount > 0)) {
          tipo = 'receita'
        }

        let txDate = tx.date ? tx.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
        const desc =
          tx.description ||
          tx.descriptionRaw ||
          (acc.name ? 'Transação ' + acc.name : 'Transação ' + bancoNome)

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
          console.log('[PluggyWebhook] Erro ao salvar tx webhook:', err)
        }
      }
    }

    console.log('[PluggyWebhook] Processado: ' + importedCount + ' transações importadas.')
  }

  return e.json(200, { received: true, event: event, itemId: itemId })
})
