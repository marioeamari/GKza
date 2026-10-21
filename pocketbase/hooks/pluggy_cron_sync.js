cronAdd('pluggy_sync_hourly', '15 * * * *', () => {
  const clientId = $os.getenv('PLUGGY_CLIENT_ID')
  const clientSecret = $os.getenv('PLUGGY_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    console.log('[PluggyCronSync] Credenciais não configuradas. Encerrando.')
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
    } else {
      console.log(
        '[PluggyCronSync] Falha auth status=' + authRes.statusCode + ' raw=' + authRes.raw,
      )
      return
    }
  } catch (err) {
    console.log('[PluggyCronSync] Erro ao autenticar:', err)
    return
  }

  if (!apiKey) return

  // 2. Buscar itens cadastrados
  let savedItems = []
  try {
    savedItems = $app.findRecordsByFilter('pluggy_items', '', '-created', 100, 0)
  } catch (err) {
    console.log('[PluggyCronSync] Erro ao buscar pluggy_items:', err)
    return
  }

  if (savedItems.length === 0) {
    console.log('[PluggyCronSync] Nenhum item cadastrado.')
    return
  }

  const pendentesCol = $app.findCollectionByNameOrId('telegram_registros_pendentes')
  const now = new Date()
  const fromDateObj = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const fromDateStr = fromDateObj.toISOString().slice(0, 10)
  const toDateStr = now.toISOString().slice(0, 10)

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

  for (let i = 0; i < savedItems.length; i++) {
    const itemRec = savedItems[i]
    const itemId = itemRec.getString('item_id')
    const bancoNome = itemRec.getString('connector_name') || 'Open Finance'

    console.log('[PluggyCronSync] Verificando item ' + itemId + ' (' + bancoNome + ')')

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
      } else {
        console.log(
          '[PluggyCronSync] Erro accounts itemId=' + itemId + ' status=' + accRes.statusCode,
        )
      }
    } catch (err) {
      console.log('[PluggyCronSync] Exceção accounts itemId=' + itemId + ':', err)
    }

    let itemImported = 0
    let itemSkipped = 0

    for (let a = 0; a < accounts.length; a++) {
      const acc = accounts[a]
      const contaInternaId = mapearContaInterna(bancoNome, acc)

      let cursorNext = null
      let cursorStep = 1
      let accountTransactions = []

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
              accountTransactions.push(list[r])
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

      for (let t = 0; t < accountTransactions.length; t++) {
        const tx = accountTransactions[t]
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

        if (alreadyExists) {
          itemSkipped++
          continue
        }

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
          'Transação Open Finance sincronizada via Cron | Ref: ' + externalId,
        )

        try {
          $app.save(rec)
          itemImported++
        } catch (_) {}
      }
    }

    try {
      itemRec.set('last_sync_at', new Date().toISOString())
      $app.save(itemRec)
    } catch (_) {}

    console.log(
      '[PluggyCronSync] Item ' +
        itemId +
        ' finalizado: ' +
        itemImported +
        ' importadas, ' +
        itemSkipped +
        ' duplicadas ignoradas.',
    )
  }
})
