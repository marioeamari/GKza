routerAdd(
  'POST',
  '/backend/v1/pluggy/sync',
  (e) => {
    const clientId = $os.getenv('PLUGGY_CLIENT_ID') || '54b2a0af-7f3a-415e-8a8f-fa73d0aa6905'
    const clientSecret =
      $os.getenv('PLUGGY_CLIENT_SECRET') || 'RCqCZjybNbeJddKQ95JlAvjAbnmhLM0yXClwxpE4QYU'

    if (!clientId || !clientSecret) {
      return e.json(500, { error: 'Credenciais Pluggy não configuradas' })
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
      if (authRes.statusCode !== 200) {
        return e.json(502, { error: 'Falha ao autenticar com Pluggy' })
      }
      apiKey = authRes.json.apiKey
    } catch (err) {
      return e.json(502, { error: 'Erro de conexão com Pluggy', details: '' + err })
    }

    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const targetItemId = reqBody.itemId || ''

    // Se um itemId específico foi fornecido e a flag saveItem estiver ativa, salvar/atualizar na coleção pluggy_items
    let itemsToProcess = []
    if (targetItemId) {
      // Buscar dados do Item na Pluggy
      try {
        const itemRes = $http.send({
          url: 'https://api.pluggy.ai/items/' + targetItemId,
          method: 'GET',
          headers: { 'X-API-KEY': apiKey },
          timeout: 15,
        })
        if (itemRes.statusCode === 200 && itemRes.json) {
          const itemData = itemRes.json
          const conn = itemData.connector || {}
          let itemRecord = null
          try {
            itemRecord = $app.findFirstRecordByData('pluggy_items', 'item_id', targetItemId)
          } catch (_) {}

          if (!itemRecord) {
            const col = $app.findCollectionByNameOrId('pluggy_items')
            itemRecord = new Record(col)
            itemRecord.set('item_id', targetItemId)
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
        console.log('Erro ao salvar/atualizar pluggy_item:', err)
      }

      itemsToProcess.push(targetItemId)
    } else {
      // Buscar todos os items salvos no banco local
      try {
        const savedItems = $app.findRecordsByFilter('pluggy_items', '', '-created', 100, 0)
        for (let i = 0; i < savedItems.length; i++) {
          itemsToProcess.push(savedItems[i].getString('item_id'))
        }
      } catch (_) {}
    }

    if (itemsToProcess.length === 0) {
      return e.json(200, {
        message: 'Nenhum banco/item para sincronizar.',
        synced_count: 0,
      })
    }

    const pendentesCol = $app.findCollectionByNameOrId('telegram_registros_pendentes')
    let totalImported = 0
    let totalSkipped = 0

    // Para cada item, buscar contas e transações
    for (let i = 0; i < itemsToProcess.length; i++) {
      const currentItemId = itemsToProcess[i]

      // Buscar nome do conector (banco)
      let bancoNome = 'Open Finance'
      try {
        const itemRec = $app.findFirstRecordByData('pluggy_items', 'item_id', currentItemId)
        if (itemRec) {
          bancoNome = itemRec.getString('connector_name') || 'Open Finance'
        }
      } catch (_) {}

      // 1. Buscar contas daquele Item
      let accounts = []
      try {
        const accountsRes = $http.send({
          url: 'https://api.pluggy.ai/accounts?itemId=' + currentItemId,
          method: 'GET',
          headers: { 'X-API-KEY': apiKey },
          timeout: 15,
        })
        if (accountsRes.statusCode === 200 && accountsRes.json && accountsRes.json.results) {
          accounts = accountsRes.json.results
        }
      } catch (err) {
        console.log('Erro ao buscar contas do item ' + currentItemId + ':', err)
      }

      // Tentar associar conta bancária interna correspondente se existir
      let contaInternaId = ''
      try {
        const cRec = $app.findFirstRecordByData('contas', 'nome', bancoNome)
        if (cRec) contaInternaId = cRec.id
      } catch (_) {}

      // 2. Para cada conta, buscar transações recentes (últimos 30 dias)
      for (let a = 0; a < accounts.length; a++) {
        const account = accounts[a]
        const accId = account.id

        // Data de 30 dias atrás em YYYY-MM-DD
        const now = new Date()
        const fromDateObj = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        const fromDateStr = fromDateObj.toISOString().slice(0, 10)

        let transactions = []
        try {
          const txRes = $http.send({
            url:
              'https://api.pluggy.ai/transactions?accountId=' +
              accId +
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
        } catch (err) {
          console.log('Erro ao buscar transações da conta ' + accId + ':', err)
        }

        // Criar registros pendentes para transações não importadas
        for (let t = 0; t < transactions.length; t++) {
          const tx = transactions[t]
          const externalId = 'pluggy_' + tx.id

          // Verificar se já existe na triagem (anti-duplicidade por external_id)
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
            totalSkipped++
            continue
          }

          // Tratar valor e tipo
          // Na Pluggy, amount < 0 é débito/despesa, amount > 0 é crédito/receita (ou conforme tx.type)
          const rawAmount = tx.amount != null ? Number(tx.amount) : 0
          const absAmount = Math.abs(rawAmount)

          let tipo = 'despesa'
          if (tx.type === 'CREDIT' || rawAmount > 0) {
            tipo = 'receita'
          }

          // Data da transação
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
          rec.set('pluggy_item_id', currentItemId)
          rec.set('external_id', externalId)
          rec.set('telegram_origem', 'Open Finance (' + bancoNome + ')')
          rec.set(
            'comprovante_texto',
            'Transação Open Finance importada via Pluggy | Conta: ' +
              (account.name || account.number || '') +
              ' | Ref: ' +
              externalId,
          )

          try {
            $app.save(rec)
            totalImported++
          } catch (err) {
            console.log('Erro ao salvar registro pendente do Pluggy:', err)
          }
        }
      }

      // Atualizar data da última sincronização no item
      try {
        const itemRec = $app.findFirstRecordByData('pluggy_items', 'item_id', currentItemId)
        if (itemRec) {
          itemRec.set('last_sync_at', new Date().toISOString())
          itemRec.set('status', 'UPDATED')
          $app.save(itemRec)
        }
      } catch (_) {}
    }

    return e.json(200, {
      success: true,
      items_processed: itemsToProcess.length,
      imported_pendentes: totalImported,
      skipped_duplicates: totalSkipped,
    })
  },
  $apis.requireAuth(),
)
