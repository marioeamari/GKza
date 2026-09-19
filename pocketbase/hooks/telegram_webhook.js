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
  const updateId = body.update_id ? String(body.update_id) : ''
  const callbackQuery = body.callback_query || null
  const message = body.message || body.edited_message || null

  // Helpers de envio para a API do Telegram
  const sendTelegramMsg = (chatId, replyText, replyMarkup) => {
    try {
      const payload = {
        chat_id: String(chatId),
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
          chat_id: String(chatId),
          message_id: messageId,
          reply_markup: replyMarkup || { inline_keyboard: [] },
        }),
        timeout: 10,
      })
    } catch (err) {
      console.log('Failed to edit message reply markup:', err.message)
    }
  }

  // Helpers de Sessão — Persistência 100% robusta com campos dedicados de texto
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

  const getDraftFromSession = (session) => {
    if (!session) return {}
    try {
      // 1. Tentar ler do campo dedicado de texto draft_json
      const dedicatedJson = session.getString('draft_json')
      if (dedicatedJson && dedicatedJson.trim() && dedicatedJson.trim() !== '{}') {
        try {
          const parsed = JSON.parse(dedicatedJson.trim())
          if (parsed && typeof parsed === 'object') {
            return parsed
          }
        } catch (_) {}
      }

      // 2. Se não encontrou draft_json, reconstruir a partir dos campos individuais dedicados
      const explicitValor = session.getFloat('draft_valor') || 0
      const explicitDescricao = session.getString('draft_descricao') || ''
      const explicitTipo = session.getString('draft_tipo') || ''
      const explicitData = session.getString('draft_data_transacao') || ''
      const explicitConta = session.getString('draft_conta') || ''
      const explicitCategoria = session.getString('draft_categoria') || ''
      const explicitContexto = session.getString('contexto_nome') || ''
      const explicitObs = session.getString('draft_observacoes') || ''
      const explicitOcr = session.getString('draft_comprovante_texto') || ''

      if (explicitValor > 0 || explicitDescricao || explicitTipo) {
        return {
          tipo: explicitTipo || 'despesa',
          descricao: explicitDescricao,
          valor: explicitValor > 0 ? explicitValor : null,
          data: explicitData || new Date().toISOString().slice(0, 10),
          categoria: explicitCategoria || null,
          conta: explicitConta || null,
          contexto_nome: explicitContexto || '',
          comprovante_texto: explicitOcr || '',
          observacoes: explicitObs || '',
        }
      }

      // 3. Fallback legado para o campo draft_data (json)
      let raw = null
      try {
        raw = session.get('draft_data')
      } catch (_) {}

      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw
      }
      if (typeof raw === 'string' && raw.trim() && raw.trim() !== '{}') {
        try {
          const parsed = JSON.parse(raw.trim())
          if (parsed && typeof parsed === 'object') return parsed
        } catch (_) {}
      }
      return {}
    } catch (e) {
      console.log('Error reading draft_data:', e.message)
      return {}
    }
  }

  const saveSession = (chatId, state, draftData, pendingQuestion, contextoNome, lastMessageId) => {
    try {
      const strChatId = String(chatId)
      let session = getSession(strChatId)
      if (!session) {
        const col = $app.findCollectionByNameOrId('telegram_sessions')
        session = new Record(col)
        session.set('chat_id', strChatId)
      }

      session.set('state', state || 'idle')

      const draft = draftData || {}
      const valorNum = draft.valor ? parseFloat(draft.valor) : 0

      // Salvar nos campos dedicados de texto e número
      session.set('draft_tipo', draft.tipo || 'despesa')
      session.set('draft_descricao', draft.descricao || '')
      session.set('draft_valor', isNaN(valorNum) ? 0 : valorNum)
      session.set('draft_data_transacao', draft.data || '')
      session.set('draft_categoria', draft.categoria || '')
      session.set('draft_conta', draft.conta || '')
      session.set('draft_observacoes', draft.observacoes || '')
      session.set('draft_comprovante_texto', (draft.comprovante_texto || '').slice(0, 1500))
      session.set('draft_json', JSON.stringify(draft))

      // Manter também draft_data legado para retrocompatibilidade
      session.set('draft_data', draft)

      session.set('pending_question', pendingQuestion || '')
      if (contextoNome !== undefined) {
        session.set('contexto_nome', contextoNome || '')
      }
      if (lastMessageId !== undefined) {
        session.set('last_message_id', String(lastMessageId))
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
        session.set('draft_json', '')
        session.set('draft_valor', 0)
        session.set('draft_descricao', '')
        session.set('draft_tipo', '')
        session.set('draft_data_transacao', '')
        session.set('draft_categoria', '')
        session.set('draft_conta', '')
        session.set('draft_observacoes', '')
        session.set('draft_comprovante_texto', '')
        session.set('pending_question', '')
        $app.save(session)
      }
    } catch (err) {
      console.log('Failed to clear session for ' + chatId + ': ' + err.message)
    }
  }

  // Criação do Registro Pendente na coleção 'telegram_registros_pendentes'
  // Chamado quando o usuário clica em "✅ Confirmar" no Telegram
  const createPendingRecord = (chatId, draft) => {
    try {
      const valor = parseFloat(draft.valor)
      if (!valor || isNaN(valor) || valor <= 0) {
        sendTelegramMsg(
          chatId,
          '⚠️ Não foi possível identificar o valor do comprovante. Por favor, digite o valor em reais (ex: 184,32):',
        )
        saveSession(chatId, 'awaiting_valor', draft, 'valor', draft.contexto_nome || '')
        return
      }

      let dataIso = draft.data || ''
      if (!dataIso) {
        dataIso = new Date().toISOString().slice(0, 10)
      }
      if (!dataIso.includes('T') && !dataIso.includes(' ')) {
        dataIso = dataIso + ' 12:00:00.000Z'
      }

      const colPending = $app.findCollectionByNameOrId('telegram_registros_pendentes')
      const rec = new Record(colPending)

      rec.set('descricao', draft.descricao || 'Comprovante Telegram')
      rec.set('valor', valor)
      rec.set('tipo', draft.tipo || 'despesa')
      rec.set('data', dataIso)
      rec.set('status', 'pendente')

      if (draft.conta && draft.conta !== 'skip') {
        rec.set('conta', draft.conta)
      }
      if (draft.categoria && draft.categoria !== 'skip') {
        rec.set('categoria', draft.categoria)
      }
      if (draft.empresa) {
        rec.set('empresa', draft.empresa)
      }
      if (draft.pessoa) {
        rec.set('pessoa', draft.pessoa)
      }

      rec.set('contexto_nome', draft.contexto_nome || '')
      rec.set('telegram_chat_id', String(chatId))
      rec.set('telegram_origem', draft.telegram_origem || 'Telegram Bot GKza')
      rec.set('comprovante_texto', draft.comprovante_texto || draft.ocr_resumo || '')
      rec.set('observacoes', draft.observacoes || 'Importado via Telegram Bot GKza')

      $app.save(rec)

      // Limpar rascunho da sessão do bot
      clearSessionDraft(chatId)

      const tipoEmoji = draft.tipo === 'receita' ? '🟢' : '🔴'
      const tipoLabel = draft.tipo === 'receita' ? 'Receita' : 'Despesa'
      const valorFmt = 'R$ ' + Number(valor).toFixed(2).replace('.', ',')

      const successMsg =
        '📨 Registro pendente criado!\n\n' +
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
        (draft.contexto_nome ? '• 🏢 Contexto: ' + draft.contexto_nome + '\n' : '') +
        '\nAcesse o sistema em /lancamentos (aba "Pendentes") para aprovar e lançar definitivamente.'

      sendTelegramMsg(chatId, successMsg)
    } catch (err) {
      console.log('Failed to create pending record:', err.message)
      sendTelegramMsg(chatId, '❌ Erro ao criar registro pendente: ' + err.message)
    }
  }

  // Apresentar o RESUMO com botões "✅ Confirmar" e "❌ Descartar"
  const showConfirmationSummary = (chatId, draft) => {
    const valor = parseFloat(draft.valor)
    if (!valor || isNaN(valor) || valor <= 0) {
      saveSession(chatId, 'awaiting_valor', draft, 'valor', draft.contexto_nome || '')
      sendTelegramMsg(
        chatId,
        '⚠️ Não foi possível identificar o valor do comprovante. Por favor, digite o valor em reais (ex: 184,32):',
      )
      return
    }

    let contaNome = ''
    if (draft.conta && draft.conta !== 'skip') {
      try {
        const cRec = $app.findRecordById('contas', draft.conta)
        contaNome = cRec.getString('nome')
      } catch (_) {}
    }

    let catNome = ''
    if (draft.categoria && draft.categoria !== 'skip') {
      try {
        const kRec = $app.findRecordById('categorias', draft.categoria)
        catNome = kRec.getString('nome')
      } catch (_) {}
    }

    const tipoLabel = draft.tipo === 'receita' ? '🟢 Receita' : '🔴 Despesa'
    const valorFmt = 'R$ ' + Number(valor).toFixed(2).replace('.', ',')
    let dataFmt = 'Hoje'
    if (draft.data) {
      dataFmt = draft.data.slice(0, 10).split('-').reverse().join('/')
    }

    let resumoMsg = '📋 Resumo dos dados coletados do comprovante:\n\n'
    resumoMsg += '• Tipo: ' + tipoLabel + '\n'

    if (draft.descricao && draft.descricao.trim() && draft.descricao.trim() !== '-') {
      resumoMsg += '• Descrição: ' + draft.descricao.trim() + '\n'
    }

    resumoMsg += '• Valor: ' + valorFmt + '\n'
    resumoMsg += '• Data: ' + dataFmt + '\n'

    if (contaNome) {
      resumoMsg += '• Conta (sugerida): ' + contaNome + '\n'
    }
    if (catNome) {
      resumoMsg += '• Categoria (sugerida): ' + catNome + '\n'
    }
    if (draft.contexto_nome) {
      resumoMsg += '• Contexto: ' + draft.contexto_nome + '\n'
    }

    resumoMsg +=
      '\nDeseja enviar como Registro Pendente para o sistema?\n(Você poderá definir/ajustar conta, categoria e valores antes de aprovar em /lancamentos)'

    const kb = {
      inline_keyboard: [
        [
          { text: '✅ Confirmar', callback_data: 'confirm:pending' },
          { text: '❌ Descartar', callback_data: 'discard:pending' },
        ],
      ],
    }

    // Salva explicitamente no estado awaiting_summary_confirm
    saveSession(chatId, 'awaiting_summary_confirm', draft, 'summary', draft.contexto_nome || '')
    sendTelegramMsg(chatId, resumoMsg, kb)
  }

  // ----------------------------------------------------
  // TRATAMENTO DE CALLBACK QUERY (BOTÕES INLINE)
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

    if (cbId) {
      answerCallbackQuery(cbId, 'Recebido!')
    }

    if (!cbChatId) {
      return e.json(200, { ok: true })
    }

    // Remover botões da mensagem para evitar cliques repetidos
    if (cbMsgId) {
      editTelegramReplyMarkup(cbChatId, cbMsgId, { inline_keyboard: [] })
    }

    const session = getSession(cbChatId)
    const draft = getDraftFromSession(session)

    if (session && !draft.contexto_nome) {
      const savedCtx = session.getString('contexto_nome')
      if (savedCtx) draft.contexto_nome = savedCtx
    }

    // 1. Confirmar registro pendente
    if (cbData === 'confirm:pending' || cbData === 'confirm:yes') {
      createPendingRecord(cbChatId, draft)
      return e.json(200, { ok: true })
    }

    // 2. Descartar rascunho
    if (cbData === 'discard:pending' || cbData === 'cancel:draft') {
      clearSessionDraft(cbChatId)
      sendTelegramMsg(
        cbChatId,
        '❌ Comprovante descartado. Envie outro comprovante quando desejar.',
      )
      return e.json(200, { ok: true })
    }

    // 3. Escolha de contexto interativo (se chamado via /contexto)
    if (cbData.startsWith('ctx:')) {
      const ctxId = cbData.replace('ctx:', '')
      if (ctxId === 'none') {
        saveSession(cbChatId, 'idle', {}, '', '')
        sendTelegramMsg(cbChatId, '✔️ Contexto ativo alterado para: Geral')
      } else {
        try {
          const gRec = $app.findRecordById('contexto_grupos', ctxId)
          const gNome = gRec.getString('nome')
          saveSession(cbChatId, 'idle', {}, '', gNome)
          sendTelegramMsg(cbChatId, '✔️ Contexto ativo alterado para: ' + gNome)
        } catch (_) {}
      }
      return e.json(200, { ok: true })
    }

    return e.json(200, { ok: true })
  }

  // ----------------------------------------------------
  // TRATAMENTO DE MENSAGENS (TEXTO / FOTO)
  // ----------------------------------------------------
  if (!message || !message.chat) {
    return e.json(200, { ok: true, ignored: true })
  }

  const chatId = message.chat.id
  const currentMsgId = message.message_id ? String(message.message_id) : ''
  const rawText = (message.text || message.caption || '').trim()
  const photos = message.photo || null

  const session = getSession(chatId)
  const currentState = session ? session.getString('state') : 'idle'
  const currentDraft = getDraftFromSession(session)
  const lastProcessedMsgId = session ? session.getString('last_message_id') : ''

  // DEDUPLICAÇÃO DE UPDATES / MENSAGENS REPETIDAS:
  if (currentMsgId && lastProcessedMsgId) {
    const parts = lastProcessedMsgId.split(':')
    const savedMsgId = parts[0]
    const savedUpdateId = parts[1] || ''
    if (savedMsgId === currentMsgId || (updateId && savedUpdateId === updateId)) {
      console.log('Duplicate Telegram update detected and skipped:', currentMsgId, updateId)
      return e.json(200, { ok: true, duplicate: true })
    }
  }

  // Comandos /start, /ajuda
  if (rawText.startsWith('/start') || rawText.startsWith('/ajuda') || rawText.startsWith('/help')) {
    clearSessionDraft(chatId)
    const welcome =
      '👋 Olá! Eu sou o assistente do GKza para comprovantes.\n\n' +
      'O fluxo é direto e sem perguntas desnecessárias:\n' +
      '1. Envie a foto de um comprovante Pix, boleto ou recibo (ou descreva em texto).\n' +
      '2. Eu retorno o resumo dos dados coletados pedindo apenas sua confirmação (✅ Confirmar / ❌ Descartar).\n' +
      '3. Ao confirmar, crio um Registro Pendente no sistema.\n' +
      '4. Acesse o sistema em /lancamentos na aba "Pendentes" para aprovar e lançar!\n\n' +
      'Comandos:\n' +
      '• /ajuda - Mostra esta ajuda\n' +
      '• /contexto - Seleciona o contexto/empresa padrão\n' +
      '• /cancelar - Descarta qualquer rascunho em aberto'
    sendTelegramMsg(chatId, welcome)
    return e.json(200, { ok: true })
  }

  // Comando /cancelar
  if (rawText.startsWith('/cancelar') || rawText === 'cancelar') {
    clearSessionDraft(chatId)
    sendTelegramMsg(chatId, '❌ Rascunho descartado. Pode enviar um novo comprovante.')
    return e.json(200, { ok: true })
  }

  // Comando /contexto
  if (rawText.startsWith('/contexto')) {
    const parts = rawText.split(' ')
    parts.shift()
    const target = parts.join(' ').trim()
    if (!target) {
      let grupos = []
      try {
        grupos = $app.findRecordsByFilter('contexto_grupos', '', 'ordem,nome', 20, 0)
      } catch (_) {}

      const inlineKeyboard = []
      inlineKeyboard.push([{ text: '🌐 Geral (Sem contexto)', callback_data: 'ctx:none' }])
      for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i]
        inlineKeyboard.push([{ text: '🏢 ' + g.getString('nome'), callback_data: 'ctx:' + g.id }])
      }
      sendTelegramMsg(chatId, 'Selecione o Contexto padrão para os próximos comprovantes:', {
        inline_keyboard: inlineKeyboard,
      })
      return e.json(200, { ok: true })
    }

    try {
      const gFilter = `nome ~ '${target}'`
      const grupos = $app.findRecordsByFilter('contexto_grupos', gFilter, 'ordem', 1, 0)
      if (grupos && grupos.length > 0) {
        const gNome = grupos[0].getString('nome')
        saveSession(chatId, 'idle', {}, '', gNome)
        sendTelegramMsg(
          chatId,
          '✅ Contexto ativo alterado para "' +
            gNome +
            '". Os próximos comprovantes receberão essa referência.',
        )
        return e.json(200, { ok: true })
      } else {
        sendTelegramMsg(chatId, '⚠️ Contexto "' + target + '" não encontrado.')
        return e.json(200, { ok: true })
      }
    } catch (err) {
      console.log('Error searching context:', err.message)
    }
  }

  // ----------------------------------------------------
  // ESTADO: awaiting_valor
  // O usuário está respondendo ao pedido do valor que faltava
  // ----------------------------------------------------
  if (!photos && currentState === 'awaiting_valor') {
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
        '⚠️ Não compreendi o valor. Envie apenas o número em reais (ex: 184,32 ou 250):',
      )
      return e.json(200, { ok: true })
    }

    // Atualizar o rascunho com o novo valor
    currentDraft.valor = num
    const trackingMsgId = currentMsgId + (updateId ? ':' + updateId : '')

    // Salvar sessão diretamente no estado awaiting_summary_confirm
    saveSession(
      chatId,
      'awaiting_summary_confirm',
      currentDraft,
      'summary',
      currentDraft.contexto_nome || '',
      trackingMsgId,
    )

    // Mostrar resumo formatado com os botões inline
    showConfirmationSummary(chatId, currentDraft)
    return e.json(200, { ok: true })
  }

  // ----------------------------------------------------
  // ESTADO: awaiting_summary_confirm
  // O resumo já está exibido com botões ✅ Confirmar e ❌ Descartar
  // BLINDAGEM CONTRA LOOP: NUNCA voltar a pedir valor aqui!
  // ----------------------------------------------------
  if (!photos && currentState === 'awaiting_summary_confirm') {
    const lower = rawText.toLowerCase()
    if (
      lower === 'sim' ||
      lower === 's' ||
      lower === 'ok' ||
      lower.includes('confirma') ||
      lower.includes('pode') ||
      lower.includes('registra')
    ) {
      createPendingRecord(chatId, currentDraft)
      return e.json(200, { ok: true })
    }
    if (
      lower === 'não' ||
      lower === 'nao' ||
      lower === 'n' ||
      lower.includes('descarta') ||
      lower.includes('cancela')
    ) {
      clearSessionDraft(chatId)
      sendTelegramMsg(chatId, '❌ Comprovante descartado.')
      return e.json(200, { ok: true })
    }

    // Se o usuário digitou qualquer outro texto (ou reenviou o número do valor):
    // Não tratar como novo comprovante nem pedir o valor de novo!
    // Lembrar o usuário de clicar nos botões ou confirmar por texto.
    const kb = {
      inline_keyboard: [
        [
          { text: '✅ Confirmar', callback_data: 'confirm:pending' },
          { text: '❌ Descartar', callback_data: 'discard:pending' },
        ],
      ],
    }
    sendTelegramMsg(
      chatId,
      '👆 Por favor, clique em **✅ Confirmar** ou **❌ Descartar** no resumo acima para concluir (ou digite "sim" / "cancelar").',
      kb,
    )
    return e.json(200, { ok: true })
  }

  // ----------------------------------------------------
  // EXTRAÇÃO DE DADOS DE NOVO COMPROVANTE (FOTO OU NOVO TEXTO)
  // Chega aqui apenas se NÃO estiver em awaiting_valor e NÃO estiver em awaiting_summary_confirm
  // ----------------------------------------------------
  let ocrExtractedText = ''

  if (photos && photos.length > 0) {
    const bestPhoto = photos[photos.length - 1]

    try {
      const fileRes = $http.send({
        url: 'https://api.telegram.org/bot' + token + '/getFile?file_id=' + bestPhoto.file_id,
        method: 'GET',
        timeout: 10,
      })

      if (fileRes.json && fileRes.json.ok && fileRes.json.result.file_path) {
        const filePath = fileRes.json.result.file_path
        const fileUrl = 'https://api.telegram.org/file/bot' + token + '/' + filePath

        let mimeType = 'image/jpeg'
        if (filePath.endsWith('.png')) mimeType = 'image/png'
        else if (filePath.endsWith('.webp')) mimeType = 'image/webp'

        let base64Data = ''
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
          'Você é um extrator de comprovantes financeiros brasileiros (Pix, boletos, TED, transferências bancárias, cartões, recibos).\n' +
          'Analise com atenção máxima todos os detalhes visuais do comprovante e extraia:\n' +
          '1. VALOR TOTAL (em R$):\n' +
          '2. DATA da transação (YYYY-MM-DD):\n' +
          '3. TIPO: despesa (Pix enviado, pagamento boleto, compra cartão) ou receita (Pix recebido, transferência recebida):\n' +
          '4. BANCO / CONTA PAGADORA (ex: NuBank, Inter, Sicredi, Caixa, Itaú, Bradesco, Santander):\n' +
          '5. NOME DO FAVORECIDO / DESTINATÁRIO (ou pagador se for recebimento):\n' +
          '6. FINALIDADE OU SERVIÇO (energia, internet, aluguel, supermercado, fornecedor):\n' +
          (rawText ? '7. LEGENDA / TEXTO: ' + rawText : '')

        // Tentativa 1: base64
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
            console.log('Vision base64 extraction error:', vErr1.message)
          }
        }

        // Tentativa 2: fileUrl caso base64 tenha falhado
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
            console.log('Vision URL extraction error:', vErr2.message)
          }
        }
      }
    } catch (getFileErr) {
      console.log('Telegram getFile error:', getFileErr.message)
    }
  }

  // Cadastros do sistema para enriquecer sugestões de categoria, conta e contexto
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
    'Analise todas as informações abaixo e extraia um objeto JSON rigoroso para lançamento:\n\n' +
    (ocrExtractedText
      ? '=== OCR / DETALHES DO COMPROVANTE ===\n' + ocrExtractedText + '\n\n'
      : '') +
    (rawText ? '=== TEXTO / LEGENDA DO USUÁRIO ===\n' + rawText + '\n\n' : '') +
    'CONTEXTO ATIVO SALVO: ' +
    (savedContexto || 'Nenhum') +
    '\n\n' +
    'LISTA DE CATEGORIAS:\n' +
    JSON.stringify(catNames) +
    '\n\n' +
    'LISTA DE CONTAS:\n' +
    JSON.stringify(contaNames) +
    '\n\n' +
    'LISTA DE CONTEXTOS:\n' +
    JSON.stringify(grupoNames) +
    '\n\n' +
    'DIRETRIZES:\n' +
    '1. TIPO: "despesa" se foi pagamento/Pix enviado/débito/saída; "receita" se foi Pix recebido/crédito/entrada.\n' +
    '2. DESCRIÇÃO: Priorize o NOME DO FAVORECIDO / DESTINATÁRIO (ex: "CPFL Energia", "Supermercado Tauste", "João Silva") ou razão social. Se ausente, deixe vazio.\n' +
    '3. VALOR: Número decimal positivo em Reais (ex: 184.32). Se não estiver visível ou não tiver certeza absoluta, retorne null.\n' +
    '4. DATA: Data da transação no formato "YYYY-MM-DD" (se ilegível ou ausente, use hoje).\n' +
    '5. CONTA_ID: Se identificar a instituição (NuBank, Inter, Sicredi, Caixa), preencha o "id" exato da lista de contas. Se não identificar, retorne null.\n' +
    '6. CATEGORIA_ID: Se identificar claramente o ramo (energia, aluguel, etc), sugira a categoria correspondente. Se não identificar com certeza, retorne null.\n' +
    '7. CONTEXTO_NOME: Preserve o CONTEXTO ATIVO SALVO ou infira dos grupos listados.\n\n' +
    'RETORNE ESTRITAMENTE UM JSON NO FORMATO:\n' +
    '{\n' +
    '  "tipo": "despesa" | "receita",\n' +
    '  "descricao": string,\n' +
    '  "valor": number | null,\n' +
    '  "data": "YYYY-MM-DD",\n' +
    '  "categoria_id": string | null,\n' +
    '  "conta_id": string | null,\n' +
    '  "contexto_nome": string | null,\n' +
    '  "observacoes": string\n' +
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

  // Fallbacks determinísticos via regex caso a IA não tenha extraído algum campo
  const textForRegex = (rawText + ' ' + (ocrExtractedText || '')).trim()
  let fallbackValor = null
  if (textForRegex) {
    const matchReais =
      textForRegex.match(/R\$\s*([0-9.,]+)/i) ||
      textForRegex.match(/(?:valor|total|pago|quantia)[\s:]*R?\$?\s*([0-9.,]+)/i) ||
      textForRegex.match(/\b([0-9]{1,6}[.,][0-9]{2})\b/)
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

  let fallbackData = null
  const dateMatch = textForRegex.match(/\b([0-3]?[0-9])\/([0-1]?[0-9])\/(20[2-9][0-9])\b/)
  if (dateMatch) {
    const dDay = dateMatch[1].padStart(2, '0')
    const dMonth = dateMatch[2].padStart(2, '0')
    const dYear = dateMatch[3]
    fallbackData = `${dYear}-${dMonth}-${dDay}`
  }

  let fallbackDescricao = null
  const favMatch =
    textForRegex.match(
      /(?:favorecido|destinat[áa]rio|benefici[áa]rio|recebedor|para)[\s:]+([A-Za-z0-9À-ÿ\s.\-&]{3,40})/i,
    ) ||
    textForRegex.match(
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

  // Detecção determinística de conta por palavras-chave
  let fallbackContaId = null
  const lowerCombined = textForRegex.toLowerCase()
  for (let k = 0; k < contaNames.length; k++) {
    const cItem = contaNames[k]
    const cLower = cItem.nome.toLowerCase()
    if (lowerCombined.includes(cLower)) {
      fallbackContaId = cItem.id
      break
    }
    if (
      cLower.includes('nubank') &&
      (lowerCombined.includes('nu') ||
        lowerCombined.includes('nubank') ||
        lowerCombined.includes('nu pagamentos'))
    ) {
      fallbackContaId = cItem.id
      break
    }
    if (
      cLower.includes('inter') &&
      (lowerCombined.includes('inter') || lowerCombined.includes('banco inter'))
    ) {
      fallbackContaId = cItem.id
      break
    }
    if (
      cLower.includes('sicred') &&
      (lowerCombined.includes('sicredi') || lowerCombined.includes('sicred'))
    ) {
      fallbackContaId = cItem.id
      break
    }
  }

  // Detecção determinística de tipo por palavras-chave
  let fallbackTipo = null
  if (
    lowerCombined.includes('pix enviado') ||
    lowerCombined.includes('pagamento efetuado') ||
    lowerCombined.includes('pago com sucesso') ||
    lowerCombined.includes('gastei') ||
    lowerCombined.includes('saída') ||
    lowerCombined.includes('débito')
  ) {
    fallbackTipo = 'despesa'
  } else if (
    lowerCombined.includes('pix recebido') ||
    lowerCombined.includes('recebi') ||
    lowerCombined.includes('transferência recebida') ||
    lowerCombined.includes('crédito em conta') ||
    lowerCombined.includes('entrada')
  ) {
    fallbackTipo = 'receita'
  }

  const finalTipo = parsedDraft && parsedDraft.tipo ? parsedDraft.tipo : fallbackTipo || 'despesa'
  let finalDescricao = ''
  if (parsedDraft && parsedDraft.descricao && parsedDraft.descricao.trim()) {
    finalDescricao = parsedDraft.descricao.trim()
  } else if (fallbackDescricao) {
    finalDescricao = fallbackDescricao
  } else if (!photos && rawText) {
    finalDescricao = rawText
  }

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

  // Montar novo rascunho
  const draft = {
    tipo: finalTipo,
    descricao: finalDescricao,
    valor: finalValor,
    data: finalData,
    categoria: finalCategoria,
    conta: finalConta,
    contexto_nome: finalContexto,
    telegram_origem: rawText ? 'Texto/Legenda Telegram' : 'Comprovante Foto Telegram',
    comprovante_texto: (ocrExtractedText || rawText || '').slice(0, 1000),
    observacoes:
      (parsedDraft && parsedDraft.observacoes ? parsedDraft.observacoes + ' | ' : '') +
      'Origem: Telegram Chat ' +
      chatId,
  }

  const trackingMsgId = currentMsgId + (updateId ? ':' + updateId : '')

  // Salvar rascunho e decidir a mensagem a ser enviada
  if (!draft.valor || draft.valor <= 0) {
    saveSession(chatId, 'awaiting_valor', draft, 'valor', draft.contexto_nome || '', trackingMsgId)
    sendTelegramMsg(
      chatId,
      '⚠️ Não foi possível identificar o valor do comprovante. Por favor, digite o valor em reais (ex: 184,32):',
    )
  } else {
    saveSession(
      chatId,
      'awaiting_summary_confirm',
      draft,
      'summary',
      draft.contexto_nome || '',
      trackingMsgId,
    )
    showConfirmationSummary(chatId, draft)
  }

  return e.json(200, { ok: true })
})
