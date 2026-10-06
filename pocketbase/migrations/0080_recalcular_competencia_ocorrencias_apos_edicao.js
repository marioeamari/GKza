/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Helper: formata Date como YYYY-MM-DD
    function toIsoDate(d) {
      var year = d.getFullYear()
      var month = String(d.getMonth() + 1).padStart(2, '0')
      var day = String(d.getDate()).padStart(2, '0')
      return year + '-' + month + '-' + day
    }

    function parseDateOnly(str) {
      if (!str) return null
      var raw = String(str).slice(0, 10)
      var parts = raw.split('-')
      if (parts.length !== 3) return null
      var y = parseInt(parts[0], 10)
      var m = parseInt(parts[1], 10) - 1
      var d = parseInt(parts[2], 10)
      if (isNaN(y) || isNaN(m) || isNaN(d)) return null
      return new Date(y, m, d)
    }

    function addMonths(compStr, months) {
      var parts = compStr.split('-')
      var y = parseInt(parts[0], 10)
      var m = parseInt(parts[1], 10) - 1 + months
      var d = new Date(y, m, 1)
      var ry = d.getFullYear()
      var rm = String(d.getMonth() + 1).padStart(2, '0')
      return ry + '-' + rm
    }

    function calcularFaturaCartaoLocal(diaFechamento, diaVencimento, dataIso) {
      var d = parseDateOnly(dataIso)
      if (!d) return null
      var ano = d.getFullYear()
      var mes = d.getMonth()
      var dia = d.getDate()

      var compAno = ano
      var compMes = mes
      if (dia > diaFechamento) {
        compMes += 1
        if (compMes > 11) {
          compAno += 1
          compMes = 0
        }
      }
      var competencia = compAno + '-' + String(compMes + 1).padStart(2, '0')

      var vencAno = compAno
      var vencMes = compMes
      if (diaVencimento < diaFechamento) {
        vencMes += 1
        if (vencMes > 11) {
          vencAno += 1
          vencMes = 0
        }
      }
      var lastDay = new Date(vencAno, vencMes + 1, 0).getDate()
      var vencDia = Math.min(diaVencimento, lastDay)
      var dataVencimento =
        vencAno +
        '-' +
        String(vencMes + 1).padStart(2, '0') +
        '-' +
        String(vencDia).padStart(2, '0')

      return { competencia: competencia, dataVencimento: dataVencimento }
    }

    function calcularCompetenciaEVencimentoLocal(
      dataCompraStr,
      conta,
      diaVencimentoFallback,
      numeroParcela,
      totalParcelas,
    ) {
      var dt = parseDateOnly(dataCompraStr) || new Date()
      var pNum = numeroParcela && numeroParcela > 0 ? numeroParcela : 1

      var isCartao =
        conta &&
        conta.get('tipo') === 'cartao' &&
        conta.get('dia_fechamento') &&
        conta.get('dia_vencimento')

      if (isCartao) {
        var df = conta.getInt('dia_fechamento')
        var dv = conta.getInt('dia_vencimento')
        var faturaP1 = calcularFaturaCartaoLocal(df, dv, toIsoDate(dt))
        var compBase = faturaP1.competencia
        var compParcela = pNum === 1 ? compBase : addMonths(compBase, pNum - 1)

        var parts = compParcela.split('-')
        var cAno = parseInt(parts[0], 10)
        var cMes = parseInt(parts[1], 10) - 1
        var vAno = cAno
        var vMes = cMes
        if (dv < df) {
          vMes += 1
          if (vMes > 11) {
            vAno += 1
            vMes = 0
          }
        }
        var lastDay = new Date(vAno, vMes + 1, 0).getDate()
        var realDay = Math.min(dv, lastDay)
        var vStr =
          vAno + '-' + String(vMes + 1).padStart(2, '0') + '-' + String(realDay).padStart(2, '0')

        return {
          competencia: compParcela,
          dataVencimento: vStr,
          dataVencimentoIso: vStr + ' 12:00:00.000Z',
        }
      }

      // Não-cartão: competência = mês da compra
      var anoCompra = dt.getFullYear()
      var mesCompra = dt.getMonth()
      var compBase = anoCompra + '-' + String(mesCompra + 1).padStart(2, '0')
      var compParcela = pNum === 1 ? compBase : addMonths(compBase, pNum - 1)

      var parts = compParcela.split('-')
      var targetAno = parseInt(parts[0], 10)
      var targetMes = parseInt(parts[1], 10) - 1
      var diaAlvo = diaVencimentoFallback || dt.getDate() || 10
      var lastDay = new Date(targetAno, targetMes + 1, 0).getDate()
      var finalDay = Math.min(diaAlvo, lastDay)
      var vStr =
        targetAno +
        '-' +
        String(targetMes + 1).padStart(2, '0') +
        '-' +
        String(finalDay).padStart(2, '0')

      return {
        competencia: compParcela,
        dataVencimento: vStr,
        dataVencimentoIso: vStr + ' 12:00:00.000Z',
      }
    }

    // 1. Correção ESPECÍFICA do caso confirmado "Carne" g4nyxs2v8v4i96g
    var compCarne = null
    try {
      compCarne = app.findRecordById('despesas_compromisso', 'g4nyxs2v8v4i96g')
    } catch (e) {
      compCarne = null
    }

    if (compCarne) {
      var dataInicio = compCarne.getString('data_inicio') || '2026-10-16'
      var dataCompraStr = dataInicio.slice(0, 10)

      var contaCarne = null
      var contaId = compCarne.getString('conta_padrao')
      if (contaId) {
        try {
          contaCarne = app.findRecordById('contas', contaId)
        } catch (e) {}
      }

      var ocorrenciasCarne = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = 'g4nyxs2v8v4i96g'",
        '-created',
        50,
        0,
      )

      for (var i = 0; i < ocorrenciasCarne.length; i++) {
        var oc = ocorrenciasCarne[i]
        var res = calcularCompetenciaEVencimentoLocal(
          dataCompraStr,
          contaCarne,
          compCarne.getInt('dia_vencimento'),
          oc.getInt('numero_parcela') || 1,
          compCarne.getInt('total_parcelas') || 1,
        )

        oc.set('competencia', res.competencia)
        oc.set('data_vencimento', res.dataVencimentoIso)
        app.save(oc)

        // Atualiza lançamento vinculado zytolsrk7f2nd5b se existir
        var lancId = oc.getString('lancamento')
        if (lancId) {
          try {
            var lanc = app.findRecordById('lancamentos', lancId)
            lanc.set('competencia', res.competencia)
            // Alinha data da transação do cartão para a data da compra atualizada
            lanc.set('data', dataCompraStr + ' 12:00:00.000Z')
            app.save(lanc)
          } catch (eLanc) {}
        }
      }
    }

    // 2. VARREDURA GERAL IDEMPOTENTE:
    // Para cada compromisso avulso ou parcelado que tenha conta tipo 'cartao' ou não-cartão,
    // realinhar ocorrências cujo cálculo divirja da data_inicio atual do compromisso.
    var compromissos = app.findRecordsByFilter(
      'despesas_compromisso',
      "regra_repeticao = 'avulso' || regra_repeticao = 'parcelado' || modalidade_parcelamento = 'parcelado'",
      '-created',
      500,
      0,
    )

    for (var c = 0; c < compromissos.length; c++) {
      var comp = compromissos[c]
      var dtInicio = comp.getString('data_inicio')
      if (!dtInicio) continue
      var dataCompra = dtInicio.slice(0, 10)

      var cId = comp.getString('conta_padrao')
      var contaComp = null
      if (cId) {
        try {
          contaComp = app.findRecordById('contas', cId)
        } catch (e) {}
      }

      var ocs = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = '" + comp.id + "'",
        '-created',
        100,
        0,
      )

      for (var o = 0; o < ocs.length; o++) {
        var ocorrencia = ocs[o]
        var numP = ocorrencia.getInt('numero_parcela') || 1
        var totalP = comp.getInt('total_parcelas') || 1

        var esperado = calcularCompetenciaEVencimentoLocal(
          dataCompra,
          contaComp,
          comp.getInt('dia_vencimento'),
          numP,
          totalP,
        )

        var mudou = false
        if (ocorrencia.getString('competencia') !== esperado.competencia) {
          ocorrencia.set('competencia', esperado.competencia)
          mudou = true
        }
        var curDue = (ocorrencia.getString('data_vencimento') || '').slice(0, 10)
        if (curDue !== esperado.dataVencimento) {
          ocorrencia.set('data_vencimento', esperado.dataVencimentoIso)
          mudou = true
        }
        if (mudou) {
          app.save(ocorrencia)
        }

        // Se o lançamento vinculado estiver desalinhado na competência
        var lId = ocorrencia.getString('lancamento')
        if (lId) {
          try {
            var lRecord = app.findRecordById('lancamentos', lId)
            var lMudou = false
            if (lRecord.getString('competencia') !== esperado.competencia) {
              lRecord.set('competencia', esperado.competencia)
              lMudou = true
            }
            if (contaComp && contaComp.get('tipo') === 'cartao') {
              var lDataStr = (lRecord.getString('data') || '').slice(0, 10)
              if (lDataStr !== dataCompra) {
                lRecord.set('data', dataCompra + ' 12:00:00.000Z')
                lMudou = true
              }
            }
            if (lMudou) {
              app.save(lRecord)
            }
          } catch (eL) {}
        }
      }
    }
  },
  (app) => {
    // Migração de correção de dados irreversível / idempotente
  },
)
