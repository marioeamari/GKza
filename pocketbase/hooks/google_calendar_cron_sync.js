cronAdd('google_calendar_cron_sync', '0 * * * *', () => {
  const clientId = $os.getenv('GOOGLE_CLIENT_ID')
  const clientSecret = $os.getenv('GOOGLE_CLIENT_SECRET')

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

  const syncLib = require(`${__hooks}/googleAgendaSync.js`)
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
          configRec.set('last_error', '')
          $app.save(configRec)
        } else {
          const errDetail =
            (refreshRes.json && (refreshRes.json.error_description || refreshRes.json.error)) ||
            'Falha ao renovar token'
          const errDescLower = (errDetail + '').toLowerCase()
          configRec.set('last_error', errDetail)
          if (
            errDescLower.includes('expired') ||
            errDescLower.includes('revoked') ||
            errDescLower.includes('invalid_grant')
          ) {
            configRec.set('access_token', '')
            configRec.set('sync_ativo', false)
          }
          $app.save(configRec)
          continue
        }
      } catch (_) {
        continue
      }
    }

    const calendarId = configRec.getString('calendar_id') || 'primary'

    // Importar + limpar: upsert dos eventos válidos e REMOÇÃO dos que deixaram de
    // existir no Google (status 'cancelled' ou ausentes na janela sincronizada).
    // Compromissos manuais (sem google_event_id) nunca são removidos.
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
        const agendaCol = $app.findCollectionByNameOrId('agenda_eventos')

        const adapters = {
          buscarPorGoogleId: (gId) => {
            try {
              return $app.findFirstRecordByData('agenda_eventos', 'google_event_id', gId)
            } catch (_) {
              return null
            }
          },
          criar: (campos, gId) => {
            const newEv = new Record(agendaCol)
            newEv.set('titulo', campos.titulo)
            newEv.set('descricao', campos.descricao)
            newEv.set('local', campos.local)
            newEv.set('data_inicio', campos.data_inicio)
            if (campos.data_fim) newEv.set('data_fim', campos.data_fim)
            newEv.set('dia_inteiro', campos.dia_inteiro)
            newEv.set('contexto_tipo', 'pessoal')
            newEv.set('status', 'ativo')
            newEv.set('origem', 'google')
            newEv.set('google_event_id', gId)
            newEv.set('recorrencia', 'nenhuma')
            $app.save(newEv)
          },
          atualizar: (rec, campos) => {
            rec.set('titulo', campos.titulo)
            rec.set('descricao', campos.descricao)
            rec.set('local', campos.local)
            rec.set('data_inicio', campos.data_inicio)
            if (campos.data_fim) rec.set('data_fim', campos.data_fim)
            rec.set('dia_inteiro', campos.dia_inteiro)
          },
          salvar: (rec) => $app.save(rec),
          remover: (rec) => $app.delete(rec),
          // Candidatos à limpeza: tudo que tem id do Google e cuja data cai na janela
          // sincronizada (com folga de 7 dias). Eventos fora da janela não são julgados.
          listarVinculados: () => {
            const limMin = new Date(new Date(timeMin).getTime() - 7 * 24 * 3600 * 1000)
              .toISOString()
              .replace('T', ' ')
            const limMax = new Date(new Date(timeMax).getTime() + 7 * 24 * 3600 * 1000)
              .toISOString()
              .replace('T', ' ')
            return $app.findRecordsByFilter(
              'agenda_eventos',
              "google_event_id != '' && data_inicio >= '" +
                limMin +
                "' && data_inicio <= '" +
                limMax +
                "'",
              '-created',
              500,
              0,
            )
          },
        }

        syncLib.aplicarSync(eventsRes.json.items, adapters, {
          timeMin: timeMin,
          timeMax: timeMax,
        })
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
        }
      }
    } catch (_) {}

    try {
      configRec.set('last_sync_at', nowIso)
      $app.save(configRec)
    } catch (_) {}
  }
})
