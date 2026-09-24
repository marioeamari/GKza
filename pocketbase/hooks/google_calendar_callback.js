routerAdd('GET', '/backend/v1/google/callback', (e) => {
  const code = e.requestInfo().query.code
  const stateStr = e.requestInfo().query.state
  const error = e.requestInfo().query.error

  const siteUrl =
    $os.getenv('SITE_URL') || 'https://gestao-financeira-e-marketplaces-d7ede.goskip.app'

  const targetRedirect = siteUrl + '/configuracoes?google_calendar=status'

  if (error) {
    return e.redirect(302, targetRedirect + '&error=' + encodeURIComponent(error))
  }

  if (!code) {
    return e.redirect(302, targetRedirect + '&error=no_code')
  }

  const clientId =
    $os.getenv('GOOGLE_CLIENT_ID') ||
    '788252458556-ri5fjf39bvn9p96m4akiipk24lbt90hf.apps.googleusercontent.com'
  const clientSecret = $os.getenv('GOOGLE_CLIENT_SECRET') || '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'
  const instanceUrl =
    $os.getenv('PB_INSTANCE_URL') ||
    'https://gestao-financeira-e-marketplaces-d7ede.shrd00.internal.goskip.dev'
  const redirectUri = instanceUrl + '/backend/v1/google/callback'

  if (!clientId || !clientSecret) {
    return e.redirect(302, targetRedirect + '&error=missing_credentials')
  }

  let userId = ''
  try {
    if (stateStr) {
      const parsed = JSON.parse(decodeURIComponent(stateStr))
      userId = parsed.userId || ''
    }
  } catch (_) {}

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
      const errMsg = (tokenRes.json && tokenRes.json.error_description) || 'Falha ao obter tokens'
      return e.redirect(302, targetRedirect + '&error=' + encodeURIComponent(errMsg))
    }

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
        if (adminUser) userId = adminUser.id
      } catch (_) {}
    }

    if (!userId) {
      return e.redirect(302, targetRedirect + '&error=user_not_identified')
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

    return e.redirect(302, targetRedirect + '&success=1')
  } catch (err) {
    return e.redirect(302, targetRedirect + '&error=' + encodeURIComponent('' + err))
  }
})
