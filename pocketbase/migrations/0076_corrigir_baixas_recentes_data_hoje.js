migrate(
  (app) => {
    // Migração 0076: Corrigir ocorrências baixadas recentemente com a data antiga pré-carregada (17/09/2026)
    // ao invés da data de hoje (06/10/2026), sincronizando lançamentos vinculados e competências.
    // Lote identificado no pedido:
    // - Amendoim R$ 5,00 (rgfatii61wbj7va)
    // - Conserto Logan (2/5) R$ 219,00 (iswtn97h6fdlq35)
    // - Marmita R$ 20,00 (55cpneug6w4tqb9)
    // - Livros Rafaela (1/2) R$ 57,18 (z92n5ivhc7ts60q)
    // e demais do mesmo lote de baixas em 2026-10-06.

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

    function calcularCicloFatura(diaFechamento, diaVencimento, dataTransacao) {
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
      const vencStr =
        vYear +
        '-' +
        String(vMonth + 1).padStart(2, '0') +
        '-' +
        String(realDiaVencimento).padStart(2, '0')

      return {
        competencia: compStr,
        vencimento: vencStr,
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
            nome: c.getString('nome'),
            dia_fechamento: c.getInt('dia_fechamento') || 10,
            dia_vencimento: c.getInt('dia_vencimento') || 20,
          }
          return cartaoCache[contaId]
        }
      } catch (_) {}
      cartaoCache[contaId] = null
      return null
    }

    const compCache = {}
    function getCompromisso(compId) {
      if (!compId) return null
      if (compCache[compId] !== undefined) return compCache[compId]
      try {
        compCache[compId] = app.findFirstRecordByData('despesas_compromisso', 'id', compId)
        return compCache[compId]
      } catch (_) {
        compCache[compId] = null
        return null
      }
    }

    const metodoCache = {}
    function getMetodo(metodoId) {
      if (!metodoId) return null
      if (metodoCache[metodoId] !== undefined) return metodoCache[metodoId]
      try {
        metodoCache[metodoId] = app.findFirstRecordByData('metodos_pagamento', 'id', metodoId)
        return metodoCache[metodoId]
      } catch (_) {
        metodoCache[metodoId] = null
        return null
      }
    }

    function isMetodoCreditoRecord(metodoRec) {
      if (!metodoRec) return false
      const id = metodoRec.id
      const slug = metodoRec.getString('slug')
      const nome = metodoRec.getString('nome')
      if (
        id === 'r9qdfpwfe5143oe' ||
        slug === 'credito' ||
        nome.toLowerCase() === 'crédito' ||
        nome.toLowerCase() === 'credito'
      ) {
        return true
      }
      return false
    }

    // Identificar ocorrências pagas no lote de 2026-10-06 com data_pagamento antiga (17/09/2026):
    // Critérios seguros para não reescrever histórico legítimo:
    // 1. status = 'paga'
    // 2. data_pagamento começa com '2026-09-17'
    // 3. updated recente (a partir de 2026-10-05 00:00:00)
    // 4. data_pagamento < substr(updated, 1, 10) (sinal claro de data antiga pré-carregada na baixa hoje)
    const ocorrenciasLote = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "status = 'paga' && data_pagamento ~ '2026-09-17' && updated >= '2026-10-05 00:00:00'",
      'created',
      500,
      0,
    )

    let totalOcorrenciasCorrigidas = 0
    let totalLancamentosCorrigidos = 0

    const hojeDataPagamentoIso = '2026-10-06 12:00:00.000Z'
    const hojeDataStr = '2026-10-06'

    for (let i = 0; i < ocorrenciasLote.length; i++) {
      const oc = ocorrenciasLote[i]
      const compId = oc.getString('compromisso')
      const comp = compId ? getCompromisso(compId) : null

      // Identifica se é cartão com método crédito
      let cartaoEfetivo = null
      const contaOc = oc.getString('conta')
      if (contaOc) {
        cartaoEfetivo = getContaCartao(contaOc)
      }
      if (!cartaoEfetivo && comp) {
        const contaComp = comp.getString('conta_padrao')
        if (contaComp) {
          cartaoEfetivo = getContaCartao(contaComp)
        }
      }

      let metodoCredito = false
      if (comp) {
        const mId = comp.getString('metodo_pagamento')
        if (mId) {
          const mRec = getMetodo(mId)
          metodoCredito = isMetodoCreditoRecord(mRec)
        }
      }

      const ehCartaoCredito =
        !!cartaoEfetivo && (metodoCredito || oc.getString('secao') === 'cartoes_credito')

      let novaCompetencia = '2026-10'
      let novaDataVencimentoIso = oc.getString('data_vencimento')

      if (ehCartaoCredito && cartaoEfetivo) {
        // Para cartão NuBank (fecha 16, vence 23) ou Sicred (fecha 31, vence 10):
        // Pagamento em 06/10 no NuBank (06 <= 16) -> ciclo da fatura 2026-10, vencimento 23/10/2026.
        const ciclo = calcularCicloFatura(
          cartaoEfetivo.dia_fechamento,
          cartaoEfetivo.dia_vencimento,
          hojeDataStr,
        )
        novaCompetencia = ciclo.competencia
        novaDataVencimentoIso = ciclo.vencimento + ' 12:00:00.000Z'
      } else {
        // Não-cartão: competência do mês do pagamento (2026-10)
        novaCompetencia = '2026-10'
        if (comp) {
          const diaComp = comp.getInt('dia_vencimento') || 10
          const realDia = Math.min(diaComp, 31)
          novaDataVencimentoIso = '2026-10-' + String(realDia).padStart(2, '0') + ' 12:00:00.000Z'
        }
      }

      // Atualiza ocorrência
      oc.set('data_pagamento', hojeDataPagamentoIso)
      oc.set('competencia', novaCompetencia)
      if (novaDataVencimentoIso) {
        oc.set('data_vencimento', novaDataVencimentoIso)
      }
      app.save(oc)
      totalOcorrenciasCorrigidas++

      // Sincronizar lançamento financeiro vinculado
      const lancId = oc.getString('lancamento')
      if (lancId) {
        try {
          const lanc = app.findFirstRecordByData('lancamentos', 'id', lancId)
          lanc.set('data', hojeDataPagamentoIso)
          lanc.set('competencia', novaCompetencia)
          app.save(lanc)
          totalLancamentosCorrigidos++
        } catch (_) {}
      }
    }

    console.log(
      '[Migration 0076] Concluída: ' +
        totalOcorrenciasCorrigidas +
        ' ocorrência(s) e ' +
        totalLancamentosCorrigidos +
        ' lançamento(s) corrigidos para data de hoje (06/10/2026).',
    )
  },
  (app) => {
    // Rollback não aplicável
  },
)
