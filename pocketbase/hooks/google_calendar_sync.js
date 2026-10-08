routerAdd(
  'POST',
  '/backend/v1/google/sync',
  (e) => {
    const auth = e.auth
    if (!auth || !auth.id) {
      return e.json(401, { error: 'Não autenticado' })
    }

    const clientId =
      $os.getenv('GOOGLE_CLIENT_ID') ||
      '788252458556-ri5fjf39bvn9p96m4akiipk24lbt90hf.apps.googleusercontent.com'
    const clientSecret = $os.getenv('GOOGLE_CLIENT_SECRET') || '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'

    if (!clientId || !clientSecret) {
      return e.json(400, {
        error: 'Credenciais OAuth do Google Calendar não configuradas no servidor.',
        configured: false,
      })
    }

    let configRec = null
    try {
      configRec = $app.findFirstRecordByData('google_calendar_config', 'user', auth.id)
    } catch (_) {
      return e.json(400, {
        error:
          'Conta Google não conectada para este usuário. Conecte em Configurações → Google Calendar → Conectar com Google Calendar.',
      })
    }

    const refreshToken = configRec.getString('refresh_token')
    if (!refreshToken) {
      return e.json(400, {
        error: 'Refresh token inexistente. Por favor, conecte novamente sua conta Google.',
      })
    }

    // 1. Obter access token válido usando refresh_token
    let accessToken = configRec.getString('access_token')
    const tokenExpiry = configRec.getString('token_expiry')
    const isExpired = !tokenExpiry || new Date(tokenExpiry).getTime() <= Date.now() + 60000

    if (isExpired || !accessToken) {
      try {
        const refreshRes = $http.send({
          url: 'https://oauth2.googleapis.com/token',
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:
            'client_id=' +
            encodeURIComponent(clientId) +
            '&client_secret=' +
            encodeURIComponent(clientSecret) +
            '&refresh_token=' +
            encodeURIComponent(refreshToken) +
            '&grant_type=refresh_token',
          timeout: 15,
        })

        if (refreshRes.statusCode === 200 && refreshRes.json && refreshRes.json.access_token) {
          accessToken = refreshRes.json.access_token
          const expiresIn = refreshRes.json.expires_in || 3600
          configRec.set('access_token', accessToken)
          configRec.set('token_expiry', new Date(Date.now() + expiresIn * 1000).toISOString())
          configRec.set('last_error', '')
          $app.save(configRec)
        } else {
          const errDetail =
            (refreshRes.json && (refreshRes.json.error_description || refreshRes.json.error)) ||
            'Falha ao renovar token'
          const errDescLower = (errDetail + '').toLowerCase()
          const isRevokedOrExpired =
            errDescLower.includes('expired') ||
            errDescLower.includes('revoked') ||
            errDescLower.includes('invalid_grant')

          configRec.set('last_error', errDetail)
          if (isRevokedOrExpired) {
            configRec.set('access_token', '')
            // Desativa temporariamente sync automático até nova autorização
            configRec.set('sync_ativo', false)
          }
          $app.save(configRec)

          if (isRevokedOrExpired) {
            return e.json(401, {
              error:
                'A conexão com o Google expirou. Reconecte sua conta Google para voltar a sincronizar.',
              code: 'google_token_expired',
              needs_reconnect: true,
              detail: errDetail,
            })
          }

          return e.json(400, {
            error: 'Erro ao renovar token Google: ' + errDetail,
            code: 'google_token_refresh_failed',
            needs_reconnect: false,
            detail: errDetail,
          })
        }
      } catch (err) {
        const errMsg = '' + err
        configRec.set('last_error', errMsg)
        $app.save(configRec)
        return e.json(502, {
          error: 'Falha de comunicação temporária com o serviço do Google: ' + errMsg,
          code: 'google_network_error',
        })
      }
    }

    const calendarId = configRec.getString('calendar_id') || 'primary'
    const nowIso = new Date().toISOString()
    let importedCount = 0
    let exportedCount = 0

    // 2. IMPORTAR eventos do Google Calendar para o ERP GKza (prevenindo duplicatas por google_event_id)
    try {
      // Buscar eventos a partir de 30 dias atrás até 90 dias à frente
      const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      const timeMax = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()

      const eventsRes = $http.send({
        url:
          'https://www.googleapis.com/calendar/v3/calendars/' +
          encodeURIComponent(calendarId) +
          '/events?timeMin=' +
          encodeURIComponent(timeMin) +
          '&timeMax=' +
          encodeURIComponent(timeMax) +
          '&singleEvents=true&maxResults=250',
        method: 'GET',
        headers: { Authorization: 'Bearer ' + accessToken },
        timeout: 20,
      })

      if (eventsRes.statusCode === 200 && eventsRes.json && eventsRes.json.items) {
        const items = eventsRes.json.items
        const agendaCol = $app.findCollectionByNameOrId('agenda_eventos')

        for (let i = 0; i < items.length; i++) {
          const gEv = items[i]
          if (gEv.status === 'cancelled') continue

          const gId = gEv.id
          if (!gId) continue

          // Verifica se já existe por google_event_id
          let existingRec = null
          try {
            existingRec = $app.findFirstRecordByData('agenda_eventos', 'google_event_id', gId)
          } catch (_) {}

          const titulo = gEv.summary || '(Sem título)'
          const descricao = gEv.description || ''
          const local = gEv.location || ''

          let dataInicio = ''
          let dataFim = ''
          let diaInteiro = false

          if (gEv.start && gEv.start.dateTime) {
            dataInicio = new Date(gEv.start.dateTime).toISOString()
          } else if (gEv.start && gEv.start.date) {
            dataInicio = new Date(gEv.start.date + 'T00:00:00.000Z').toISOString()
            diaInteiro = true
          }

          if (gEv.end && gEv.end.dateTime) {
            dataFim = new Date(gEv.end.dateTime).toISOString()
          } else if (gEv.end && gEv.end.date) {
            dataFim = new Date(gEv.end.date + 'T23:59:59.000Z').toISOString()
          }

          if (!dataInicio) continue

          if (!existingRec) {
            const newEv = new Record(agendaCol)
            newEv.set('titulo', titulo)
            newEv.set('descricao', descricao)
            newEv.set('local', local)
            newEv.set('data_inicio', dataInicio)
            if (dataFim) newEv.set('data_fim', dataFim)
            newEv.set('dia_inteiro', diaInteiro)
            newEv.set('contexto_tipo', 'pessoal') // padrão seguro
            newEv.set('status', 'ativo')
            newEv.set('origem', 'google')
            newEv.set('google_event_id', gId)
            newEv.set('recorrencia', 'nenhuma')
            $app.save(newEv)
            importedCount++
          } else if (existingRec.getString('origem') === 'google') {
            // Atualizar dados se foram modificados no Google
            existingRec.set('titulo', titulo)
            existingRec.set('descricao', descricao)
            existingRec.set('local', local)
            existingRec.set('data_inicio', dataInicio)
            if (dataFim) existingRec.set('data_fim', dataFim)
            existingRec.set('dia_inteiro', diaInteiro)
            $app.save(existingRec)
          }
        }
      }
    } catch (importErr) {
      // Registrar falha parcial
      configRec.set('last_error', 'Falha parcial no import: ' + importErr)
    }

    // 3. EXPORTAR eventos criados no sistema que ainda não possuem google_event_id
    try {
      const localEvents = $app.findRecordsByFilter(
        'agenda_eventos',
        "origem = 'sistema' && status = 'ativo' && google_event_id = ''",
        '-created',
        50,
        0,
      )

      for (let j = 0; j < localEvents.length; j++) {
        const lEv = localEvents[j]
        const dtInicio = lEv.getString('data_inicio')
        if (!dtInicio) continue

        const dtFim =
          lEv.getString('data_fim') ||
          new Date(new Date(dtInicio).getTime() + 3600000).toISOString()
        const isDiaInteiro = lEv.getBool('dia_inteiro')

        const postBody = {
          summary: lEv.getString('titulo') || 'Compromisso ERP GKza',
          description: lEv.getString('descricao') || '',
          location: lEv.getString('local') || '',
          start: isDiaInteiro
            ? { date: dtInicio.slice(0, 10) }
            : { dateTime: dtInicio, timeZone: 'America/Sao_Paulo' },
          end: isDiaInteiro
            ? { date: dtFim.slice(0, 10) }
            : { dateTime: dtFim, timeZone: 'America/Sao_Paulo' },
        }

        const createRes = $http.send({
          url:
            'https://www.googleapis.com/calendar/v3/calendars/' +
            encodeURIComponent(calendarId) +
            '/events',
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(postBody),
          timeout: 15,
        })

        if (createRes.statusCode === 200 && createRes.json && createRes.json.id) {
          lEv.set('google_event_id', createRes.json.id)
          $app.save(lEv)
          exportedCount++
        }
      }
    } catch (exportErr) {
      configRec.set('last_error', 'Falha parcial no export: ' + exportErr)
    }

    configRec.set('last_sync_at', nowIso)
    if (!configRec.getString('last_error')) {
      configRec.set('last_error', '')
    }
    $app.save(configRec)

    return e.json(200, {
      success: true,
      imported: importedCount,
      exported: exportedCount,
      last_sync_at: nowIso,
    })
  },
  $apis.requireAuth(),
)
