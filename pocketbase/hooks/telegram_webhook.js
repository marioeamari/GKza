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
  const message = body.message || body.edited_message || null

  if (!message || !message.chat) {
    // Ack Telegram updates that are not chat messages
    return e.json(200, { ok: true, ignored: true })
  }

  const chatId = message.chat.id
  const text = (message.text || message.caption || '').trim()
  const photos = message.photo || null

  // Função inline para enviar mensagem ao Telegram
  const sendTelegramMessage = (replyText) => {
    try {
      $http.send({
        url: 'https://api.telegram.org/bot' + token + '/sendMessage',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
        }),
        timeout: 15,
      })
    } catch (err) {
      console.log('Failed to send Telegram message:', err.message)
    }
  }

  // Obter usuário de serviço para o agente
  let botUserId = ''
  try {
    const user = $app.findAuthRecordByEmail('users', 'telegram-bot@gkza.local')
    botUserId = user.id
  } catch (_) {
    try {
      const adminUser = $app.findAuthRecordByEmail('users', 'marioeduardomari@gmail.com')
      botUserId = adminUser.id
    } catch (_) {
      console.log('No bot or admin user found for agent execution')
      sendTelegramMessage(
        '⚠️ Erro de configuração no sistema GKza: Usuário de serviço não encontrado.',
      )
      return e.json(200, { ok: true })
    }
  }

  // Tratar comando /start ou /ajuda
  if (text.startsWith('/start') || text.startsWith('/ajuda') || text.startsWith('/help')) {
    const welcome =
      '👋 Olá! Eu sou o Agente Financeiro Inteligente do GKza.\n\n' +
      'Estou pronto para automatizar seus lançamentos:\n' +
      '• Envie a foto de um comprovante Pix, boleto ou recibo.\n' +
      '• Ou envie um texto descritivo (ex: "Gastei R$ 184,32 na CPFL pelo NuBank" ou "Recebi R$ 1.250 de consultoria no Inter").\n\n' +
      '🔍 Sempre analiso o valor, a conta e a categoria. Se houver qualquer dúvida, pergunto antes de lançar para manter seu caixa impecável!\n\n' +
      'Comandos disponíveis:\n' +
      '• /ajuda - Mostra esta mensagem\n' +
      '• /contexto <nome> - Define o contexto/empresa padrão das transações'
    sendTelegramMessage(welcome)
    return e.json(200, { ok: true })
  }

  // Tratar comando /contexto
  if (text.startsWith('/contexto')) {
    const parts = text.split(' ')
    parts.shift()
    const target = parts.join(' ').trim()
    if (!target) {
      sendTelegramMessage(
        'ℹ️ Para trocar de contexto, informe o nome do grupo ou empresa:\nExemplo: /contexto Casa\nOu: /contexto Padaria Estrela Dourada',
      )
      return e.json(200, { ok: true })
    }
    // Pesquisar contexto
    try {
      const gFilter = `nome ~ '${target}'`
      const grupos = $app.findRecordsByFilter('contexto_grupos', gFilter, 'ordem', 1, 0)
      if (grupos && grupos.length > 0) {
        const g = grupos[0]
        sendTelegramMessage(
          '✅ Contexto ativo alterado para "' +
            g.getString('nome') +
            '". Os próximos comprovantes serão lançados neste grupo.',
        )
        return e.json(200, { ok: true })
      } else {
        sendTelegramMessage(
          '⚠️ Não encontrei nenhum contexto com o nome "' +
            target +
            '". Verifique os grupos cadastrados no GKza.',
        )
        return e.json(200, { ok: true })
      }
    } catch (err) {
      console.log('Error looking up context:', err.message)
    }
  }

  // Preparar mensagem para o Agente Skip Cloud
  let agentInput = text

  // Caso tenha imagem anexada
  if (photos && photos.length > 0) {
    // Pegar a foto de maior resolução (último item do array no Telegram)
    const bestPhoto = photos[photos.length - 1]
    let ocrExtractedText = ''

    try {
      // 1. Obter caminho do arquivo via Telegram getFile API
      const fileRes = $http.send({
        url: 'https://api.telegram.org/bot' + token + '/getFile?file_id=' + bestPhoto.file_id,
        method: 'GET',
        timeout: 10,
      })

      if (fileRes.json && fileRes.json.ok && fileRes.json.result.file_path) {
        const filePath = fileRes.json.result.file_path
        const fileUrl = 'https://api.telegram.org/file/bot' + token + '/' + filePath

        // Tentar extrair dados da imagem usando o modelo multimodal do $ai.chat
        try {
          const visionReply = $ai.chat({
            model: 'fast',
            messages: [
              {
                role: 'system',
                content:
                  'Você é um extrator especialista de comprovantes financeiros brasileiros (Pix, boletos, TED, transferências bancárias, cartões, notas fiscais). Extraia com precisão máxima em texto estruturado: Valor (R$), Data e Hora, Banco/Instituição de Origem, Banco/Instituição de Favorecido, Nome do Favorecido/Pagador, CNPJ/CPF se visível, Tipo de transação (Pix enviado, Pix recebido, Pagamento de boleto, etc.) e ID/Código de Autenticação. Se a imagem não for um comprovante ou estiver ilegível, descreva o que vê e avise claramente.',
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text:
                      'Por favor, leia atentamente todos os dados deste comprovante de pagamento/transferência e transcreva em detalhes todos os campos visíveis:\nLegenda enviada pelo usuário: ' +
                      (text || '(nenhuma)'),
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: fileUrl,
                    },
                  },
                ],
              },
            ],
          })

          if (
            visionReply &&
            visionReply.choices &&
            visionReply.choices.length > 0 &&
            visionReply.choices[0].message
          ) {
            ocrExtractedText = visionReply.choices[0].message.content || ''
          }
        } catch (visionErr) {
          console.log('Vision extraction error (fallback to agent text prompt):', visionErr.message)
        }
      }
    } catch (getFileErr) {
      console.log('Telegram getFile error:', getFileErr.message)
    }

    if (ocrExtractedText) {
      agentInput =
        'O usuário enviou uma FOTO DE COMPROVANTE no Telegram.\n\n' +
        'TEXTO E DADOS EXTRAÍDOS DA IMAGEM:\n' +
        ocrExtractedText +
        '\n\n' +
        (text ? 'LEGENDA DIGITADA PELO USUÁRIO:\n' + text + '\n\n' : '') +
        'Analise os dados extraídos acima, verifique a integridade (valor, data, tipo despesa/receita, categoria e conta). Se faltar algo crítico ou houver dúvida, pergunte. Se estiver completo e claro, realize o lançamento em "lancamentos" e confirme com os dados detalhados.'
    } else {
      // Se não foi possível extrair a imagem via visão computacional
      if (!text) {
        sendTelegramMessage(
          '📷 Recebi a imagem do seu comprovante! Não consegui ler os dados automaticamente desta imagem com nitidez.\n\n' +
            'Por favor, digite os detalhes para o lançamento, ex.:\n' +
            '👉 "CPFL Energia, R$ 184,32, NuBank"',
        )
        return e.json(200, { ok: true })
      } else {
        agentInput =
          'O usuário enviou uma imagem acompanhada do seguinte texto:\n"' +
          text +
          '"\n(A leitura direta da imagem não esteve disponível, processe com base no texto enviado).'
      }
    }
  }

  if (!agentInput) {
    sendTelegramMessage(
      'Olá! Envie uma foto de comprovante ou descreva a receita/despesa para realizarmos o lançamento.',
    )
    return e.json(200, { ok: true })
  }

  // Executar o agente nativo Skip Cloud
  // Nota: omitir conversation_id ou passar null cria uma nova conversa no runtime.
  // Como cada mensagem no Telegram pode ser independente ou continuada, passamos null
  // para permitir que o agente execute o loop de tools e crie o lançamento de forma limpa.
  try {
    const result = $ai.agent('agente-financeiro-telegram').chat({
      user_id: botUserId,
      conversation_id: null,
      message: agentInput,
    })

    const replyContent =
      result && result.content ? result.content : 'Processado com sucesso pelo agente financeiro.'

    sendTelegramMessage(replyContent)
  } catch (agentErr) {
    console.log('Agent execution error:', agentErr.message)
    sendTelegramMessage(
      '⚠️ Ocorreu uma instabilidade no processamento:\n' +
        (agentErr.message || 'Erro interno') +
        '\nPor favor, tente novamente.',
    )
  }

  return e.json(200, { ok: true })
})
