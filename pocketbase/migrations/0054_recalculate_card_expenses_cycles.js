migrate(
  (app) => {
    // Recalcular data_vencimento e competencia das ocorrencias com secao='cartoes_credito'
    // cujo vencimento diverge do ciclo do cartão de crédito correspondente.
    // Cartão identificado por:
    // 1. compromisso.conta_padrao (se for tipo 'cartao')
    // 2. compromisso.metodo_pagamento (se tiver conta_padrao tipo 'cartao')
    // 3. ocorrencia.conta (se for tipo 'cartao')

    function parseDateParts(dateStr) {
      if (!dateStr) {
        const now = new Date()
        return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() }
      }
      const clean = dateStr.slice(0, 10)
      const parts = clean.split('-')
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        const d = new Date(dateStr)
        return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
      }
      return { year, month, day }
    }

    function getDaysInMonth(year, month) {
      return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    }

    function formatYearMonth(year, month) {
      const normalized = new Date(Date.UTC(year, month, 1))
      const y = normalized.getUTCFullYear()
      const m = String(normalized.getUTCMonth() + 1).padStart(2, '0')
      return y + '-' + m
    }

    function calcularDataVencimentoNoMes(ano, mesZeroIndex, diaDesejado) {
      const ultimoDiaDoMes = new Date(Date.UTC(ano, mesZeroIndex + 1, 0)).getUTCDate()
      const diaReal = Math.min(diaDesejado, ultimoDiaDoMes)
      return new Date(Date.UTC(ano, mesZeroIndex, diaReal, 12, 0, 0))
    }

    function calcularFaturaCartao(diaFechamento, diaVencimento, dataTransacao) {
      const dFech = diaFechamento || 10
      const dVenc = diaVencimento || 20

      const parts = parseDateParts(dataTransacao)
      let fechamentoYear = parts.year
      let fechamentoMonth = parts.month

      if (parts.day > dFech) {
        fechamentoMonth += 1
      }

      const compStr = formatYearMonth(fechamentoYear, fechamentoMonth)
      const fParts = compStr.split('-')
      const fYear = parseInt(fParts[0], 10)
      const fMonth = parseInt(fParts[1], 10) - 1

      let vencYear = fYear
      let vencMonth = fMonth
      if (dVenc < dFech) {
        vencMonth += 1
      }
      const vencComp = formatYearMonth(vencYear, vencMonth)
      const vParts = vencComp.split('-')
      const vYear = parseInt(vParts[0], 10)
      const vMonth = parseInt(vParts[1], 10) - 1
      const maxDiasVenc = getDaysInMonth(vYear, vMonth)
      const realDiaVencimento = Math.min(dVenc, maxDiasVenc)
      const dataVencimento =
        vYear +
        '-' +
        String(vMonth + 1).padStart(2, '0') +
        '-' +
        String(realDiaVencimento).padStart(2, '0')

      return {
        competencia: compStr,
        dataVencimento: dataVencimento,
      }
    }

    const cartaoCache = {}
    function getContaCartao(contaId) {
      if (!contaId) return null
      if (cartaoCache[contaId] !== undefined) return cartaoCache[contaId]
      try {
        const c = app.findFirstRecordByData('contas', 'id', contaId)
        if (c.getString('tipo') === 'cartao') {
          cartaoCache[contaId] = {
            id: c.id,
            dia_fechamento: c.getInt('dia_fechamento') || 10,
            dia_vencimento: c.getInt('dia_vencimento') || 20,
          }
          return cartaoCache[contaId]
        }
      } catch (_) {}
      cartaoCache[contaId] = null
      return null
    }

    const metodoCache = {}
    function getContaFromMetodo(metodoId) {
      if (!metodoId) return null
      if (metodoCache[metodoId] !== undefined) return metodoCache[metodoId]
      try {
        const mp = app.findFirstRecordByData('metodos_pagamento', 'id', metodoId)
        const cpId = mp.getString('conta_padrao')
        if (cpId) {
          const c = getContaCartao(cpId)
          metodoCache[metodoId] = c
          return c
        }
      } catch (_) {}
      metodoCache[metodoId] = null
      return null
    }

    // Busca ocorrências de cartões de crédito
    const ocorrencias = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "secao = 'cartoes_credito'",
      'created',
      500,
      0,
    )

    let alteradas = 0

    for (let i = 0; i < ocorrencias.length; i++) {
      const oc = ocorrencias[i]
      const compId = oc.getString('compromisso')
      let comp = null
      if (compId) {
        try {
          comp = app.findFirstRecordByData('despesas_compromisso', 'id', compId)
        } catch (_) {}
      }

      // Descobrir a conta do cartão
      let cartao = null
      if (comp) {
        const contaComp = comp.getString('conta_padrao')
        if (contaComp) {
          cartao = getContaCartao(contaComp)
        }
        if (!cartao) {
          const metComp = comp.getString('metodo_pagamento')
          if (metComp) {
            cartao = getContaFromMetodo(metComp)
          }
        }
      }
      if (!cartao) {
        const ocConta = oc.getString('conta')
        if (ocConta) {
          cartao = getContaCartao(ocConta)
        }
      }

      if (!cartao) {
        continue
      }

      // Determinar data base da compra/compromisso
      let dataBaseStr = ''
      if (comp) {
        const di = comp.getString('data_inicio')
        if (di && di.length >= 10) {
          dataBaseStr = di.slice(0, 10)
        }
      }
      if (!dataBaseStr) {
        const ocDv = oc.getString('data_vencimento')
        if (ocDv && ocDv.length >= 10) {
          dataBaseStr = ocDv.slice(0, 10)
        } else {
          const cr = oc.getString('created')
          dataBaseStr = cr && cr.length >= 10 ? cr.slice(0, 10) : '2026-09-01'
        }
      }

      // Offset da parcela se parcelada
      const numParcela = oc.getInt('numero_parcela')
      const pInicial = comp ? comp.getInt('parcela_inicial') || 1 : 1
      const isParcelado = comp
        ? comp.getString('modalidade_parcelamento') === 'parcelado' ||
          comp.getString('regra_repeticao') === 'parcelado'
        : numParcela > 0

      const offset = isParcelado && numParcela > 0 ? numParcela - pInicial : 0

      const [anoStr, mesStr, diaStr] = dataBaseStr.split('-')
      const cAno = parseInt(anoStr, 10)
      const cMesZero = parseInt(mesStr, 10) - 1
      const cDia = parseInt(diaStr, 10)

      const parcelaDate = calcularDataVencimentoNoMes(cAno, cMesZero + offset, cDia)
      const parcelaDataIso =
        parcelaDate.getUTCFullYear() +
        '-' +
        String(parcelaDate.getUTCMonth() + 1).padStart(2, '0') +
        '-' +
        String(parcelaDate.getUTCDate()).padStart(2, '0')

      const ciclo = calcularFaturaCartao(
        cartao.dia_fechamento,
        cartao.dia_vencimento,
        parcelaDataIso,
      )

      const expectedDueIso = ciclo.dataVencimento + ' 12:00:00.000Z'
      const currentDueStr = (oc.getString('data_vencimento') || '').slice(0, 10)
      const currentComp = oc.getString('competencia')

      let precisaAtualizar = false
      if (currentDueStr !== ciclo.dataVencimento) {
        oc.set('data_vencimento', expectedDueIso)
        precisaAtualizar = true
      }
      if (currentComp !== ciclo.competencia) {
        oc.set('competencia', ciclo.competencia)
        precisaAtualizar = true
      }

      // Garantir conta preenchida se estava vazia
      if (!oc.getString('conta') && cartao.id) {
        oc.set('conta', cartao.id)
        precisaAtualizar = true
      }

      if (precisaAtualizar) {
        app.save(oc)
        alteradas++
      }
    }

    console.log(
      'Migration 0054: ' + alteradas + ' ocorrencia(s) de cartao de credito recalculadas.',
    )
  },
  (app) => {
    // Rollback vazio conforme especificação
  },
)
