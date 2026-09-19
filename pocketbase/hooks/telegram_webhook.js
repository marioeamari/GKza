routerAdd('POST', '/backend/v1/telegram/webhook', (e) => {
  // 1. Validar Secret Token do Telegram (se configurado)
  const configuredSecret = $os.getenv('TELEGRAM_WEBHOOK_SECRET') || ''
  if (configuredSecret) {
    const incomingSecret =
      e.request.header.get('X-Telegram-Bot-Api-Secret-Token') ||
      e.requestInfo().query['secret'] ||
      ''
    if (incomingSecret !== configuredSecret) {
      console.log('Telegram webhook secret mismatch')
      return e.json(403, { error: 'invalid_secret' })
    }
  }

  const token = $os.getenv('TELEGRAM_BOT_TOKEN') || '8648870507:AAGZPIM5pyNjbcNfFmzZDgYaC5wuBj0cq8s'
  if (!token) {
    console.log('TELEGRAM_BOT_TOKEN not configured')
    return e.json(500, { error: 'bot_token_not_configured' })
  }

  const body = e.requestInfo().body || {}
  const callbackQuery = body.callback_query || null
  const message = body.message || body.edited_message || null

  // Helpers inline para a API do Telegram
  const sendTelegramMsg = (chatId, replyText, replyMarkup) => {
    try {
      const payload = {
        chat_id: chatId,
        text: replyText,
      }
      if (replyMarkup) {
        payload.reply_markup = replyMarkup
      }
      return $http.send({
        url: 'https://api.telegram.org/bot' + token + '/sendMessage',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeout: 15,
      })
    } catch (err) {
      console.log('Failed to send Telegram message:', err.message)
      return null
    }
  }

  const answerCallbackQuery = (callbackQueryId, textAlert) => {
    try {
      $http.send({
        url: 'https://api.telegram.org/bot' + token + '/answerCallbackQuery',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: textAlert || '',
          show_alert: false,
        }),
        timeout: 10,
      })
    } catch (err) {
      console.log('Failed to answer callback query:', err.message)
    }
  }

  const editTelegramReplyMarkup = (chatId, messageId, replyMarkup) => {
    try {
      $http.send({
        url: 'https://api.telegram.org/bot' + token + '/editMessageReplyMarkup',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: replyMarkup || { inline_keyboard: [] },
        }),
        timeout: 10,
      })
    } catch (err) {
      console.log('Failed to edit message reply markup:', err.message)
    }
  }

  // Helpers de Sessão inline
  const getSession = (chatId) => {
    try {
      const strChatId = String(chatId)
      const records = $app.findRecordsByFilter(
        'telegram_sessions',
        `chat_id = '${strChatId}'`,
        '-updated',
        1,
        0,
      )
      if (records && records.length > 0) {
        return records[0]
      }
    } catch (err) {
      console.log('Error getting session for ' + chatId + ': ' + err.message)
    }
    return null
  }

  // Helper robusto para ler draft_data como objeto JS nativo plano
  const getDraftFromSession = (session) => {
    if (!session) return {}
    try {
      // No PocketBase v0.36 Goja, session.get('draft_data') ou session.getString('draft_data')
      let raw = null
      try {
        raw = session.get('draft_data')
      } catch (_) {}

      if (raw === null || raw === undefined || raw === '') {
        try {
          const strVal = session.getString('draft_data')
          if (strVal && strVal !== '{}') {
            raw = strVal
          }
        } catch (_) {}
      }

      if (!raw) return {}

      if (typeof raw === 'string') {
        const trimmed = raw.trim()
        if (!trimmed || trimmed === '{}' || trimmed === '[]') return {}
        try {
          const parsed = JSON.parse(trimmed)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed
          }
        } catch (parseErr) {
          console.log('JSON parse string error on draft_data:', parseErr.message)
          return {}
        }
      }

      // Se for Go map/proxy do Goja, clonar via JSON.stringify e depois JSON.parse
      try {
        const jsonStr = JSON.stringify(raw)
        if (jsonStr && jsonStr !== '{}') {
          const parsed = JSON.parse(jsonStr)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed
          }
        }
      } catch (cloneErr) {
        console.log('JSON stringify clone error on draft_data:', cloneErr.message)
      }

      return {}
    } catch (e) {
      console.log('Error reading draft_data from session:', e.message)
      return {}
    }
  }

  const saveSession = (chatId, state, draftData, pendingQuestion, contextoNome) => {
    try {
      const strChatId = String(chatId)
      let session = getSession(strChatId)
      if (!session) {
        const col = $app.findCollectionByNameOrId('telegram_sessions')
        session = new Record(col)
        session.set('chat_id', strChatId)
      }

      session.set('state', state || 'idle')

      // Construir um objeto JavaScript limpo e explícito, garantindo valores primitivos seguros
      let safeDraft = {}
      if (draftData && typeof draftData === 'object' && !Array.isArray(draftData)) {
        try {
          safeDraft = JSON.parse(JSON.stringify(draftData))
        } catch (_) {
          safeDraft = Object.assign({}, draftData)
        }
      }

      session.set('draft_data', safeDraft)
      session.set('pending_question', pendingQuestion || '')
      if (contextoNome !== undefined) {
        session.set('contexto_nome', contextoNome || '')
      }

      $app.save(session)
      return session
    } catch (err) {
      console.log('Failed to save session for ' + chatId + ': ' + err.message)
      return null
    }
  }

  const clearSessionDraft = (chatId) => {
    try {
      const strChatId = String(chatId)
      const session = getSession(strChatId)
      if (session) {
        session.set('state', 'idle')
        session.set('draft_data', {})
        session.set('pending_question', '')
        $app.save(session)
      }
    } catch (err) {
      console.log('Failed to clear session for ' + chatId + ': ' + err.message)
    }
  }

  // Gerador de teclado inline com paginação
  const buildInlineKeyboard = (action, items, page, pageSize, totalPages) => {
    // items: array de { id, label }
    const inlineKeyboard = []
    const start = page * pageSize
    const pageItems = items.slice(start, start + pageSize)

    // Organizar botões em 2 por linha se os labels forem curtos, ou 1 por linha
    for (let i = 0; i < pageItems.length; i += 2) {
      const row = []
      row.push({
        text: '🔘 ' + pageItems[i].label,
        callback_data: action + ':' + pageItems[i].id,
      })
      if (i + 1 < pageItems.length) {
        row.push({
          text: '🔘 ' + pageItems[i + 1].label,
          callback_data: action + ':' + pageItems[i + 1].id,
        })
      }
      inlineKeyboard.push(row)
    }

    // Linha de navegação se houver múltiplas páginas
    if (totalPages > 1) {
      const navRow = []
      if (page > 0) {
        navRow.push({
          text: '◀️ Anterior',
          callback_data: 'page:' + action + ':' + (page - 1),
        })
      }
      navRow.push({
        text: page + 1 + '/' + totalPages,
        callback_data: 'noop',
      })
      if (page < totalPages - 1) {
        navRow.push({
          text: 'Próxima ▶️',
          callback_data: 'page:' + action + ':' + (page + 1),
        })
      }
      inlineKeyboard.push(navRow)
    }

    // Linha com botão cancelar
    inlineKeyboard.push([{ text: '❌ Cancelar', callback_data: 'cancel:draft' }])

    return { inline_keyboard: inlineKeyboard }
  }

  // Perguntas estruturadas com botões
  const askTipo = (chatId, draft) => {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔴 Despesa (Saída)', callback_data: 'tipo:despesa' },
          { text: '🟢 Receita (Entrada)', callback_data: 'tipo:receita' },
        ],
        [{ text: '❌ Cancelar', callback_data: 'cancel:draft' }],
      ],
    }
    saveSession(chatId, 'awaiting_tipo', draft, 'tipo', draft.contexto_nome || '')
    sendTelegramMsg(
      chatId,
      'Escolha o tipo do lançamento:\n(Toque na opção desejada abaixo)',
      keyboard,
    )
  }

  const askCategoria = (chatId, draft, page) => {
    const curPage = page || 0
    const pageSize = 6
    let filter = ''
    if (draft.tipo) {
      filter = `tipo = '${draft.tipo}'`
    }
    let cats = []
    try {
      cats = $app.findRecordsByFilter('categorias', filter, 'nome', 50, 0)
    } catch (_) {}

    // Fallback: se não achar com filtro de tipo, tentar todas as categorias
    if (cats.length === 0 && draft.tipo) {
      try {
        cats = $app.findRecordsByFilter('categorias', '', 'nome', 50, 0)
      } catch (_) {}
    }

    const items = cats.map((c) => ({
      id: c.id,
      label: c.getString('nome'),
    }))

    if (items.length === 0) {
      // Se não houver categoria cadastrada, tentar buscar qualquer categoria padrão do sistema
      try {
        const defaultCats = $app.findRecordsByFilter('categorias', '', 'nome', 1, 0)
        if (defaultCats.length > 0) {
          draft.categoria = defaultCats[0].id
        } else {
          draft.categoria = 'skip'
        }
      } catch (_) {
        draft.categoria = 'skip'
      }
      saveSession(chatId, 'processing', draft, 'categoria', draft.contexto_nome || '')
      checkNextStep(chatId, draft)
      return
    }

    const totalPages = Math.ceil(items.length / pageSize)
    const keyboard = buildInlineKeyboard('cat', items, curPage, pageSize, totalPages)

    saveSession(chatId, 'awaiting_categoria', draft, 'categoria', draft.contexto_nome || '')
    const pageInd = totalPages > 1 ? ` (Página ${curPage + 1}/${totalPages})` : ''
    sendTelegramMsg(
      chatId,
      '📂 Selecione a Categoria do sistema' + pageInd + ':\n(Use os botões abaixo)',
      keyboard,
    )
  }

  const askConta = (chatId, draft, page) => {
    const curPage = page || 0
    const pageSize = 6
    let contas = []
    try {
      contas = $app.findRecordsByFilter('contas', 'ativa = true', 'nome', 50, 0)
    } catch (_) {
      try {
        contas = $app.findRecordsByFilter('contas', '', 'nome', 50, 0)
      } catch (_) {}
    }

    // Se não encontrou nenhuma ativa, trazer todas
    if (contas.length === 0) {
      try {
        contas = $app.findRecordsByFilter('contas', '', 'nome', 50, 0)
      } catch (_) {}
    }

    const items = contas.map((c) => {
      const nome = c.getString('nome')
      const tipo = c.getString('tipo')
      const bandeira = c.getString('bandeira')
      let label = nome
      if (tipo === 'cartao' && bandeira) {
        label = nome + ' (' + bandeira + ')'
      }
      return { id: c.id, label: label }
    })

    if (items.length === 0) {
      // Se não houver conta cadastrada, buscar qualquer conta padrão
      try {
        const defaultContas = $app.findRecordsByFilter('contas', '', 'nome', 1, 0)
        if (defaultContas.length > 0) {
          draft.conta = defaultContas[0].id
        } else {
          draft.conta = 'skip'
        }
      } catch (_) {
        draft.conta = 'skip'
      }
      saveSession(chatId, 'processing', draft, 'conta', draft.contexto_nome || '')
      checkNextStep(chatId, draft)
      return
    }

    const totalPages = Math.ceil(items.length / pageSize)
    const keyboard = buildInlineKeyboard('conta', items, curPage, pageSize, totalPages)

    saveSession(chatId, 'awaiting_conta', draft, 'conta', draft.contexto_nome || '')
    const pageInd = totalPages > 1 ? ` (Página ${curPage + 1}/${totalPages})` : ''
    sendTelegramMsg(
      chatId,
      '🏦 Selecione a Conta/Cartão do sistema' + pageInd + ':\n(Use os botões abaixo)',
      keyboard,
    )
  }

  const askContexto = (chatId, draft, page) => {
    const curPage = page || 0
    const pageSize = 6
    let grupos = []
    try {
      grupos = $app.findRecordsByFilter('contexto_grupos', '', 'ordem,nome', 50, 0)
    } catch (_) {}

    const items = grupos.map((g) => ({
      id: g.id,
      label: g.getString('nome'),
    }))

    // Adicionar opção "Nenhum / Geral"
    items.unshift({ id: 'none', label: 'Geral (Sem grupo)' })

    const totalPages = Math.ceil(items.length / pageSize)
    const keyboard = buildInlineKeyboard('ctx', items, curPage, pageSize, totalPages)

    saveSession(chatId, 'awaiting_contexto', draft, 'contexto', draft.contexto_nome || '')
    const pageInd = totalPages > 1 ? ` (Página ${curPage + 1}/${totalPages})` : ''
    sendTelegramMsg(
      chatId,
      '🏢 Selecione o Contexto / Grupo' + pageInd + ':\n(Toque na opção desejada)',
      keyboard,
    )
  }

  // Executar criação definitiva do lançamento com anti-duplicidade
  // autoCreated: boolean que indica se foi registrado no modo rápido direto
  const finalizeLancamento = (chatId, draft, autoCreated) => {
    try {
      const valor = parseFloat(draft.valor)
      if (!valor || isNaN(valor) || valor <= 0) {
        sendTelegramMsg(
          chatId,
          '⚠️ Valor inválido. Por favor, digite o valor correto em reais (ex: 184,32):',
        )
        saveSession(chatId, 'awaiting_valor', draft, 'valor')
        return
      }

      // Validar data
      let dataIso = draft.data || ''
      if (!dataIso) {
        dataIso = new Date().toISOString()
      } else if (!dataIso.includes('T') && !dataIso.includes(' ')) {
        dataIso = dataIso + ' 12:00:00.000Z'
      }

      const colLancamentos = $app.findCollectionByNameOrId('lancamentos')

      // Anti-duplicidade: verificar lançamento com mesmo valor, tipo e data recente
      const dateOnly = dataIso.slice(0, 10)
      const duplicateFilter = `valor = ${valor} && tipo = '${draft.tipo}' && data >= '${dateOnly} 00:00:00.000Z' && data <= '${dateOnly} 23:59:59.999Z'`
      try {
        const dupes = $app.findRecordsByFilter('lancamentos', duplicateFilter, '-created', 1, 0)
        if (dupes && dupes.length > 0) {
          const dupeRec = dupes[0]
          // Se já existe e a descrição for parecida ou o usuário não confirmou explicitamente
          if (!draft.force_duplicate) {
            const kb = {
              inline_keyboard: [
                [
                  { text: '⚠️ Lançar mesmo assim', callback_data: 'confirm_dupe:yes' },
                  { text: '❌ Cancelar lançamento', callback_data: 'cancel:draft' },
                ],
              ],
            }
            saveSession(chatId, 'awaiting_duplicate_confirm', draft, 'duplicate_confirm')
            sendTelegramMsg(
              chatId,
              '⚠️ ALERTA DE DUPLICIDADE:\n' +
                'Já existe um lançamento registrado hoje com o mesmo valor!\n' +
                '• Descrição anterior: ' +
                dupeRec.getString('descricao') +
                '\n' +
                '• Valor: R$ ' +
                Number(valor).toFixed(2).replace('.', ',') +
                '\n\n' +
                'Deseja criar este novo lançamento mesmo assim?',
              kb,
            )
            return
          }
        }
      } catch (errDupe) {
        console.log('Error checking duplicates:', errDupe.message)
      }

      // Garantir categoria válida obrigatória
      let finalCatId = draft.categoria
      if (!finalCatId || finalCatId === 'skip') {
        try {
          const fallbackCats = $app.findRecordsByFilter(
            'categorias',
            `tipo = '${draft.tipo || 'despesa'}'`,
            'nome',
            1,
            0,
          )
          if (fallbackCats.length > 0) {
            finalCatId = fallbackCats[0].id
          } else {
            const anyCat = $app.findRecordsByFilter('categorias', '', 'nome', 1, 0)
            if (anyCat.length > 0) finalCatId = anyCat[0].id
          }
        } catch (_) {}
      }

      // Garantir conta válida obrigatória
      let finalContaId = draft.conta
      if (!finalContaId || finalContaId === 'skip') {
        try {
          const fallbackContas = $app.findRecordsByFilter('contas', 'ativa = true', 'nome', 1, 0)
          if (fallbackContas.length > 0) {
            finalContaId = fallbackContas[0].id
          } else {
            const anyConta = $app.findRecordsByFilter('contas', '', 'nome', 1, 0)
            if (anyConta.length > 0) finalContaId = anyConta[0].id
          }
        } catch (_) {}
      }

      // Criar o registro
      const rec = new Record(colLancamentos)
      rec.set('descricao', draft.descricao || 'Lançamento via Telegram')
      rec.set('valor', valor)
      rec.set('tipo', draft.tipo || 'despesa')
      rec.set('data', dataIso)
      rec.set('status', draft.status || 'pago')
      rec.set('conta', finalContaId)
      rec.set('categoria', finalCatId)
      if (draft.empresa) rec.set('empresa', draft.empresa)
      if (draft.pessoa) rec.set('pessoa', draft.pessoa)

      let obs = draft.observacoes || 'Registrado via Telegram Bot GKza'
      if (draft.contexto_nome) {
        obs += ' [Contexto: ' + draft.contexto_nome + ']'
      }
      rec.set('observacoes', obs)

      $app.save(rec)

      // Obter nomes para exibição amigável
      let contaNome = 'Conta Padrão'
      if (finalContaId) {
        try {
          const cRec = $app.findRecordById('contas', finalContaId)
          contaNome = cRec.getString('nome')
        } catch (_) {}
      }

      let catNome = 'Geral'
      if (finalCatId) {
        try {
          const kRec = $app.findRecordById('categorias', finalCatId)
          catNome = kRec.getString('nome')
        } catch (_) {}
      }

      // Limpar sessão ativa
      clearSessionDraft(chatId)

      const tipoEmoji = draft.tipo === 'receita' ? '🟢' : '🔴'
      const tipoLabel = draft.tipo === 'receita' ? 'Receita' : 'Despesa'
      const valorFmt = 'R$ ' + Number(valor).toFixed(2).replace('.', ',')
      const dataFmt = dateOnly.split('-').reverse().join('/')

      const pageLink = draft.tipo === 'despesa' ? '/despesas' : '/lancamentos'
      const descFmt = draft.descricao || '-'
      const ctxFmt = draft.contexto_nome ? draft.contexto_nome : 'Geral'

      let successMsg = ''
      if (autoCreated) {
        successMsg =
          '✅ ' +
          tipoLabel +
          ' registrada: ' +
          descFmt +
          ', ' +
          valorFmt +
          ', categoria ' +
          catNome +
          ', conta ' +
          contaNome +
          ', contexto ' +
          ctxFmt +
          '.\n\n' +
          'Confira os dados no sistema em ' +
          pageLink +
          ' — lá você pode editar ou excluir caso algo tenha ficado errado.'
      } else {
        successMsg =
          '✅ ' +
          tipoLabel +
          ' confirmada e registrada no GKza!\n\n' +
          '• ' +
          tipoEmoji +
          ' Tipo: ' +
          tipoLabel +
          '\n' +
          '• 📝 Descrição: ' +
          descFmt +
          '\n' +
          '• 💰 Valor: ' +
          valorFmt +
          '\n' +
          '• 📂 Categoria: ' +
          catNome +
          '\n' +
          '• 🏦 Conta: ' +
          contaNome +
          '\n' +
          '• 📅 Data: ' +
          dataFmt +
          '\n' +
          (draft.contexto_nome ? '• 🏢 Contexto: ' + draft.contexto_nome + '\n' : '') +
          '\nConfira ou ajuste os dados no sistema em ' +
          pageLink +
          '.'
      }

      sendTelegramMsg(chatId, successMsg)
    } catch (errSave) {
      console.log('Failed to finalize lancamento:', errSave.message)
      sendTelegramMsg(chatId, '❌ Erro ao salvar lançamento no sistema: ' + errSave.message)
    }
  }

  // Máquina de estados: verifica o próximo dado pendente na ordem fixa:
  // tipo → categoria → conta/cartão → contexto → valor → descrição → data → confirmação
  const checkNextStep = (chatId, draft) => {
    // 1. Tipo (despesa ou receita)
    if (!draft.tipo) {
      askTipo(chatId, draft)
      return
    }

    // Se o tipo mudou, verificar se a categoria atual pertence ao mesmo tipo
    if (draft.categoria && draft.categoria !== 'skip') {
      try {
        const catRec = $app.findRecordById('categorias', draft.categoria)
        if (catRec.getString('tipo') && catRec.getString('tipo') !== draft.tipo) {
          // Incompatível com o novo tipo: limpar para perguntar novamente de acordo com o tipo escolhido
          draft.categoria = null
        }
      } catch (_) {
        draft.categoria = null
      }
    }

    // 2. Categoria (botões do sistema)
    if (!draft.categoria) {
      askCategoria(chatId, draft, 0)
      return
    }

    // Se a categoria selecionada foi apagada ou id é inválido
    if (draft.categoria && draft.categoria !== 'skip') {
      try {
        $app.findRecordById('categorias', draft.categoria)
      } catch (_) {
        // Categoria não existe mais, pedir novamente
        draft.categoria = null
        askCategoria(chatId, draft, 0)
        return
      }
    }

    // 3. Conta / Cartão (botões do sistema)
    if (!draft.conta) {
      askConta(chatId, draft, 0)
      return
    }

    // Se o usuário selecionou uma conta mas ela foi apagada ou id é inválido
    if (draft.conta && draft.conta !== 'skip') {
      try {
        $app.findRecordById('contas', draft.conta)
      } catch (_) {
        // Conta não existe mais, pedir novamente
        draft.conta = null
        askConta(chatId, draft, 0)
        return
      }
    }

    // 4. Contexto / Grupo (se ainda não definido no draft ou na sessão)
    if (!draft.contexto_definido && !draft.contexto_nome) {
      askContexto(chatId, draft, 0)
      return
    }

    // 5. Valor (numérico)
    const numVal = parseFloat(draft.valor)
    if (!numVal || isNaN(numVal) || numVal <= 0) {
      saveSession(chatId, 'awaiting_valor', draft, 'valor', draft.contexto_nome || '')
      sendTelegramMsg(chatId, '💬 Por favor, digite o VALOR em reais (ex: 184,32 ou 250):')
      return
    }

    // 6. Descrição (texto)
    const isDescricaoValida =
      draft.descricao &&
      draft.descricao.trim() !== '' &&
      draft.descricao.trim() !== 'Lançamento via Telegram'
    if (!isDescricaoValida) {
      saveSession(chatId, 'awaiting_descricao', draft, 'descricao', draft.contexto_nome || '')
      sendTelegramMsg(
        chatId,
        '💬 Por favor, digite a DESCRIÇÃO ou nome do favorecido/recebimento (ex: CPFL Energia, Supermercado, Aluguel):',
      )
      return
    }

    // 7. Data (se não preenchida, padrão Hoje)
    if (!draft.data) {
      draft.data = new Date().toISOString().slice(0, 10)
    }

    // 8. Todos os campos preenchidos: exibir confirmação com todos os dados
    let contaNome = 'Padrão / Geral'
    if (draft.conta && draft.conta !== 'skip') {
      try {
        const cRec = $app.findRecordById('contas', draft.conta)
        contaNome = cRec.getString('nome')
      } catch (_) {
        contaNome = draft.conta
      }
    }

    let catNome = 'Geral'
    if (draft.categoria && draft.categoria !== 'skip') {
      try {
        const kRec = $app.findRecordById('categorias', draft.categoria)
        catNome = kRec.getString('nome')
      } catch (_) {
        catNome = draft.categoria
      }
    }

    const valorFmt = 'R$ ' + numVal.toFixed(2).replace('.', ',')
    const tipoLabel = draft.tipo === 'receita' ? '🟢 Receita' : '🔴 Despesa'
    const dataFmt = draft.data ? draft.data.slice(0, 10).split('-').reverse().join('/') : 'Hoje'

    let confirmMsg =
      '📋 Resumo do lançamento para confirmação:\n\n' +
      '• Tipo: ' +
      tipoLabel +
      '\n' +
      '• Descrição: ' +
      draft.descricao +
      '\n' +
      '• Valor: ' +
      valorFmt +
      '\n' +
      '• Categoria: ' +
      catNome +
      '\n' +
      '• Conta: ' +
      contaNome +
      '\n' +
      '• Data: ' +
      dataFmt +
      '\n'

    if (draft.contexto_nome) {
      confirmMsg += '• Contexto: ' + draft.contexto_nome + '\n'
    }

    confirmMsg += '\nDeseja registrar agora?'

    const confirmKb = {
      inline_keyboard: [
        [
          { text: '✅ Sim, registrar agora', callback_data: 'confirm:yes' },
          { text: '❌ Cancelar', callback_data: 'cancel:draft' },
        ],
      ],
    }

    saveSession(chatId, 'awaiting_confirmation', draft, 'confirmation', draft.contexto_nome || '')
    sendTelegramMsg(chatId, confirmMsg, confirmKb)
  }

  // ----------------------------------------------------
  // TRATAMENTO DE CALLBACK QUERY (BOTÕES INLINE / RADIOS)
  // ----------------------------------------------------
  if (callbackQuery) {
    const cbId = callbackQuery.id
    const cbData = callbackQuery.data || ''
    const cbChatId =
      callbackQuery.message && callbackQuery.message.chat
        ? callbackQuery.message.chat.id
        : callbackQuery.from
          ? callbackQuery.from.id
          : null
    const cbMsgId = callbackQuery.message ? callbackQuery.message.message_id : null

    // Resposta imediata obrigatória para o Telegram parar a animação do botão (relógio)
    if (cbId) {
      answerCallbackQuery(cbId, 'Opção registrada!')
    }

    if (!cbChatId) {
      return e.json(200, { ok: true })
    }

    const session = getSession(cbChatId)
    const draft = getDraftFromSession(session)

    // Se o draft estiver vazio mas houver contexto salvo na sessão, preservar
    if (session && !draft.contexto_nome) {
      const savedCtx = session.getString('contexto_nome')
      if (savedCtx) draft.contexto_nome = savedCtx
    }

    // Se o usuário clicar em Cancelar
    if (cbData === 'cancel:draft') {
      clearSessionDraft(cbChatId)
      if (cbMsgId) {
        editTelegramReplyMarkup(cbChatId, cbMsgId, { inline_keyboard: [] })
      }
      sendTelegramMsg(
        cbChatId,
        '❌ Operação cancelada. Envie um novo comprovante ou mensagem quando desejar.',
      )
      return e.json(200, { ok: true })
    }

    // Se for paginação (page:<action>:<pageNum>)
    if (cbData.startsWith('page:')) {
      const parts = cbData.split(':')
      const targetAction = parts[1]
      const targetPage = parseInt(parts[2], 10) || 0

      if (cbMsgId) {
        // Remover teclado antigo antes de re-renderizar
        editTelegramReplyMarkup(cbChatId, cbMsgId, { inline_keyboard: [] })
      }

      if (targetAction === 'cat') {
        askCategoria(cbChatId, draft, targetPage)
      } else if (targetAction === 'conta') {
        askConta(cbChatId, draft, targetPage)
      } else if (targetAction === 'ctx') {
        askContexto(cbChatId, draft, targetPage)
      }
      return e.json(200, { ok: true })
    }

    if (cbData === 'noop') {
      return e.json(200, { ok: true })
    }

    // Remover teclado da mensagem onde clicou para cumprir a regra "teclado some ao clicar" e evitar cliques múltiplos
    if (cbMsgId) {
      editTelegramReplyMarkup(cbChatId, cbMsgId, { inline_keyboard: [] })
    }

    // Tratar seleções de campo
    if (cbData.startsWith('tipo:')) {
      const chosenTipo = cbData.replace('tipo:', '')
      const previousTipo = draft.tipo
      draft.tipo = chosenTipo

      // Se o usuário trocou o tipo (ex: de despesa para receita), verificar compatibilidade da categoria
      if (
        draft.categoria &&
        previousTipo &&
        previousTipo !== chosenTipo &&
        draft.categoria !== 'skip'
      ) {
        try {
          const cRec = $app.findRecordById('categorias', draft.categoria)
          if (cRec.getString('tipo') && cRec.getString('tipo') !== chosenTipo) {
            draft.categoria = null
          }
        } catch (_) {
          draft.categoria = null
        }
      }

      // Persistir na sessão ANTES de calcular o próximo passo
      saveSession(cbChatId, 'processing', draft, 'tipo', draft.contexto_nome || '')
      sendTelegramMsg(
        cbChatId,
        '✔️ Tipo selecionado: ' + (draft.tipo === 'receita' ? 'Receita' : 'Despesa'),
      )
      // Usar diretamente o draft mutado em memória
      checkNextStep(cbChatId, draft)
      return e.json(200, { ok: true })
    }

    if (cbData.startsWith('cat:')) {
      draft.categoria = cbData.replace('cat:', '')
      // Persistir na sessão ANTES de calcular o próximo passo
      saveSession(cbChatId, 'processing', draft, 'categoria', draft.contexto_nome || '')
      let catNome = draft.categoria
      try {
        const cRec = $app.findRecordById('categorias', draft.categoria)
        catNome = cRec.getString('nome')
      } catch (_) {}
      sendTelegramMsg(cbChatId, '✔️ Categoria selecionada: ' + catNome)
      // Usar diretamente o draft mutado em memória
      checkNextStep(cbChatId, draft)
      return e.json(200, { ok: true })
    }

    if (cbData.startsWith('conta:')) {
      draft.conta = cbData.replace('conta:', '')
      // Persistir na sessão ANTES de calcular o próximo passo
      saveSession(cbChatId, 'processing', draft, 'conta', draft.contexto_nome || '')
      let contaNome = draft.conta
      try {
        const cRec = $app.findRecordById('contas', draft.conta)
        contaNome = cRec.getString('nome')
      } catch (_) {}
      sendTelegramMsg(cbChatId, '✔️ Conta selecionada: ' + contaNome)
      // Usar diretamente o draft mutado em memória
      checkNextStep(cbChatId, draft)
      return e.json(200, { ok: true })
    }

    if (cbData.startsWith('ctx:')) {
      const ctxId = cbData.replace('ctx:', '')
      if (ctxId === 'none') {
        draft.contexto_id = ''
        draft.contexto_nome = ''
        draft.contexto_definido = true
        saveSession(cbChatId, 'processing', draft, 'contexto', '')
        sendTelegramMsg(cbChatId, '✔️ Contexto selecionado: Geral')
      } else {
        draft.contexto_id = ctxId
        draft.contexto_definido = true
        try {
          const gRec = $app.findRecordById('contexto_grupos', ctxId)
          draft.contexto_nome = gRec.getString('nome')
          saveSession(cbChatId, 'processing', draft, 'contexto', draft.contexto_nome)
          sendTelegramMsg(cbChatId, '✔️ Contexto selecionado: ' + draft.contexto_nome)
        } catch (_) {}
      }
      // Usar diretamente o draft mutado em memória
      checkNextStep(cbChatId, draft)
      return e.json(200, { ok: true })
    }

    if (cbData === 'confirm:yes') {
      finalizeLancamento(cbChatId, draft, false)
      return e.json(200, { ok: true })
    }

    if (cbData === 'confirm_dupe:yes') {
      draft.force_duplicate = true
      finalizeLancamento(cbChatId, draft, true)
      return e.json(200, { ok: true })
    }

    return e.json(200, { ok: true })
  }

  // ----------------------------------------------------
  // TRATAMENTO DE MENSAGENS COMUNS (TEXTO / FOTOS)
  // ----------------------------------------------------
  if (!message || !message.chat) {
    return e.json(200, { ok: true, ignored: true })
  }

  const chatId = message.chat.id
  const rawText = (message.text || message.caption || '').trim()
  const photos = message.photo || null

  // Verificar se o usuário está no meio de uma resposta de texto livre (ex: awaiting_valor ou awaiting_descricao)
  const session = getSession(chatId)
  const currentState = session ? session.getString('state') : 'idle'
  const currentDraft = getDraftFromSession(session)

  // Tratar comando /start ou /ajuda
  if (rawText.startsWith('/start') || rawText.startsWith('/ajuda') || rawText.startsWith('/help')) {
    clearSessionDraft(chatId)
    const welcome =
      '👋 Olá! Eu sou o Agente Financeiro Inteligente do GKza.\n\n' +
      'Estou pronto para automatizar seus lançamentos de forma rápida:\n' +
      '• Envie a foto de um comprovante Pix, boleto ou recibo.\n' +
      '• Ou descreva o gasto/receita em texto (ex: "Gastei R$ 184,32 na CPFL pelo NuBank").\n\n' +
      '⚡ MODO RÁPIDO: Comprovantes legíveis são registrados diretamente no sistema sem burocracia, ' +
      'e você pode conferir ou editar tudo depois em /despesas ou /lancamentos!\n\n' +
      '💡 Se faltar algum dado essencial (valor ou data), perguntarei com botões interativos.\n\n' +
      'Comandos:\n' +
      '• /ajuda - Mostra esta mensagem\n' +
      '• /contexto <nome> - Define o contexto/empresa padrão\n' +
      '• /cancelar - Cancela o lançamento pendente atual'
    sendTelegramMsg(chatId, welcome)
    return e.json(200, { ok: true })
  }

  // Tratar comando /cancelar
  if (rawText.startsWith('/cancelar') || rawText === 'cancelar') {
    clearSessionDraft(chatId)
    sendTelegramMsg(chatId, '❌ Operação cancelada. Você pode enviar uma nova mensagem ou foto.')
    return e.json(200, { ok: true })
  }

  // Tratar comando /contexto
  if (rawText.startsWith('/contexto')) {
    const parts = rawText.split(' ')
    parts.shift()
    const target = parts.join(' ').trim()
    if (!target) {
      // Mostrar lista com botões
      askContexto(chatId, currentDraft, 0)
      return e.json(200, { ok: true })
    }
    try {
      const gFilter = `nome ~ '${target}'`
      const grupos = $app.findRecordsByFilter('contexto_grupos', gFilter, 'ordem', 1, 0)
      if (grupos && grupos.length > 0) {
        const g = grupos[0]
        const cNome = g.getString('nome')
        saveSession(chatId, 'idle', {}, '', cNome)
        sendTelegramMsg(
          chatId,
          '✅ Contexto ativo alterado para "' +
            cNome +
            '". Os próximos comprovantes serão lançados com esta referência.',
        )
        return e.json(200, { ok: true })
      } else {
        sendTelegramMsg(
          chatId,
          '⚠️ Não encontrei nenhum contexto com o nome "' +
            target +
            '". Mostrando as opções disponíveis:',
        )
        askContexto(chatId, currentDraft, 0)
        return e.json(200, { ok: true })
      }
    } catch (err) {
      console.log('Error looking up context:', err.message)
    }
  }

  // EXCEÇÃO 2: Se o usuário estiver respondendo a uma pergunta pendente de uma sessão já em andamento (somente texto sem foto)
  const isPendingInteractiveAnswer =
    !photos &&
    session &&
    (currentState === 'awaiting_valor' ||
      currentState === 'awaiting_descricao' ||
      currentState === 'awaiting_confirmation' ||
      currentState === 'awaiting_tipo' ||
      currentState === 'awaiting_categoria' ||
      currentState === 'awaiting_conta' ||
      currentState === 'awaiting_contexto' ||
      currentState === 'awaiting_duplicate_confirm')

  if (isPendingInteractiveAnswer) {
    if (currentState === 'awaiting_valor') {
      // Extrair valor numérico
      let cleanVal = rawText.replace(/R\$/gi, '').replace(/\s/g, '')
      if (cleanVal.includes(',') && cleanVal.includes('.')) {
        cleanVal = cleanVal.replace(/\./g, '').replace(',', '.')
      } else if (cleanVal.includes(',')) {
        cleanVal = cleanVal.replace(',', '.')
      }
      const num = parseFloat(cleanVal)
      if (isNaN(num) || num <= 0) {
        sendTelegramMsg(
          chatId,
          '⚠️ Não compreendi o valor. Por favor, envie apenas o número em reais (ex: 184,32 ou 250):',
        )
        return e.json(200, { ok: true })
      }
      currentDraft.valor = num
      saveSession(chatId, 'processing', currentDraft, 'valor', currentDraft.contexto_nome || '')
      sendTelegramMsg(chatId, '✔️ Valor registrado: R$ ' + num.toFixed(2).replace('.', ','))
      checkNextStep(chatId, currentDraft)
      return e.json(200, { ok: true })
    }

    if (currentState === 'awaiting_descricao') {
      currentDraft.descricao = rawText
      saveSession(chatId, 'processing', currentDraft, 'descricao', currentDraft.contexto_nome || '')
      sendTelegramMsg(chatId, '✔️ Descrição registrada: ' + rawText)
      checkNextStep(chatId, currentDraft)
      return e.json(200, { ok: true })
    }

    if (currentState === 'awaiting_confirmation') {
      const lower = rawText.toLowerCase()
      if (
        lower === 'sim' ||
        lower === 's' ||
        lower === 'ok' ||
        lower.includes('confirma') ||
        lower.includes('registrar')
      ) {
        finalizeLancamento(chatId, currentDraft, false)
        return e.json(200, { ok: true })
      }
      if (lower === 'não' || lower === 'nao' || lower === 'n' || lower.includes('cancela')) {
        clearSessionDraft(chatId)
        sendTelegramMsg(chatId, '❌ Lançamento cancelado.')
        return e.json(200, { ok: true })
      }
    }
  }

  // ----------------------------------------------------
  // PROCESSAMENTO DE NOVO COMPROVANTE (FOTO OU TEXTO)
  // ----------------------------------------------------
  let ocrExtractedText = ''

  if (photos && photos.length > 0) {
    // Pegar a foto de MAIOR resolução (último item do array no Telegram)
    const bestPhoto = photos[photos.length - 1]
    let base64Data = ''
    let mimeType = 'image/jpeg'

    try {
      const fileRes = $http.send({
        url: 'https://api.telegram.org/bot' + token + '/getFile?file_id=' + bestPhoto.file_id,
        method: 'GET',
        timeout: 10,
      })

      if (fileRes.json && fileRes.json.ok && fileRes.json.result.file_path) {
        const filePath = fileRes.json.result.file_path
        const fileUrl = 'https://api.telegram.org/file/bot' + token + '/' + filePath

        if (filePath.endsWith('.png')) mimeType = 'image/png'
        else if (filePath.endsWith('.webp')) mimeType = 'image/webp'

        // Baixar bytes da imagem
        try {
          const imgDownload = $http.send({
            url: fileUrl,
            method: 'GET',
            timeout: 20,
          })
          if (imgDownload && imgDownload.raw) {
            base64Data = imgDownload.raw
          }
        } catch (dlErr) {
          console.log('Direct image download failed:', dlErr.message)
        }

        const visionPrompt =
          'Você é um extrator especialista de comprovantes financeiros brasileiros (Pix, boletos, TED, transferências bancárias, cartões, recibos).\n' +
          'Analise com atenção máxima todos os detalhes visuais do comprovante e extraia com exatidão:\n' +
          '1. VALOR TOTAL (em R$):\n' +
          '2. DATA E HORA da transação:\n' +
          '3. TIPO DA OPERAÇÃO: Pix Enviado, Pix Recebido, Pagamento de Boleto, Compra no Débito, Compra no Crédito, Transferência TED/DOC ou Saque:\n' +
          '4. INSTITUIÇÃO OU BANCO PAGADOR/ORIGEM (ex: NuBank, Banco Inter, Sicredi, Caixa Econômica, Itaú, Bradesco, Santander):\n' +
          '5. INSTITUIÇÃO OU BANCO RECEBEDOR:\n' +
          '6. NOME DO FAVORECIDO / DESTINATÁRIO (completo ou razão social / nome fantasia):\n' +
          '7. CNPJ OU CPF DO FAVORECIDO:\n' +
          '8. NOME DO PAGADOR:\n' +
          '9. IDENTIFICADOR OU ID DE TRANSAÇÃO PIX / CÓDIGO DE AUTENTICAÇÃO:\n' +
          (rawText ? '10. LEGENDA / TEXTO ENVIADO JUNTO: ' + rawText : '')

        // 1ª tentativa: via imagem base64 com model: "fast"
        if (base64Data) {
          try {
            const dataUri = 'data:' + mimeType + ';base64,' + base64Data
            const vRes = $ai.chat({
              model: 'fast',
              messages: [
                {
                  role: 'system',
                  content:
                    'Você é um extrator de comprovantes bancários brasileiros. Transcreva com fidelidade cada campo encontrado.',
                },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: visionPrompt },
                    { type: 'image_url', image_url: { url: dataUri } },
                  ],
                },
              ],
            })
            if (vRes && vRes.choices && vRes.choices.length > 0 && vRes.choices[0].message) {
              ocrExtractedText = vRes.choices[0].message.content || ''
            }
          } catch (vErr1) {
            console.log('Vision base64 fast extraction error:', vErr1.message)
          }
        }

        // 2ª tentativa: via URL direta se base64 não funcionou
        if (!ocrExtractedText) {
          try {
            const vRes2 = $ai.chat({
              model: 'fast',
              messages: [
                {
                  role: 'system',
                  content:
                    'Você é um extrator de comprovantes bancários brasileiros. Transcreva com fidelidade cada campo encontrado.',
                },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: visionPrompt },
                    { type: 'image_url', image_url: { url: fileUrl } },
                  ],
                },
              ],
            })
            if (vRes2 && vRes2.choices && vRes2.choices.length > 0 && vRes2.choices[0].message) {
              ocrExtractedText = vRes2.choices[0].message.content || ''
            }
          } catch (vErr2) {
            console.log('Vision URL fast extraction error:', vErr2.message)
          }
        }
      }
    } catch (getFileErr) {
      console.log('Telegram getFile error:', getFileErr.message)
    }

    if (!ocrExtractedText && !rawText) {
      // Quando a foto for enviada sem legenda e a IA multimodal não tiver extraído o texto da imagem,
      // pedir amigavelmente os dados sem prender o bot em erro
      sendTelegramMsg(
        chatId,
        '📷 Imagem do comprovante recebida com sucesso!\n\n' +
          'Para eu preencher os campos com 100% de precisão, envie uma breve descrição em texto (exemplo: "CPFL 184,32 Nubank" ou "Padaria 25 Inter").\n\n' +
          'Ou se preferir, me diga o valor agora:',
      )
      saveSession(chatId, 'awaiting_valor', currentDraft, 'valor', currentDraft.contexto_nome || '')
      return e.json(200, { ok: true })
    }
  }

  // ----------------------------------------------------
  // EXTRAÇÃO E ESTRUTURAÇÃO COM LLM
  // ----------------------------------------------------
  // Consultar cadastros reais do sistema para passar como contexto ao analisador
  let catList = []
  try {
    catList = $app.findRecordsByFilter('categorias', '', 'nome', 50, 0)
  } catch (_) {}
  const catNames = catList.map((c) => ({
    id: c.id,
    nome: c.getString('nome'),
    tipo: c.getString('tipo'),
  }))

  let contaList = []
  try {
    contaList = $app.findRecordsByFilter('contas', 'ativa = true', 'nome', 50, 0)
  } catch (_) {}
  const contaNames = contaList.map((c) => ({
    id: c.id,
    nome: c.getString('nome'),
    tipo: c.getString('tipo'),
    bandeira: c.getString('bandeira'),
  }))

  let grupoList = []
  try {
    grupoList = $app.findRecordsByFilter('contexto_grupos', '', 'ordem,nome', 50, 0)
  } catch (_) {}
  const grupoNames = grupoList.map((g) => ({
    id: g.id,
    nome: g.getString('nome'),
  }))

  const savedContexto = session ? session.getString('contexto_nome') : ''

  const extractionPrompt =
    'Você é o motor de classificação e estruturação financeira do ERP GKza.\n' +
    'Analise todas as informações abaixo (OCR de comprovante brasileiro Pix/Boleto/Cartão e/ou texto do usuário) e extraia um objeto JSON rigoroso para lançamento financeiro:\n\n' +
    (ocrExtractedText
      ? '=== OCR / DETALHES DO COMPROVANTE ===\n' + ocrExtractedText + '\n\n'
      : '') +
    (rawText ? '=== TEXTO / LEGENDA DO USUÁRIO ===\n' + rawText + '\n\n' : '') +
    'CONTEXTO ATIVO SALVO: ' +
    (savedContexto || 'Nenhum') +
    '\n\n' +
    'LISTA DE CATEGORIAS CADASTRADAS NO GKZA:\n' +
    JSON.stringify(catNames) +
    '\n\n' +
    'LISTA DE CONTAS BANCÁRIAS / CARTÕES CADASTRADOS NO GKZA:\n' +
    JSON.stringify(contaNames) +
    '\n\n' +
    'LISTA DE CONTEXTOS / GRUPOS CADASTRADOS NO GKZA:\n' +
    JSON.stringify(grupoNames) +
    '\n\n' +
    'DIRETRIZES BRASILEIRAS DE CLASSIFICAÇÃO:\n' +
    '1. TIPO: Se o comprovante indicar "Pix enviado", "Pagamento Efetuado", "Transferência Realizada", "Débito", ou se for conta de luz/água/fornecedor/aluguel, é "despesa". Se indicar "Pix Recebido", "Crédito em Conta" ou venda, é "receita".\n' +
    '2. DESCRIÇÃO: Priorize o NOME DO FAVORECIDO / DESTINATÁRIO (ex: "CPFL Energia", "Padaria Central", "Supermercado Tauste", "João Silva"). Se for recebimento, o nome do pagador/cliente.\n' +
    '3. VALOR: Número decimal positivo em Reais (ex: 184.32). Extraia o valor principal pago.\n' +
    '4. DATA: Data da transação no formato "YYYY-MM-DD" (se o comprovante tiver data, use ela; caso contrário hoje).\n' +
    '5. CONTA_ID: Identifique a instituição financeira emissora (ex: NuBank / Nubank Pagamentos S.A. -> conta NuBank; Banco Inter -> conta Banco Inter; Sicredi -> conta Sicred; Caixa -> Caixa Principal). Selecione o "id" exato da lista de contas acima. Se tiver forte indício, preencha.\n' +
    '6. CATEGORIA_ID: Associe o favorecido/finalidade à melhor categoria da lista. Ex:\n' +
    '   - CPFL, Enel, Sabesp, Vivo, Claro, Internet -> "Utilities"\n' +
    '   - Aluguel, Imobiliária -> "Aluguel"\n' +
    '   - Fornecedor de mercadorias, insumos, comércio -> "Fornecedores"\n' +
    '   - Impostos, DARF, DAS, Simples Nacional, FGTS -> "Impostos"\n' +
    '   - Mercado Livre, Shopee, Amazon -> "Vendas Marketplace" ou "Comissões" (se custo)\n' +
    '   - Gasolina, Correios, Transporte -> "Frete" ou similar\n' +
    '   - Anúncios, Meta Ads, Google Ads -> "Marketing"\n' +
    '   Preencha o "id" exato da lista de categorias caso haja correspondência lógica.\n' +
    '7. CONTEXTO_NOME: Se o texto ou comprovante fizer referência explícita a algum grupo da lista de contextos (ex: "Casa", "Padaria Estrela Dourada", "Pessoal (CPF)", "Filhas"), preencha o nome exato. Se houver CONTEXTO ATIVO SALVO, preserve-o.\n\n' +
    'RETORNE ESTRITAMENTE UM JSON NO FORMATO:\n' +
    '{\n' +
    '  "tipo": "despesa" | "receita" | null,\n' +
    '  "descricao": string ou null,\n' +
    '  "valor": number ou null,\n' +
    '  "data": "YYYY-MM-DD" ou null,\n' +
    '  "categoria_id": string ou null,\n' +
    '  "conta_id": string ou null,\n' +
    '  "contexto_nome": string ou null,\n' +
    '  "observacoes": string,\n' +
    '  "status": "pago"\n' +
    '}'

  let parsedDraft = null
  try {
    const aiExtract = $ai.chat({
      model: 'fast',
      messages: [
        {
          role: 'system',
          content:
            'Você é um analisador JSON estrito para o ERP GKza. Responda apenas com o objeto JSON pedido, sem markdown e sem preâmbulo.',
        },
        {
          role: 'user',
          content: extractionPrompt,
        },
      ],
    })

    if (
      aiExtract &&
      aiExtract.choices &&
      aiExtract.choices.length > 0 &&
      aiExtract.choices[0].message
    ) {
      let rawJson = aiExtract.choices[0].message.content.trim()
      if (rawJson.startsWith('```json')) {
        rawJson = rawJson
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim()
      } else if (rawJson.startsWith('```')) {
        rawJson = rawJson.replace(/```/g, '').trim()
      }
      parsedDraft = JSON.parse(rawJson)
    }
  } catch (errJson) {
    console.log('Error in LLM JSON extraction:', errJson.message)
  }

  // Extração determinística de fallback de valor (do rawText ou do OCR se disponível)
  let fallbackValor = null
  const textForValor = (rawText + ' ' + (ocrExtractedText || '')).trim()
  if (textForValor) {
    const matchReais =
      textForValor.match(/R\$\s*([0-9.,]+)/i) ||
      textForValor.match(/(?:valor|total|pago|quantia)[\s:]*R?\$?\s*([0-9.,]+)/i) ||
      textForValor.match(/\b([0-9]{1,6}[.,][0-9]{2})\b/)
    if (matchReais && matchReais[1]) {
      let vStr = matchReais[1].trim()
      if (vStr.includes(',') && vStr.includes('.')) {
        vStr = vStr.replace(/\./g, '').replace(',', '.')
      } else if (vStr.includes(',')) {
        vStr = vStr.replace(',', '.')
      }
      const p = parseFloat(vStr)
      if (!isNaN(p) && p > 0) fallbackValor = p
    }
  }

  // Fallback de data no formato dd/mm/yyyy
  let fallbackData = null
  const dateMatch = textForValor.match(/\b([0-3]?[0-9])\/([0-1]?[0-9])\/(20[2-9][0-9])\b/)
  if (dateMatch) {
    const dDay = dateMatch[1].padStart(2, '0')
    const dMonth = dateMatch[2].padStart(2, '0')
    const dYear = dateMatch[3]
    fallbackData = `${dYear}-${dMonth}-${dDay}`
  }

  // Fallback de Favorecido/Descrição por regex
  let fallbackDescricao = null
  const favMatch =
    textForValor.match(
      /(?:favorecido|destinat[áa]rio|benefici[áa]rio|recebedor|para)[\s:]+([A-Za-z0-9À-ÿ\s.\-&]{3,40})/i,
    ) ||
    textForValor.match(
      /(?:empresa|raz[ãa]o social|nome fantasia)[\s:]+([A-Za-z0-9À-ÿ\s.\-&]{3,40})/i,
    )
  if (favMatch && favMatch[1]) {
    const rawFav = favMatch[1].trim().replace(/\n.*$/, '').trim()
    if (
      rawFav &&
      rawFav.length > 2 &&
      !rawFav.toLowerCase().includes('cpf') &&
      !rawFav.toLowerCase().includes('cnpj')
    ) {
      fallbackDescricao = rawFav
    }
  }

  // Identificação determinística de conta por palavras-chave se não veio do LLM
  let fallbackContaId = null
  const combinedText = ((ocrExtractedText || '') + ' ' + (rawText || '')).toLowerCase()
  for (let k = 0; k < contaNames.length; k++) {
    const cItem = contaNames[k]
    const cLower = cItem.nome.toLowerCase()
    if (combinedText.includes(cLower)) {
      fallbackContaId = cItem.id
      break
    }
    if (
      cLower.includes('nubank') &&
      (combinedText.includes('nu') ||
        combinedText.includes('nubank') ||
        combinedText.includes('nu pagamentos'))
    ) {
      fallbackContaId = cItem.id
      break
    }
    if (
      cLower.includes('inter') &&
      (combinedText.includes('inter') || combinedText.includes('banco inter'))
    ) {
      fallbackContaId = cItem.id
      break
    }
    if (
      cLower.includes('sicred') &&
      (combinedText.includes('sicredi') || combinedText.includes('sicred'))
    ) {
      fallbackContaId = cItem.id
      break
    }
  }

  // Identificação determinística de tipo por palavras-chave
  let fallbackTipo = null
  if (
    combinedText.includes('pix enviado') ||
    combinedText.includes('pagamento efetuado') ||
    combinedText.includes('pago com sucesso') ||
    combinedText.includes('gastei') ||
    combinedText.includes('comprovante de transferência enviada') ||
    combinedText.includes('comprovante de pagamento') ||
    combinedText.includes('saída') ||
    combinedText.includes('débito') ||
    combinedText.includes('transferência realizada')
  ) {
    fallbackTipo = 'despesa'
  } else if (
    combinedText.includes('pix recebido') ||
    combinedText.includes('recebi') ||
    combinedText.includes('transferência recebida') ||
    combinedText.includes('crédito em conta') ||
    combinedText.includes('entrada')
  ) {
    fallbackTipo = 'receita'
  }

  const finalTipo = parsedDraft && parsedDraft.tipo ? parsedDraft.tipo : fallbackTipo || 'despesa'
  const finalDescricao =
    parsedDraft && parsedDraft.descricao
      ? parsedDraft.descricao.trim()
      : fallbackDescricao || rawText || 'Lançamento via Telegram'
  const finalValor =
    parsedDraft && parsedDraft.valor && !isNaN(parseFloat(parsedDraft.valor))
      ? parseFloat(parsedDraft.valor)
      : fallbackValor || null
  const finalData =
    parsedDraft && parsedDraft.data
      ? parsedDraft.data
      : fallbackData || new Date().toISOString().slice(0, 10)
  const finalCategoria = parsedDraft && parsedDraft.categoria_id ? parsedDraft.categoria_id : null
  const finalConta =
    parsedDraft && parsedDraft.conta_id ? parsedDraft.conta_id : fallbackContaId || null

  let finalContexto = savedContexto || ''
  if (!finalContexto && parsedDraft && parsedDraft.contexto_nome) {
    finalContexto = parsedDraft.contexto_nome
  }

  // Se o draft anterior já tinha dados que não vieram nesta mensagem (merge inteligente em vez de resetar)
  const draft = {
    tipo: finalTipo || currentDraft.tipo || 'despesa',
    descricao:
      finalDescricao && finalDescricao !== 'Lançamento via Telegram'
        ? finalDescricao
        : currentDraft.descricao || finalDescricao || '',
    valor: finalValor !== null && finalValor > 0 ? finalValor : currentDraft.valor || null,
    data: finalData || currentDraft.data || new Date().toISOString().slice(0, 10),
    categoria: finalCategoria || currentDraft.categoria || null,
    conta: finalConta || currentDraft.conta || null,
    status: parsedDraft && parsedDraft.status ? parsedDraft.status : 'pago',
    observacoes:
      parsedDraft && parsedDraft.observacoes
        ? parsedDraft.observacoes
        : 'Registrado via Telegram GKza',
    contexto_nome: finalContexto || currentDraft.contexto_nome || '',
    contexto_definido: !!(finalContexto || currentDraft.contexto_nome),
  }

  if (ocrExtractedText) {
    draft.ocr_resumo = ocrExtractedText.slice(0, 300)
  }

  // Preencher defaults compatíveis imediatos para Categoria e Conta caso não tenham sido extraídos
  if (!draft.categoria || draft.categoria === 'skip') {
    try {
      const fallbackCats = $app.findRecordsByFilter(
        'categorias',
        `tipo = '${draft.tipo || 'despesa'}'`,
        'nome',
        1,
        0,
      )
      if (fallbackCats.length > 0) {
        draft.categoria = fallbackCats[0].id
      } else {
        const anyCat = $app.findRecordsByFilter('categorias', '', 'nome', 1, 0)
        if (anyCat.length > 0) draft.categoria = anyCat[0].id
      }
    } catch (_) {}
  }

  if (!draft.conta || draft.conta === 'skip') {
    try {
      const fallbackContas = $app.findRecordsByFilter('contas', 'ativa = true', 'nome', 1, 0)
      if (fallbackContas.length > 0) {
        draft.conta = fallbackContas[0].id
      } else {
        const anyConta = $app.findRecordsByFilter('contas', '', 'nome', 1, 0)
        if (anyConta.length > 0) draft.conta = anyConta[0].id
      }
    } catch (_) {}
  }

  // Se o contexto não tiver sido preenchido, verificar se há um contexto padrão/ativo ou deixar Geral
  if (!draft.contexto_nome && savedContexto) {
    draft.contexto_nome = savedContexto
    draft.contexto_definido = true
  }

  // VERIFICAÇÃO DOS DADOS ESSENCIAIS PARA O NOVO FLUXO RÁPIDO:
  // Essenciais: tipo ('despesa' | 'receita'), valor (> 0), data e ao menos uma descrição identificável
  const hasValidTipo = draft.tipo === 'despesa' || draft.tipo === 'receita'
  const hasValidValor =
    draft.valor !== null &&
    draft.valor !== undefined &&
    !isNaN(parseFloat(draft.valor)) &&
    parseFloat(draft.valor) > 0
  const hasValidData = !!draft.data
  const hasValidDescricao =
    draft.descricao &&
    draft.descricao.trim().length > 0 &&
    draft.descricao.trim() !== 'Lançamento via Telegram'

  const canAutoCreate = hasValidTipo && hasValidValor && hasValidData && hasValidDescricao

  if (canAutoCreate) {
    // Salvar estado na sessão como processing antes de finalizar
    saveSession(chatId, 'processing', draft, 'auto_create', draft.contexto_nome || '')
    // Criar o lançamento diretamente sem passar pelo questionamento de botões!
    finalizeLancamento(chatId, draft, true)
    return e.json(200, { ok: true })
  }

  // EXCEÇÃO: Extração falhou ou ficou ilegível (sem valor, sem data ou sem descrição clara)
  // Notificar o que foi possível capturar e acionar o fluxo interativo passo a passo
  if (draft.descricao && draft.valor) {
    const valFmt = 'R$ ' + Number(draft.valor).toFixed(2).replace('.', ',')
    const tipoBadge = draft.tipo === 'receita' ? '🟢 Receita' : '🔴 Despesa'
    sendTelegramMsg(
      chatId,
      '🔎 Identifiquei no comprovante:\n' +
        '• ' +
        tipoBadge +
        '\n' +
        '• ' +
        draft.descricao +
        '\n' +
        '• ' +
        valFmt +
        '\n\nPrecisamos completar alguns dados essenciais:',
    )
  }

  // Salvar o draft na sessão e acionar o fluxo de opções (rádios) para o que faltar
  saveSession(chatId, 'processing', draft, 'next', draft.contexto_nome || '')
  checkNextStep(chatId, draft)

  return e.json(200, { ok: true })
})
