// google_calendar_cron_sync.js — cron horário de sincronização Google Calendar → agenda_eventos.
//
// AUTOSSUFICIENTE: lógica espelhada de pocketbase/hooks/googleAgendaSync.js
// (testes: src/lib/googleAgendaSync.test.ts) — manter em sync (v0.0.297).
// O require(`${__hooks}/googleAgendaSync.js`) foi ELIMINADO: o JSVM (goja) desta
// instância recusa o módulo externo ("Invalid module") e NÃO compartilha
// declarações de topo com o pool dos callbacks — então TODA a lib vive DENTRO
// do corpo do callback do cron, onde é visível em tempo de execução.
//
// Regras gravadas (0.0.296, mantidas):
// 1. Deleção lá = deleção aqui: evento com status "cancelled" na API OU ausente na
//    janela sincronizada é REMOVIDO do banco; compromissos manuais (origem 'sistema',
//    sem google_event_id) NUNCA são removidos pelo sync.
// 2. Evento all-day do Google é gravado no DIA correto no fuso America/Sao_Paulo:
//    data_inicio = meio-dia UTC do dia; o fim é o último ms do último dia
//    (end.date do Google é exclusivo).
'use strict'

cronAdd('google_calendar_cron_sync', '0 * * * *', () => {
  // -----------------------------------------------------------------------
  // INÍCIO DA LIB INLINE (espelho de googleAgendaSync.js — manter em sync v0.0.297)
  // Declarações DENTRO do callback: o JSVM executa callbacks em pool separado.
  // -----------------------------------------------------------------------

  // Datas "plain" (YYYY-MM-DD) do Google caem no meio-dia UTC do dia: leitura
  // em qualquer fuso ocidental (inclusive America/Sao_Paulo) devolve o mesmo dia.
  var MEIO_DIA_UTC_MS = 12 * 3600 * 1000

  // Converte uma data/hora do Google em ISO UTC para gravar no banco.
  function googleDataParaIso(start) {
    if (!start) return ''
    if (start.dateTime) {
      var d = new Date(start.dateTime)
      return isNaN(d.getTime()) ? '' : d.toISOString()
    }
    if (start.date) {
      // All-day: '2026-11-27' → 2026-11-27T12:00:00.000Z (meio-dia UTC = 09:00 em SP)
      var d2 = new Date(start.date + 'T12:00:00.000Z')
      return isNaN(d2.getTime()) ? '' : d2.toISOString()
    }
    return ''
  }

  // Fim de um evento a partir de end (dateTime OU date exclusivo do Google).
  function googleFimParaIso(end, dataInicioIso) {
    if (!end) return ''
    if (end.dateTime) {
      var d = new Date(end.dateTime)
      return isNaN(d.getTime()) ? '' : d.toISOString()
    }
    if (end.date) {
      // end.date é EXCLUSIVO para all-day: 2026-11-28 = evento só no dia 27.
      // Grava o fim como o último ms do dia anterior (23:59:59.999Z) — sem estourar
      // no dia seguinte em São Paulo (fuso UTC-3).
      var diaFim = end.date.slice(0, 10) + 'T00:00:00.000Z'
      var d2 = new Date(diaFim)
      if (isNaN(d2.getTime())) return ''
      var fimMs = d2.getTime() - 1 // último milissegundo do dia anterior (UTC)
      if (dataInicioIso) {
        var ini = new Date(dataInicioIso).getTime()
        if (!isNaN(ini) && fimMs <= ini) {
          // All-day de 1 único dia: o fim não pode ficar antes do início.
          fimMs = ini + MEIO_DIA_UTC_MS - 1
        }
      }
      return new Date(fimMs).toISOString()
    }
    return ''
  }

  // A instância de série recorrente (google_event_id com sufixo _YYYYMMDD ou
  // _YYYYMMDDTHHMMSSZ) herda a janela da ocorrência: a API com singleEvents=true
  // lista apenas instâncias dentro de [timeMin, timeMax], e o corte correto da
  // instância é pela SUA data de início.
  function instanciaNaJanela(googleEventId, timeMinIso, timeMaxIso) {
    var m = /_(\d{8}(?:T\d{6}Z)?)$/.exec(googleEventId || '')
    if (!m) return true // série/pontual: vale a regra geral
    var sufixo = m[1]
    var iso = ''
    if (sufixo.length === 8) {
      iso =
        sufixo.slice(0, 4) + '-' + sufixo.slice(4, 6) + '-' + sufixo.slice(6, 8) + 'T12:00:00.000Z'
    } else {
      iso =
        sufixo.slice(0, 4) +
        '-' +
        sufixo.slice(4, 6) +
        '-' +
        sufixo.slice(6, 8) +
        'T' +
        sufixo.slice(9, 11) +
        ':' +
        sufixo.slice(11, 13) +
        ':' +
        sufixo.slice(13, 15) +
        '.000Z'
    }
    var t = new Date(iso).getTime()
    if (isNaN(t)) return true
    return t >= new Date(timeMinIso).getTime() && t <= new Date(timeMaxIso).getTime()
  }

  // Instância de série recorrente cuja data cai FORA da janela da API: para
  // séries expandidas (singleEvents=true), o Google não traz instâncias
  // canceladas nem ocorrências fora da janela.
  function instanciaCanceladaNaSerie(googleEventId, dataInicioIso, timeMinIso, timeMaxIso) {
    if (!/_(\d{8}(?:T\d{6}Z)?)$/.test(googleEventId || '')) return false
    return !instanciaNaJanela(googleEventId, timeMinIso, timeMaxIso)
  }

  // "Deleção lá = deleção aqui": retorna true quando o registro com google_event_id
  // deve ser REMOVIDO do banco, dado o conjunto de ids VÁLIDOS (não cancelled) que a
  // API do Google retornou na janela sincronizada. Manuais (sem google_event_id) nunca.
  function deveRemover(alvo, idsVivos, janela) {
    if (!alvo || !alvo.google_event_id) return false // manual puro: nunca removido
    var vivos = {}
    for (var i = 0; i < idsVivos.length; i++) vivos[idsVivos[i]] = true
    if (vivos[alvo.google_event_id]) return false

    // Instância de série recorrente: a API só traz as instâncias DENTRO da janela.
    // Se a data da instância gravada está fora da janela, ela não veio porque está
    // fora — não porque foi cancelada. NÃO remove.
    var m = /_(\d{8}(?:T\d{6}Z)?)$/.exec(alvo.google_event_id)
    if (m && !instanciaNaJanela(alvo.google_event_id, janela.timeMin, janela.timeMax)) {
      return false
    }
    // Instância de série DENTRO da janela que não veio → cancelada no Google.
    // Evento pontual/série que não veio → excluído no Google.
    return true
  }

  // Converte um evento da API do Google em campos prontos para agenda_eventos.
  function camposDoEventoGoogle(gEv) {
    var dataInicio = googleDataParaIso(gEv.start)
    if (!dataInicio) return null
    var diaInteiro = !!(gEv.start && gEv.start.date && !gEv.start.dateTime)
    return {
      titulo: gEv.summary || '(Sem título)',
      descricao: gEv.description || '',
      local: gEv.location || '',
      data_inicio: dataInicio,
      data_fim: googleFimParaIso(gEv.end, dataInicio),
      dia_inteiro: diaInteiro,
    }
  }

  // Aplica o ciclo completo de IMPORTAÇÃO + LIMPEZA sobre a coleção agenda_eventos,
  // via adapters (injetados). Retorna contadores.
  function aplicarSync(items, adapters, janela) {
    var imported = 0
    var atualizados = 0
    var idsVivos = []
    var vistos = {}

    for (var i = 0; i < items.length; i++) {
      var gEv = items[i]
      var gId = gEv.id
      if (!gId) continue
      if (gEv.status === 'cancelled') continue // cancelados não entram nem atualizam

      var campos = camposDoEventoGoogle(gEv)
      if (!campos) continue

      idsVivos.push(gId)
      vistos[gId] = true

      var rec = null
      try {
        rec = adapters.buscarPorGoogleId(gId)
      } catch (_) {
        rec = null
      }

      if (!rec) {
        adapters.criar(campos, gId)
        imported++
      } else if (rec.getString('origem') === 'google') {
        adapters.atualizar(rec, campos)
        adapters.salvar(rec)
        atualizados++
      }
    }

    // LIMPEZA: todo registro com google_event_id que não veio na resposta da API
    // (ou veio cancelled) é removido. Manuais (sem google_event_id) nunca passam por aqui.
    var removidos = 0
    var vinculados = adapters.listarVinculados()
    for (var j = 0; j < vinculados.length; j++) {
      var alvo = vinculados[j]
      var gIdAlvo = alvo.getString('google_event_id')
      if (!gIdAlvo) continue
      if (deveRemover({ google_event_id: gIdAlvo }, idsVivos, janela)) {
        adapters.remover(alvo)
        removidos++
      }
    }

    return { imported: imported, atualizados: atualizados, removidos: removidos }
  }
  // -----------------------------------------------------------------------
  // FIM DA LIB INLINE
  // -----------------------------------------------------------------------

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

  console.log('google_calendar_cron_sync: lib inline carregada ok (v0.0.297)')
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
    // A lib de sync está INLINE neste callback (sem require) — ver topo do arquivo.
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

        const resumo = aplicarSync(eventsRes.json.items, adapters, {
          timeMin: timeMin,
          timeMax: timeMax,
        })
        console.log(
          'google_calendar_cron_sync: imported=' +
            resumo.imported +
            ' atualizados=' +
            resumo.atualizados +
            ' removidos=' +
            resumo.removidos,
        )
      }
    } catch (importErr) {
      console.error('google_calendar_cron_sync: falha parcial no import: ' + importErr)
    }

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
