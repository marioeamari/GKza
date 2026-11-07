routerAdd('GET', '/backend/v1/google/callback', (e) => {
  const code = e.requestInfo().query.code
  const stateStr = e.requestInfo().query.state
  const error = e.requestInfo().query.error

  console.log('[Google Callback] Início da requisição callback:', {
    hasCode: !!code,
    hasState: !!stateStr,
    hasError: !!error,
  })

  // 1. Extração segura de state (userId e origin)
  let userId = ''
  let stateOrigin = ''
  try {
    if (stateStr) {
      const decodedState = decodeURIComponent(stateStr)
      let parsed = null
      try {
        parsed = JSON.parse(decodedState)
      } catch (_) {
        // Tenta parse direto sem decode adicional
        parsed = JSON.parse(stateStr)
      }
      if (parsed) {
        userId = parsed.userId || ''
        stateOrigin = parsed.origin || ''
      }
    }
  } catch (err) {
    console.log('[Google Callback] Falha ao processar state:', err)
  }

  // 2. Validação da origin do state e resolução de fallback
  // Domínios autorizados: goskip.app, goskip.dev, localhost, 127.0.0.1
  let resolvedBaseUrl = ''
  if (stateOrigin && typeof stateOrigin === 'string') {
    const trimmed = stateOrigin.trim()
    const isAllowed =
      trimmed.includes('.goskip.app') ||
      trimmed.includes('.goskip.dev') ||
      trimmed.includes('localhost') ||
      trimmed.includes('127.0.0.1')
    if (isAllowed) {
      resolvedBaseUrl = trimmed
    }
  }

  // Fallback 1: Headers X-Forwarded-Host ou Host
  if (!resolvedBaseUrl) {
    const fwdProto = e.requestInfo().headers['x-forwarded-proto'] || 'https'
    const fwdHost =
      e.requestInfo().headers['x-forwarded-host'] || e.requestInfo().headers['host'] || ''
    if (fwdHost) {
      resolvedBaseUrl = fwdProto + '://' + fwdHost
    }
  }

  // Fallback 2: SITE_URL fixo
  if (!resolvedBaseUrl) {
    resolvedBaseUrl =
      $os.getenv('SITE_URL') || 'https://gestao-financeira-e-marketplaces-d7ede.goskip.app'
  }

  if (resolvedBaseUrl.endsWith('/')) {
    resolvedBaseUrl = resolvedBaseUrl.slice(0, -1)
  }

  const targetRedirect = resolvedBaseUrl + '/configuracoes?google_calendar=status'

  console.log('[Google Callback] Base URL resolvida para retorno:', resolvedBaseUrl)

  // 3. Tradução amigável de erros do Google para pt-BR
  const translateGoogleError = (rawErr, rawDesc) => {
    const key = (rawErr || '').toLowerCase()
    const desc = (rawDesc || '').toLowerCase()

    if (key === 'access_denied') {
      return 'Acesso negado: você cancelou a autorização com o Google.'
    }
    if (
      key === 'invalid_grant' ||
      desc.includes('invalid_grant') ||
      desc.includes('code has expired')
    ) {
      return 'Código de autorização expirado ou inválido. Por favor, tente conectar novamente.'
    }
    if (key === 'redirect_uri_mismatch' || desc.includes('redirect_uri_mismatch')) {
      return 'A URI de redirecionamento configurada no Google Cloud não coincide com o endereço deste servidor.'
    }
    if (
      key === 'invalid_client' ||
      desc.includes('invalid_client') ||
      desc.includes('unauthorized_client')
    ) {
      return 'Credenciais de cliente inválidas ou não autorizadas no Google Cloud Console.'
    }
    if (key === 'no_code') {
      return 'Código de autorização não recebido do Google.'
    }
    if (key === 'missing_credentials') {
      return 'As credenciais GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não foram configuradas no servidor.'
    }
    if (key === 'user_not_identified') {
      return 'Não foi possível associar a conta do Google ao seu usuário no ERP.'
    }
    if (rawDesc && rawDesc.trim()) {
      return rawDesc
    }
    return rawErr || 'Ocorreu um erro desconhecido durante a autenticação com o Google.'
  }

  if (error) {
    console.log('[Google Callback] Parâmetro error presente na query:', error)
    const friendlyMsg = translateGoogleError(error, '')
    return e.redirect(302, targetRedirect + '&error=' + encodeURIComponent(friendlyMsg))
  }

  if (!code) {
    console.log('[Google Callback] Parâmetro code ausente')
    const friendlyMsg = translateGoogleError('no_code', '')
    return e.redirect(302, targetRedirect + '&error=' + encodeURIComponent(friendlyMsg))
  }

  const clientId = $os.getenv('GOOGLE_CLIENT_ID')
  const clientSecret = $os.getenv('GOOGLE_CLIENT_SECRET')

  // Resolve a base do backend a partir da requisição REAL de entrada (host público
  // pelo qual o callback foi chamado), não de PB_INSTANCE_URL — evita redirect_uri_mismatch.
  let backendBase = ''
  let backendProto = ''
  let backendHost = ''
  try {
    const headers = e.requestInfo().headers || {}
    backendProto = (headers['x_forwarded_proto'] || 'https').trim()
    backendHost = (headers['x_forwarded_host'] || headers['host'] || '').trim()
  } catch (_) {}

  if (!backendHost) {
    try {
      backendHost = (e.request.host || '').trim()
    } catch (_) {}
  }

  // X-Forwarded-Host pode vir como lista: fica com o primeiro (host público original)
  if (backendHost.indexOf(',') !== -1) {
    backendHost = backendHost.split(',')[0].trim()
  }
  if (backendHost.endsWith('/')) {
    backendHost = backendHost.slice(0, -1)
  }

  if (backendHost) {
    backendBase = backendProto + '://' + backendHost
  } else {
    // Sem host na requisição (não deveria ocorrer em rota HTTP): usa a env normalizada.
    backendBase = ($os.getenv('PB_INSTANCE_URL') || '').trim()
    while (backendBase.endsWith('/')) {
      backendBase = backendBase.slice(0, -1)
    }
  }

  const redirectUri = backendBase + '/backend/v1/google/callback'
  console.log('[Google Callback] redirect_uri resolvida:', redirectUri)

  if (!clientId || !clientSecret) {
    console.log(
      '[Google Callback] Credenciais OAuth não configuradas no servidor (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)',
    )
    const friendlyMsg = translateGoogleError('missing_credentials', '')
    return e.redirect(302, targetRedirect + '&error=' + encodeURIComponent(friendlyMsg))
  }

  // Troca o code por access_token e refresh_token
  try {
    const tokenRes = $http.send({
      url: 'https://oauth2.googleapis.com/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        'code=' +
        encodeURIComponent(code) +
        '&client_id=' +
        encodeURIComponent(clientId) +
        '&client_secret=' +
        encodeURIComponent(clientSecret) +
        '&redirect_uri=' +
        encodeURIComponent(redirectUri) +
        '&grant_type=authorization_code',
      timeout: 15,
    })

    if (tokenRes.statusCode !== 200 || !tokenRes.json) {
      const errCode = (tokenRes.json && tokenRes.json.error) || ''
      const errDesc = (tokenRes.json && tokenRes.json.error_description) || ''
      const friendlyMsg = translateGoogleError(errCode || 'token_exchange_failed', errDesc)

      console.log('[Google Callback] Falha na troca de tokens com Google:', {
        statusCode: tokenRes.statusCode,
        error: errCode,
        error_description: errDesc,
        friendly: friendlyMsg,
      })
      return e.redirect(302, targetRedirect + '&error=' + encodeURIComponent(friendlyMsg))
    }

    console.log('[Google Callback] Sucesso na troca de tokens com Google (statusCode 200)')

    const accessToken = tokenRes.json.access_token || ''
    const refreshToken = tokenRes.json.refresh_token || ''
    const expiresIn = tokenRes.json.expires_in || 3600
    const expiryDate = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Buscar perfil da conta Google para pegar o e-mail
    let googleEmail = ''
    if (accessToken) {
      try {
        const profileRes = $http.send({
          url: 'https://www.googleapis.com/oauth2/v2/userinfo',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + accessToken },
          timeout: 10,
        })
        if (profileRes.statusCode === 200 && profileRes.json && profileRes.json.email) {
          googleEmail = profileRes.json.email
        }
      } catch (_) {}
    }

    // Se não temos userId pelo state, tenta associar ao primeiro admin existente
    if (!userId) {
      try {
        const adminUser = $app.findFirstRecordByData('users', 'role', 'admin')
        if (adminUser) {
          userId = adminUser.id
          console.log('[Google Callback] UserId identificado via fallback admin:', userId)
        }
      } catch (_) {}
    } else {
      console.log('[Google Callback] UserId identificado via state:', userId)
    }

    if (!userId) {
      console.log('[Google Callback] Usuário não identificado (sem state e sem admin fallback)')
      const friendlyMsg = translateGoogleError('user_not_identified', '')
      return e.redirect(302, targetRedirect + '&error=' + encodeURIComponent(friendlyMsg))
    }

    // Upsert na coleção google_calendar_config
    let configRec = null
    try {
      configRec = $app.findFirstRecordByData('google_calendar_config', 'user', userId)
    } catch (_) {}

    if (!configRec) {
      const col = $app.findCollectionByNameOrId('google_calendar_config')
      configRec = new Record(col)
      configRec.set('user', userId)
    }

    configRec.set('email_conectado', googleEmail)
    configRec.set('access_token', accessToken)
    if (refreshToken) {
      configRec.set('refresh_token', refreshToken)
    }
    configRec.set('token_expiry', expiryDate)
    configRec.set('calendar_id', 'primary')
    configRec.set('sync_ativo', true)
    configRec.set('last_error', '')
    $app.save(configRec)

    console.log('[Google Callback] Configuração salva com sucesso:', {
      userId: userId,
      email: googleEmail,
      hasRefreshToken: !!refreshToken,
    })

    return e.redirect(302, targetRedirect + '&success=1')
  } catch (err) {
    console.log('[Google Callback] Exceção capturada durante fluxo de callback:', err)
    return e.redirect(
      302,
      targetRedirect +
        '&error=' +
        encodeURIComponent('Erro no servidor ao processar autorização: ' + err),
    )
  }
})
