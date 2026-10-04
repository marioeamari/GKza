/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Reparar ocorrências pagas de despesas NÃO-crédito onde o mês do pagamento é anterior ao mês do vencimento.
    // Regra de produto: para pagamentos imediatos (Pix, débito, boleto, transferência, dinheiro),
    // o vencimento nunca pode ser de mês posterior ao pagamento.
    // Quando o mês do pagamento (YYYY-MM) for anterior ao mês do vencimento, recalcula
    // a data_vencimento no mês do pagamento com o dia_vencimento do compromisso vinculado
    // (clamp ao último dia do mês).
    // NÃO toca em ocorrências de crédito (secao = 'cartoes_credito'), que seguem a fatura do cartão.
    // NÃO toca em competência, status, valores, data_pagamento, lançamentos.

    function diasNoMes(ano, mesZero) {
      return new Date(Date.UTC(ano, mesZero + 1, 0)).getUTCDate()
    }

    function calcularVencimentoIso(ano, mesZero, diaDesejado) {
      var maxDia = diasNoMes(ano, mesZero)
      var diaFinal = Math.min(Math.max(diaDesejado || 10, 1), maxDia)
      var mm = String(mesZero + 1).padStart(2, '0')
      var dd = String(diaFinal).padStart(2, '0')
      return ano + '-' + mm + '-' + dd + ' 12:00:00.000Z'
    }

    // Cache de dia_vencimento de compromissos para evitar queries redundantes
    var diaCompromissoCache = {}

    function obterDiaCompromisso(compromissoId) {
      if (!compromissoId) return 10
      if (diaCompromissoCache[compromissoId] !== undefined) {
        return diaCompromissoCache[compromissoId]
      }
      try {
        var compRecord = app.findRecordById('despesas_compromisso', compromissoId)
        var dia = compRecord ? compRecord.getInt('dia_vencimento') || 10 : 10
        diaCompromissoCache[compromissoId] = dia
        return dia
      } catch (e) {
        diaCompromissoCache[compromissoId] = 10
        return 10
      }
    }

    var ocorrencias = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "status = 'paga' && secao != 'cartoes_credito' && data_pagamento != '' && data_vencimento != ''",
      '-data_pagamento',
      500,
      0,
    )

    var totalCorrigidas = 0

    for (var i = 0; i < ocorrencias.length; i++) {
      var rec = ocorrencias[i]
      var dataPag = (rec.getString('data_pagamento') || '').trim()
      var dataVenc = (rec.getString('data_vencimento') || '').trim()

      if (!dataPag || !dataVenc) continue

      var mesPag = dataPag.slice(0, 7)
      var mesVenc = dataVenc.slice(0, 7)

      // Condição: mês do pagamento anterior ao mês do vencimento
      if (mesPag && mesVenc && mesPag < mesVenc) {
        var partesPag = mesPag.split('-')
        var pAno = parseInt(partesPag[0], 10)
        var pMesZero = parseInt(partesPag[1], 10) - 1

        var compId = rec.getString('compromisso')
        var diaComp = obterDiaCompromisso(compId)

        var novoVencIso = calcularVencimentoIso(pAno, pMesZero, diaComp)

        rec.set('data_vencimento', novoVencIso)
        app.save(rec)
        totalCorrigidas++
      }
    }

    console.log(
      '[0063_corrigir_vencimento_retroativo_nao_credito] Total corrigidas: ' + totalCorrigidas,
    )
  },
  (app) => {
    // Rollback não-destrutivo: a correção de data_vencimento de pagamentos retroativos é idempotente
    // e consistente com a regra de negócio.
  },
)
