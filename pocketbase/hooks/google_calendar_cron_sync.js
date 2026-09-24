cronAdd('google_calendar_cron_sync', '0 * * * *', () => {
  const clientId = $os.getenv('GOOGLE_CLIENT_ID') || ''
  const clientSecret = $os.getenv('GOOGLE_CLIENT_SECRET') || ''

  if (!clientId || !clientSecret) {
    return
  }

  let configs = []
  try {
    configs = $app.findRecordsByFilter(
      'google_calendar_config',
      "sync_ativo = true && refresh_token != ''",
      '-created',
      100,
      0,
    )
  } catch (_) {
    return
  }

  if (configs.length === 0) return

  const nowIso = new Date().toISOString()

  for (let c = 0; c < configs.length; c++) {
    const configRec = configs[c]
    const refreshToken = configRec.getString('refresh_token')
    if (!refreshToken) continue

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
          $app.save(configRec)
        } else {
          continue
        }
      } catch (_) {
        continue
      }
    }

    const calendarId = configRec.getString('calendar_id') || 'primary'

    // Importar eventos do Google Calendar
    try {
      const timeMin = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
      const timeMax = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString()

      const eventsRes = $http.send({
        url:
          'https://www.googleapis.com/calendar/v3/calendars/' +
          encodeURIComponent(calendarId) +
          '/events?timeMin=' +
          encodeURIComponent(timeMin) +
          '&timeMax=' +
          encodeURIComponent(timeMax) +
          '&singleEvents=true&maxResults=100',
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
            newEv.set('contexto_tipo', 'pessoal')
            newEv.set('status', 'ativo')
            newEv.set('origem', 'google')
            newEv.set('google_event_id', gId)
            newEv.set('recorrencia', 'nenhuma')
            $app.save(newEv)
          } else if (existingRec.getString('origem') === 'google') {
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
    } catch (_) {}

    // Exportar eventos locais novos
    try {
      const localEvents = $app.findRecordsByFilter(
        'agenda_eventos',
        "origem = 'sistema' && status = 'ativo' && google_event_id = ''",
        '-created',
        30,
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
            ? { date: dtInicio.split('T')[0] }
            : { dateTime: dtInicio, timeZone: 'America/Sao_Paulo' },
          end: isDiaInteiro
            ? { date: dtFim.split('T')[0] }
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
        }
      }
    } catch (_) {}

    try {
      configRec.set('last_sync_at', nowIso)
      $app.save(configRec)
    } catch (_) {}
  }
})
