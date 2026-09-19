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
      const records = $app.findRecordsByFilter(
        'telegram_sessions',
        `chat_id = '${chatId}'`,
        '-updated',
        1,
        0,
      )
      if (records && records.length > 0) {
        return records[0]
      }
    } catch (_) {}
    return null
  }

  // Helper seguro para ler draft_data como objeto JS nativo (evita Go slice/map proxy TypeError)
  const getDraftFromSession = (session) => {
    if (!session) return {}
    try {
      let raw = session.get('draft_data')
      if (!raw) return {}
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw)
        } catch (_) {
          return {}
        }
      }
      // Se for objeto retornado pelo runtime do PocketBase, clonar via JSON para garantir JS Object puro
      const jsonStr = JSON.stringify(raw)
      const parsed = JSON.parse(jsonStr)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
      return {}
    } catch (e) {
      console.log('Error reading draft_data from session:', e.message)
      return {}
    }
  }

  const saveSession = (chatId, state, draftData, pendingQuestion, contextoNome) => {
    try {
      let session = getSession(chatId)
      if (!session) {
        const col = $app.findCollectionByNameOrId('telegram_sessions')
        session = new Record(col)
        session.set('chat_id', String(chatId))
      }
      session.set('state', state || 'idle')
      // Garantir que draftData seja serializável e salvo limpo
      const safeDraft =
        draftData && typeof draftData === 'object' && !Array.isArray(draftData) ? draftData : {}
      session.set('draft_data', safeDraft)
      session.set('pending_question', pendingQuestion || '')
      if (contextoNome !== undefined) {
        session.set('contexto_nome', contextoNome || '')
      }
      $app.save(session)
      return session
    } catch (err) {
      console.log('Failed to save session:', err.message)
      return null
    }
  }

  const clearSessionDraft = (chatId) => {
    try {
      const session = getSession(chatId)
      if (session) {
        session.set('state', 'idle')
        session.set('draft_data', {})
        session.set('pending_question', '')
        $app.save(session)
      }
    } catch (_) {}
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
    saveSession(chatId, 'awaiting_tipo', draft, 'tipo')
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
      // Se não houver categoria cadastrada
      draft.categoria = ''
      checkNextStep(chatId, draft)
      return
    }

    const totalPages = Math.ceil(items.length / pageSize)
    const keyboard = buildInlineKeyboard('cat', items, curPage, pageSize, totalPages)

    saveSession(chatId, 'awaiting_categoria', draft, 'categoria')
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
      draft.conta = ''
      checkNextStep(chatId, draft)
      return
    }

    const totalPages = Math.ceil(items.length / pageSize)
    const keyboard = buildInlineKeyboard('conta', items, curPage, pageSize, totalPages)

    saveSession(chatId, 'awaiting_conta', draft, 'conta')
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

    saveSession(chatId, 'awaiting_contexto', draft, 'contexto')
    const pageInd = totalPages > 1 ? ` (Página ${curPage + 1}/${totalPages})` : ''
    sendTelegramMsg(
      chatId,
      '🏢 Selecione o Contexto / Grupo' + pageInd + ':\n(Toque na opção desejada)',
      keyboard,
    )
  }

  // Executar criação definitiva do lançamento com anti-duplicidade
  const finalizeLancamento = (chatId, draft) => {
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

      // Criar o registro
      const rec = new Record(colLancamentos)
      rec.set('descricao', draft.descricao || 'Lançamento via Telegram')
      rec.set('valor', valor)
      rec.set('tipo', draft.tipo || 'despesa')
      rec.set('data', dataIso)
      rec.set('status', draft.status || 'pago')
      if (draft.conta) rec.set('conta', draft.conta)
      if (draft.categoria) rec.set('categoria', draft.categoria)
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
      if (draft.conta) {
        try {
          const cRec = $app.findRecordById('contas', draft.conta)
          contaNome = cRec.getString('nome')
        } catch (_) {}
      }

      let catNome = 'Geral'
      if (draft.categoria) {
        try {
          const kRec = $app.findRecordById('categorias', draft.categoria)
          catNome = kRec.getString('nome')
        } catch (_) {}
      }

      // Limpar sessão ativa
      clearSessionDraft(chatId)

      const tipoEmoji = draft.tipo === 'receita' ? '🟢' : '🔴'
      const tipoLabel = draft.tipo === 'receita' ? 'Receita' : 'Despesa'
      const valorFmt = 'R$ ' + Number(valor).toFixed(2).replace('.', ',')
      const dataFmt = dateOnly.split('-').reverse().join('/')

      const successMsg =
        '✅ ' +
        tipoLabel +
        ' confirmada e registrada no GKza!\n\n' +
        '• ' +
        tipoEmoji +
        ' Tipo: ' +
        tipoLabel +
        '\n' +
        '• 📝 Descrição: ' +
        (draft.descricao || '-') +
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
        '\nStatus: Concluído com sucesso no sistema.'

      sendTelegramMsg(chatId, successMsg)
    } catch (errSave) {
      console.log('Failed to finalize lancamento:', errSave.message)
      sendTelegramMsg(chatId, '❌ Erro ao salvar lançamento no sistema: ' + errSave.message)
    }
  }

  // Máquina de estados: verifica o próximo dado pendente
  const checkNextStep = (chatId, draft) => {
    // 1. Tipo
    if (!draft.tipo) {
      askTipo(chatId, draft)
      return
    }

    // 2. Categoria (lista)
    if (!draft.categoria) {
      askCategoria(chatId, draft, 0)
      return
    }

    // 3. Conta (lista)
    if (!draft.conta) {
      askConta(chatId, draft, 0)
      return
    }

    // 4. Valor (texto livre)
    if (!draft.valor) {
      saveSession(chatId, 'awaiting_valor', draft, 'valor')
      sendTelegramMsg(chatId, '💬 Por favor, digite o VALOR em reais (ex: 184,32 ou 250):')
      return
    }

    // 5. Descrição (texto livre)
    if (!draft.descricao) {
      saveSession(chatId, 'awaiting_descricao', draft, 'descricao')
      sendTelegramMsg(
        chatId,
        '💬 Por favor, digite a DESCRIÇÃO ou nome do favorecido/recebimento (ex: CPFL Energia, Supermercado, Aluguel):',
      )
      return
    }

    // Todos os dados preenchidos: pedir confirmação final com botões
    let contaNome = draft.conta
    try {
      const cRec = $app.findRecordById('contas', draft.conta)
      contaNome = cRec.getString('nome')
    } catch (_) {}

    let catNome = draft.categoria
    try {
      const kRec = $app.findRecordById('categorias', draft.categoria)
      catNome = kRec.getString('nome')
    } catch (_) {}

    const vNum = parseFloat(draft.valor) || 0
    const valorFmt = 'R$ ' + vNum.toFixed(2).replace('.', ',')
    const tipoLabel = draft.tipo === 'receita' ? '🟢 Receita' : '🔴 Despesa'

    const confirmMsg =
      '📋 Por favor, confirme os dados antes do lançamento:\n\n' +
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
      (draft.data ? draft.data.slice(0, 10).split('-').reverse().join('/') : 'Hoje') +
      '\n\n' +
      'Deseja registrar agora?'

    const confirmKb = {
      inline_keyboard: [
        [
          { text: '✅ Sim, registrar agora', callback_data: 'confirm:yes' },
          { text: '❌ Cancelar', callback_data: 'cancel:draft' },
        ],
      ],
    }

    saveSession(chatId, 'awaiting_confirmation', draft, 'confirmation')
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
      draft.tipo = cbData.replace('tipo:', '')
      saveSession(cbChatId, session ? session.getString('state') : 'processing', draft, 'tipo')
      sendTelegramMsg(
        cbChatId,
        '✔️ Tipo selecionado: ' + (draft.tipo === 'receita' ? 'Receita' : 'Despesa'),
      )
      checkNextStep(cbChatId, draft)
      return e.json(200, { ok: true })
    }

    if (cbData.startsWith('cat:')) {
      draft.categoria = cbData.replace('cat:', '')
      saveSession(cbChatId, session ? session.getString('state') : 'processing', draft, 'categoria')
      let catNome = draft.categoria
      try {
        const cRec = $app.findRecordById('categorias', draft.categoria)
        catNome = cRec.getString('nome')
      } catch (_) {}
      sendTelegramMsg(cbChatId, '✔️ Categoria selecionada: ' + catNome)
      checkNextStep(cbChatId, draft)
      return e.json(200, { ok: true })
    }

    if (cbData.startsWith('conta:')) {
      draft.conta = cbData.replace('conta:', '')
      saveSession(cbChatId, session ? session.getString('state') : 'processing', draft, 'conta')
      let contaNome = draft.conta
      try {
        const cRec = $app.findRecordById('contas', draft.conta)
        contaNome = cRec.getString('nome')
      } catch (_) {}
      sendTelegramMsg(cbChatId, '✔️ Conta selecionada: ' + contaNome)
      checkNextStep(cbChatId, draft)
      return e.json(200, { ok: true })
    }

    if (cbData.startsWith('ctx:')) {
      const ctxId = cbData.replace('ctx:', '')
      if (ctxId === 'none') {
        draft.contexto_id = ''
        draft.contexto_nome = ''
        saveSession(
          cbChatId,
          session ? session.getString('state') : 'processing',
          draft,
          'contexto',
          '',
        )
        sendTelegramMsg(cbChatId, '✔️ Contexto selecionado: Geral')
      } else {
        draft.contexto_id = ctxId
        try {
          const gRec = $app.findRecordById('contexto_grupos', ctxId)
          draft.contexto_nome = gRec.getString('nome')
          saveSession(
            cbChatId,
            session ? session.getString('state') : 'processing',
            draft,
            'contexto',
            draft.contexto_nome,
          )
          sendTelegramMsg(cbChatId, '✔️ Contexto selecionado: ' + draft.contexto_nome)
        } catch (_) {}
      }
      checkNextStep(cbChatId, draft)
      return e.json(200, { ok: true })
    }

    if (cbData === 'confirm:yes') {
      finalizeLancamento(cbChatId, draft)
      return e.json(200, { ok: true })
    }

    if (cbData === 'confirm_dupe:yes') {
      draft.force_duplicate = true
      finalizeLancamento(cbChatId, draft)
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
      'Estou pronto para automatizar seus lançamentos:\n' +
      '• Envie a foto de um comprovante Pix, boleto ou recibo.\n' +
      '• Ou descreva o gasto/receita em texto (ex: "Gastei R$ 184,32 na CPFL pelo NuBank").\n\n' +
      '💡 Quando eu precisar de alguma informação do sistema (Categoria, Conta, Contexto ou Tipo), ' +
      'apresentarei opções com botões interativos para você escolher com apenas um toque!\n\n' +
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

  // Se o usuário estiver respondendo um campo de texto livre que faltava
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
    saveSession(chatId, 'processing', currentDraft, 'valor')
    sendTelegramMsg(chatId, '✔️ Valor registrado: R$ ' + num.toFixed(2).replace('.', ','))
    checkNextStep(chatId, currentDraft)
    return e.json(200, { ok: true })
  }

  if (currentState === 'awaiting_descricao') {
    currentDraft.descricao = rawText
    saveSession(chatId, 'processing', currentDraft, 'descricao')
    sendTelegramMsg(chatId, '✔️ Descrição: ' + rawText)
    checkNextStep(chatId, currentDraft)
    return e.json(200, { ok: true })
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

        // Baixar bytes da imagem para enviar em base64 (evita falhas de DNS/resolução externa no gateway)
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

        // Tentar visão computacional: primeiro com base64, depois fallback com URL pública do Telegram
        const visionPrompt =
          'Você é um extrator especialista de comprovantes financeiros brasileiros (Pix, boletos, TED, transferências bancárias, cartões, notas fiscais).\n' +
          'Analise com máxima atenção cada detalhe e transcreva com exatidão:\n' +
          '- VALOR EXATO (R$)\n' +
          '- DATA E HORA da transação\n' +
          '- BANCO OU INSTITUIÇÃO DE ORIGEM (ex: NuBank, Banco Inter, Itaú, Bradesco, Sicredi, Caixa)\n' +
          '- NOME DO FAVORECIDO / DESTINATÁRIO\n' +
          '- NOME DO PAGADOR / ORIGEM\n' +
          '- TIPO DA TRANSAÇÃO: Pix enviado, Pix recebido, Pagamento de Boleto, Compra no Cartão de Débito/Crédito ou TED\n' +
          '- IDENTIFICADOR / CÓDIGO DE AUTENTICAÇÃO PIX se presente.\n' +
          (rawText ? 'Legenda informada pelo usuário: ' + rawText : '')

        // 1ª tentativa: base64 (se disponível)
        if (base64Data) {
          try {
            const dataUri = 'data:' + mimeType + ';base64,' + base64Data
            const vRes = $ai.chat({
              model: 'fast',
              messages: [
                {
                  role: 'system',
                  content:
                    'Extraia com precisão absoluta os dados de comprovantes financeiros brasileiros.',
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
            console.log('Vision base64 extraction error:', vErr1.message)
          }
        }

        // 2ª tentativa: URL direta caso base64 tenha falhado
        if (!ocrExtractedText) {
          try {
            const vRes2 = $ai.chat({
              model: 'fast',
              messages: [
                {
                  role: 'system',
                  content:
                    'Extraia com precisão absoluta os dados de comprovantes financeiros brasileiros.',
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
            console.log('Vision URL extraction error:', vErr2.message)
          }
        }
      }
    } catch (getFileErr) {
      console.log('Telegram getFile error:', getFileErr.message)
    }

    if (!ocrExtractedText && !rawText) {
      // Se a imagem não pôde ser lida por visão computacional e não veio texto
      sendTelegramMsg(
        chatId,
        '📷 Recebi a imagem do seu comprovante!\n\n' +
          '⚠️ Não foi possível extrair o texto automaticamente desta foto (imagem pode estar com baixa resolução ou formato não suportado).\n\n' +
          '💬 Por favor, digite os dados da transação em texto, por exemplo:\n' +
          '👉 "CPFL Energia, R$ 184,32, NuBank"\n' +
          'Ou envie: "R$ 50,00 no almoço"',
      )
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

  const savedContexto = session ? session.getString('contexto_nome') : ''

  const extractionPrompt =
    'Você é o motor de classificação financeira do GKza.\n' +
    'Analise as informações abaixo (OCR da imagem e/ou texto digitado) e extraia um objeto JSON com os dados do lançamento:\n\n' +
    (ocrExtractedText ? 'DADOS DO COMPROVANTE (OCR):\n' + ocrExtractedText + '\n\n' : '') +
    (rawText ? 'TEXTO/LEGENDA DO USUÁRIO:\n' + rawText + '\n\n' : '') +
    'CONTEXTO ATIVO SALVO: ' +
    (savedContexto || 'Nenhum') +
    '\n\n' +
    'LISTA DE CATEGORIAS DISPONÍVEIS NO SISTEMA:\n' +
    JSON.stringify(catNames) +
    '\n\n' +
    'LISTA DE CONTAS DISPONÍVEIS NO SISTEMA:\n' +
    JSON.stringify(contaNames) +
    '\n\n' +
    'REGRAS:\n' +
    '1. Retorne ESTRITAMENTE um objeto JSON válido, sem texto antes ou depois, sem markdown no formato:\n' +
    '{\n' +
    '  "tipo": "despesa" | "receita" | null,\n' +
    '  "descricao": string ou null,\n' +
    '  "valor": number ou null,\n' +
    '  "data": "YYYY-MM-DD" ou null,\n' +
    '  "categoria_id": string (id exato da categoria acima) ou null,\n' +
    '  "conta_id": string (id exato da conta acima) ou null,\n' +
    '  "observacoes": string,\n' +
    '  "status": "pago" | "pendente"\n' +
    '}\n' +
    '2. Se tiver certeza da categoria pela lista, preencha categoria_id. Se for incerto ou duvidoso, use null.\n' +
    '3. Se identificar a conta bancária/cartão (ex: NuBank, Banco Inter, Sicred, Caixa), preencha conta_id. Se for incerto, use null.\n' +
    '4. Se o tipo for evidente (Pix enviado, conta paga = despesa; Pix recebido = receita), preencha. Se incerto, use null.\n' +
    '5. Em valor, use somente número com ponto decimal (ex: 184.32). Se não encontrar, use null.'

  let parsedDraft = null
  try {
    const aiExtract = $ai.chat({
      model: 'fast',
      messages: [
        {
          role: 'system',
          content: 'Você é um analisador JSON estrito. Responda apenas com o objeto JSON pedido.',
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

  const draft = {
    tipo: parsedDraft && parsedDraft.tipo ? parsedDraft.tipo : null,
    descricao: parsedDraft && parsedDraft.descricao ? parsedDraft.descricao : '',
    valor: parsedDraft && parsedDraft.valor ? parseFloat(parsedDraft.valor) : null,
    data:
      parsedDraft && parsedDraft.data ? parsedDraft.data : new Date().toISOString().slice(0, 10),
    categoria: parsedDraft && parsedDraft.categoria_id ? parsedDraft.categoria_id : null,
    conta: parsedDraft && parsedDraft.conta_id ? parsedDraft.conta_id : null,
    status: parsedDraft && parsedDraft.status ? parsedDraft.status : 'pago',
    observacoes:
      parsedDraft && parsedDraft.observacoes
        ? parsedDraft.observacoes
        : 'Registrado via Telegram GKza',
    contexto_nome: savedContexto || '',
  }

  // Se veio da imagem o OCR detalhado, guardar no rascunho
  if (ocrExtractedText) {
    draft.ocr_resumo = ocrExtractedText.slice(0, 300)
  }

  // Notificar o usuário do que foi compreendido
  if (draft.descricao && draft.valor) {
    const valFmt = 'R$ ' + draft.valor.toFixed(2).replace('.', ',')
    sendTelegramMsg(
      chatId,
      '🔎 Identifiquei: ' +
        draft.descricao +
        ' (' +
        valFmt +
        ')' +
        (draft.tipo ? ' • ' + (draft.tipo === 'receita' ? '🟢 Receita' : '🔴 Despesa') : ''),
    )
  }

  // Salvar o draft na sessão e acionar o fluxo de opções (rádios) para o que faltar
  saveSession(chatId, 'processing', draft, 'next', savedContexto)
  checkNextStep(chatId, draft)

  return e.json(200, { ok: true })
})
