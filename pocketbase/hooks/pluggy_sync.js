routerAdd(
  'POST',
  '/backend/v1/pluggy/sync',
  (e) => {
    const clientId = $os.getenv('PLUGGY_CLIENT_ID') || '54b2a0af-7f3a-415e-8a8f-fa73d0aa6905'
    const clientSecret =
      $os.getenv('PLUGGY_CLIENT_SECRET') || 'RCqCZjybNbeJddKQ95JlAvjAbnmhLM0yXClwxpE4QYU'

    if (!clientId || !clientSecret) {
      console.log('[PluggySync] ERRO: Credenciais Pluggy não configuradas.')
      return e.json(500, { error: 'Credenciais Pluggy não configuradas' })
    }

    // 1. Obter ApiKey
    let apiKey = ''
    try {
      console.log('[PluggySync] Autenticando com Pluggy API...')
      const authRes = $http.send({
        url: 'https://api.pluggy.ai/auth',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
        timeout: 15,
      })
      if (authRes.statusCode !== 200) {
        console.log('[PluggySync] ERRO auth status=' + authRes.statusCode + ' raw=' + authRes.raw)
        return e.json(502, {
          error: 'Falha ao autenticar com Pluggy',
          status: authRes.statusCode,
          details: authRes.raw,
        })
      }
      apiKey = authRes.json && authRes.json.apiKey ? authRes.json.apiKey : ''
      if (!apiKey) {
        console.log('[PluggySync] ERRO apiKey ausente na resposta de auth')
        return e.json(502, { error: 'Pluggy auth response sem apiKey' })
      }
    } catch (err) {
      console.log('[PluggySync] EXCEPTION ao autenticar:', err)
      return e.json(502, { error: 'Erro de conexão com Pluggy', details: '' + err })
    }

    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const targetItemId = reqBody.itemId || ''
    console.log('[PluggySync] Início da sincronização. targetItemId=' + (targetItemId || 'TODOS'))

    let itemsToProcess = []
    if (targetItemId) {
      // Buscar dados do Item na Pluggy para validar e atualizar no banco
      try {
        console.log('[PluggySync] Consultando GET /items/' + targetItemId)
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
          } else {
            itemRecord.set('error_message', '')
          }
          $app.save(itemRecord)
          console.log(
            '[PluggySync] Item ' +
              targetItemId +
              ' salvo/atualizado com sucesso. Status=' +
              itemData.status,
          )
        } else {
          console.log(
            '[PluggySync] AVISO GET /items/' +
              targetItemId +
              ' retornou status=' +
              itemRes.statusCode +
              ' raw=' +
              itemRes.raw,
          )
          // Se o item der 404 ou erro na API Pluggy, propagar erro
          if (itemRes.statusCode >= 400) {
            return e.json(itemRes.statusCode, {
              error: 'Erro ao consultar item na Pluggy: ' + (itemRes.raw || itemRes.statusCode),
            })
          }
        }
      } catch (err) {
        console.log('[PluggySync] ERRO ao consultar /items/' + targetItemId + ':', err)
        return e.json(502, {
          error: 'Falha de comunicação ao buscar item no Pluggy',
          details: '' + err,
        })
      }

      itemsToProcess.push(targetItemId)
    } else {
      // Buscar todos os items salvos no banco local
      try {
        const savedItems = $app.findRecordsByFilter('pluggy_items', '', '-created', 100, 0)
        for (let i = 0; i < savedItems.length; i++) {
          itemsToProcess.push(savedItems[i].getString('item_id'))
        }
      } catch (err) {
        console.log('[PluggySync] ERRO ao carregar pluggy_items locais:', err)
      }
    }

    if (itemsToProcess.length === 0) {
      console.log('[PluggySync] Nenhum banco/item para sincronizar.')
      return e.json(200, {
        success: true,
        message: 'Nenhum banco/item para sincronizar.',
        synced_count: 0,
        items_processed: 0,
        imported_pendentes: 0,
        skipped_duplicates: 0,
      })
    }

    const pendentesCol = $app.findCollectionByNameOrId('telegram_registros_pendentes')
    let totalImported = 0
    let totalSkipped = 0
    let itemsAudit = []
    let globalErrors = []

    // Cache local de contas cadastradas no ERP para vinculo inteligente
    let contasCadastradas = []
    try {
      contasCadastradas = $app.findRecordsByFilter('contas', '', 'nome', 100, 0)
    } catch (_) {}

    function mapearContaInterna(bancoNome, accountData) {
      if (!contasCadastradas || contasCadastradas.length === 0) return ''
      const bNomeNorm = (bancoNome || '').toLowerCase().trim()
      const accNameNorm = (accountData && accountData.name ? accountData.name : '')
        .toLowerCase()
        .trim()

      for (let i = 0; i < contasCadastradas.length; i++) {
        const c = contasCadastradas[i]
        const cNome = (c.getString('nome') || '').toLowerCase().trim()
        if (!cNome || cNome === '0') continue

        // Comparação exata
        if (cNome === bNomeNorm || cNome === accNameNorm) {
          return c.id
        }
        // Substring / banco conhecido (ex: nubank, sicred, porto seguro, itau, inter, bb)
        if (
          (bNomeNorm && cNome.indexOf(bNomeNorm) !== -1) ||
          (bNomeNorm && bNomeNorm.indexOf(cNome) !== -1)
        ) {
          return c.id
        }
      }
      return ''
    }

    // Para cada item, buscar contas e transações
    for (let i = 0; i < itemsToProcess.length; i++) {
      const currentItemId = itemsToProcess[i]
      let itemStatus = 'UNKNOWN'
      let bancoNome = 'Open Finance'
      let itemAudit = {
        itemId: currentItemId,
        accountsCount: 0,
        transactionsFound: 0,
        transactionsImported: 0,
        transactionsSkipped: 0,
        errors: [],
      }

      // Buscar nome do conector (banco) salvo
      try {
        const itemRec = $app.findFirstRecordByData('pluggy_items', 'item_id', currentItemId)
        if (itemRec) {
          bancoNome = itemRec.getString('connector_name') || 'Open Finance'
          itemStatus = itemRec.getString('status') || 'UPDATED'
        }
      } catch (_) {}

      console.log(
        '[PluggySync] Processando item ' +
          currentItemId +
          ' (' +
          bancoNome +
          ') status=' +
          itemStatus,
      )

      // 1. Buscar contas daquele Item
      let accounts = []
      try {
        const accountsRes = $http.send({
          url: 'https://api.pluggy.ai/accounts?itemId=' + currentItemId,
          method: 'GET',
          headers: { 'X-API-KEY': apiKey },
          timeout: 15,
        })

        console.log(
          '[PluggySync] GET /accounts?itemId=' +
            currentItemId +
            ' status=' +
            accountsRes.statusCode +
            ' bodyPreview=' +
            (accountsRes.raw || '').slice(0, 150),
        )

        if (accountsRes.statusCode !== 200) {
          const errDetail =
            'Falha ao buscar contas (HTTP ' +
            accountsRes.statusCode +
            '): ' +
            (accountsRes.raw || '')
          console.log('[PluggySync] ' + errDetail)
          itemAudit.errors.push(errDetail)
          globalErrors.push(errDetail)
        } else if (accountsRes.json && accountsRes.json.results) {
          accounts = accountsRes.json.results
        }
      } catch (err) {
        const errDetail = 'Exceção de rede ao buscar contas do item ' + currentItemId + ': ' + err
        console.log('[PluggySync] ' + errDetail)
        itemAudit.errors.push(errDetail)
        globalErrors.push(errDetail)
      }

      itemAudit.accountsCount = accounts.length
      console.log(
        '[PluggySync] Item ' +
          currentItemId +
          ' possui ' +
          accounts.length +
          ' conta(s) retornada(s).',
      )

      // 2. Para cada conta, buscar transações com paginação
      // Período: últimos 90 dias para garantir cobertura inicial ampla e recente
      const now = new Date()
      const fromDateObj = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      const fromDateStr = fromDateObj.toISOString().slice(0, 10)
      const toDateStr = now.toISOString().slice(0, 10)

      for (let a = 0; a < accounts.length; a++) {
        const account = accounts[a]
        const accId = account.id
        const accType = account.type || 'BANK'
        const accName = account.name || account.marketingName || 'Conta ' + (a + 1)
        const contaInternaId = mapearContaInterna(bancoNome, account)

        console.log(
          '[PluggySync] Buscando transações da conta ' +
            accId +
            ' (' +
            accName +
            ', tipo=' +
            accType +
            ', internaId=' +
            (contaInternaId || 'SEM_CONTA_AUTOMATICA') +
            ') de ' +
            fromDateStr +
            ' até ' +
            toDateStr,
        )

        let cursorNext = null
        let cursorStep = 1
        let accountTransactions = []

        // Loop de paginação por cursor (GET /v2/transactions)
        while (cursorStep <= 20) {
          // trava de segurança de até 20 iterações de cursor
          try {
            let txUrl = ''
            if (cursorNext) {
              // cursorNext já vem pronto como query string, ex: "?accountId=...&after=..." ou similar
              const nextQuery = cursorNext.startsWith('?') ? cursorNext : '?' + cursorNext
              txUrl = 'https://api.pluggy.ai/v2/transactions' + nextQuery
            } else {
              txUrl =
                'https://api.pluggy.ai/v2/transactions?accountId=' +
                accId +
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

            console.log(
              '[PluggySync] GET /v2/transactions account=' +
                accId +
                ' cursorStep=' +
                cursorStep +
                ' status=' +
                txRes.statusCode +
                ' bodyPreview=' +
                (txRes.raw || '').slice(0, 150),
            )

            if (txRes.statusCode !== 200) {
              const errDetail =
                'Erro ao buscar transações da conta ' +
                accId +
                ' cursor ' +
                cursorStep +
                ' (HTTP ' +
                txRes.statusCode +
                '): ' +
                (txRes.raw || '')
              console.log('[PluggySync] ' + errDetail)
              itemAudit.errors.push(errDetail)
              globalErrors.push(errDetail)
              break
            }

            if (txRes.json && txRes.json.results) {
              const resList = txRes.json.results || []
              for (let r = 0; r < resList.length; r++) {
                accountTransactions.push(resList[r])
              }

              // Pluggy v2/transactions retorna 'next' (string com query params ou null)
              cursorNext = txRes.json.next || null
              if (!cursorNext) {
                break
              }
            } else {
              break
            }
          } catch (err) {
            const errDetail =
              'Exceção ao buscar transações da conta ' +
              accId +
              ' cursor ' +
              cursorStep +
              ': ' +
              err
            console.log('[PluggySync] ' + errDetail)
            itemAudit.errors.push(errDetail)
            globalErrors.push(errDetail)
            break
          }

          cursorStep++
        }

        itemAudit.transactionsFound += accountTransactions.length
        console.log(
          '[PluggySync] Conta ' +
            accId +
            ' retornou ' +
            accountTransactions.length +
            ' transação(ões) no total.',
        )

        // Criar registros pendentes para transações não importadas
        for (let t = 0; t < accountTransactions.length; t++) {
          const tx = accountTransactions[t]
          const rawId = tx.id || ''
          if (!rawId) continue

          const externalId = 'pluggy_' + rawId

          // Verificar se já existe na triagem (anti-duplicidade idempotente por external_id)
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
            itemAudit.transactionsSkipped++
            continue
          }

          // Tratar valor e tipo
          // Na API Pluggy:
          // Se amount < 0 => Débito / Despesa
          // Se amount > 0 => Crédito / Receita
          // tx.type pode ser 'DEBIT' ou 'CREDIT'
          const rawAmount = tx.amount != null ? Number(tx.amount) : 0
          const absAmount = Math.abs(rawAmount)

          let tipo = 'despesa'
          if (tx.type === 'CREDIT' || (tx.type !== 'DEBIT' && rawAmount > 0)) {
            tipo = 'receita'
          }

          // Data da transação (ISO YYYY-MM-DD)
          let txDate = tx.date ? tx.date.slice(0, 10) : new Date().toISOString().slice(0, 10)

          const desc =
            tx.description ||
            tx.descriptionRaw ||
            (account.name ? 'Transação ' + account.name : 'Transação ' + bancoNome)

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

          const detalhesConta = [
            account.name || '',
            account.number ? 'Nº ' + account.number : '',
            tx.category ? 'Cat: ' + tx.category : '',
            tx.paymentData && tx.paymentData.paymentMethod
              ? 'Método: ' + tx.paymentData.paymentMethod
              : '',
          ]
            .filter((s) => !!s)
            .join(' | ')

          rec.set(
            'comprovante_texto',
            'Open Finance (' +
              bancoNome +
              ')' +
              (detalhesConta ? ' | ' + detalhesConta : '') +
              ' | Ref: ' +
              externalId,
          )

          try {
            $app.save(rec)
            totalImported++
            itemAudit.transactionsImported++
          } catch (err) {
            const errDetail =
              'Erro ao salvar registro pendente Pluggy tx ' + externalId + ': ' + err
            console.log('[PluggySync] ' + errDetail)
            itemAudit.errors.push(errDetail)
          }
        }
      }

      // Atualizar data da última sincronização e contagem de erro no item
      try {
        const itemRec = $app.findFirstRecordByData('pluggy_items', 'item_id', currentItemId)
        if (itemRec) {
          itemRec.set('last_sync_at', new Date().toISOString())
          if (itemAudit.errors.length > 0) {
            itemRec.set('error_message', itemAudit.errors.slice(0, 3).join('; '))
          } else {
            itemRec.set('error_message', '')
          }
          $app.save(itemRec)
        }
      } catch (_) {}

      itemsAudit.push(itemAudit)
    }

    console.log(
      '[PluggySync] Sincronização finalizada. Itens=' +
        itemsToProcess.length +
        ' Importadas=' +
        totalImported +
        ' IgnoradasDuplicadas=' +
        totalSkipped +
        ' ErrosGlobais=' +
        globalErrors.length,
    )

    // Se houve chamada específica para um item e ocorreram erros na busca e 0 transações foram importadas,
    // propagar status de erro conforme solicitado
    if (targetItemId && globalErrors.length > 0 && totalImported === 0) {
      return e.json(502, {
        success: false,
        error: 'Falha durante sincronização com Pluggy: ' + globalErrors[0],
        errors: globalErrors,
        items_processed: itemsToProcess.length,
        imported_pendentes: totalImported,
        skipped_duplicates: totalSkipped,
        audit: itemsAudit,
      })
    }

    return e.json(200, {
      success: true,
      items_processed: itemsToProcess.length,
      imported_pendentes: totalImported,
      skipped_duplicates: totalSkipped,
      warnings: globalErrors.length > 0 ? globalErrors : undefined,
      audit: itemsAudit,
    })
  },
  $apis.requireAuth(),
)
