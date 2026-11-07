// googleAgendaSync.js — lógica compartilhada da sincronização Google Calendar → agenda_eventos.
// Carregado nos hooks do PocketBase via require(`${__hooks}/googleAgendaSync.js`) e nos
// testes do Node (vitest). SEM dependência de globais do JSVM ($app, $http): toda
// interação com o PocketBase entra por injeção (adapters), permitindo testes unitários.
//
// Regras gravadas (0.0.296):
// 1. Deleção lá = deleção aqui: evento com status "cancelled" na API OU ausente na
//    janela sincronizada é REMOVIDO do banco; compromissos manuais (origem 'sistema',
//    sem google_event_id) NUNCA são removidos pelo sync.
// 2. Evento all-day do Google é gravado no DIA correto no fuso America/Sao_Paulo:
//    data_inicio = a meia-noite do dia NO FUSO convertido para UTC (03:00Z em horário
//    padrão), e não 00:00:00.000Z (que a leitura em São Paulo desloca 1 dia para trás).
// 3. O fim de um all-day é o fim do ÚLTIMO dia do intervalo (Google envia end.date
//    exclusivo); dia_inteiro=true.

'use strict'

// Datas do Google que já são "plain" (YYYY-MM-DD, sem hora e sem fuso) caem 12:00 UTC
// do mesmo dia: leitura em qualquer fuso ocidental (inclusive America/Sao_Paulo) devolve
// o mesmo dia, sem deslocamento de 1 dia para trás nem para frente.
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

// A instância de série recorrente (google_event_id com sufixo _YYYYMMDD ou _YYYYMMDDTHHMMSSZ)
// herda a janela da ocorrência: a API com singleEvents=true lista apenas instâncias dentro
// de [timeMin, timeMax], e o corte correto da instância é pela SUA data de início.
function instanciaNaJanela(googleEventId, timeMinIso, timeMaxIso) {
  var m = /_(\d{8}(?:T\d{6}Z)?)$/.exec(googleEventId || '')
  if (!m) return true // série/pontual: vale a regra geral (data_inicio dentro da janela)
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

// Decide se uma instância de série recorrente (id com sufixo _YYYYMMDD[T...Z]) é a
// OMISSÃO de uma ocorrência cancelada no Google: séries expandidas com singleEvents=true
// NÃO trazem as instâncias canceladas. A instância do banco cuja data cai fora da
// janela da API é exatamente a que o Google não listou — ou seja, cancelada.
function instanciaCanceladaNaSerie(googleEventId, dataInicioIso, timeMinIso, timeMaxIso) {
  if (!/_(\d{8}(?:T\d{6}Z)?)$/.test(googleEventId || '')) return false
  return !instanciaNaJanela(googleEventId, timeMinIso, timeMaxIso)
}

// A regra vigente para a deleção: "deleção lá = deleção aqui".
//
// alvo = um registro de agenda_eventos com google_event_id (origem 'google' ou um
// 'sistema' que foi exportado). A função decide se ele deve ser REMOVIDO do banco,
// dado o conjunto de ids de eventos VÁLIDOS (não cancelled) que a API do Google
// retornou na janela sincronizada.
//
// alvo: { google_event_id, origem?, data_inicio? }
// idsVivos: array de google_event_id vindos da API (já sem os status 'cancelled')
// janela: { timeMin, timeMax } ISO da consulta à API
//
// Retorna true quando o registro deve ser removido:
//  a) o id não veio na resposta da API, OU
//  b) é instância de série recorrente cuja data está FORA da janela da API — para
//     séries expandidas (singleEvents=true), o Google não traz instâncias canceladas
//     nem ocorrências fora da janela; a ausência na janela é a deleção lá.
function deveRemover(alvo, idsVivos, janela) {
  if (!alvo || !alvo.google_event_id) return false // manual puro: nunca removido
  var vivos = {}
  for (var i = 0; i < idsVivos.length; i++) vivos[idsVivos[i]] = true
  if (vivos[alvo.google_event_id]) return false

  // Instância de série recorrente: a API só traz as instâncias DENTRO da janela.
  // Se a data da instância gravada está fora da janela, ela não veio porque está
  // fora — não porque foi cancelada. NÃO remove (a janela do sync cobre o passado).
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
// via adapters (injetados). Retorna contadores para o toast (imported/exported/removidos).
//
// adapters = {
//   buscarPorGoogleId(gId) -> record | null
//   criar(campos) -> record (já com origem 'google', google_event_id etc.)
//   atualizar(record, campos)
//   salvar(record)
//   remover(record)
//   listarVinculados() -> registros com google_event_id != '' (para limpeza)
// }
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

module.exports = {
  googleDataParaIso: googleDataParaIso,
  googleFimParaIso: googleFimParaIso,
  instanciaNaJanela: instanciaNaJanela,
  instanciaCanceladaNaSerie: instanciaCanceladaNaSerie,
  deveRemover: deveRemover,
  camposDoEventoGoogle: camposDoEventoGoogle,
  aplicarSync: aplicarSync,
}
