migrate(
  (app) => {
    // Migração 0072: Estender a regra do ciclo da fatura para compras AVULSAS no cartão de crédito
    // Regra:
    // 1. Ocorrências avulsas (regra_repeticao = 'avulso' ou numero_parcela = 0 / total_parcelas <= 1)
    //    em contas do tipo 'cartao' (e seção 'cartoes_credito').
    // 2. Competência = ciclo da fatura em que a data da transação cai (usando dia_fechamento da conta).
    //    Se compra > dia_fechamento, fatura do mês seguinte; se <=, próprio mês.
    // 3. Vencimento = dia_vencimento da conta no ciclo correspondente.
    // 4. Preserva pagamentos/status já registrados: status, valor_pago, data_pagamento permanecem intactos.
    // 5. Se houver lançamento vinculado cuja competência divergir da nova competência, atualiza o lançamento.
    // 6. Não altera o comportamento de compromissos em contas NÃO-cartão, nem compromissos parcelados (já migrados em 0071).

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

    // Busca ocorrências avulsas (numero_parcela = 0 ou <= 1)
    const ocorrencias = app.findRecordsByFilter(
      'despesas_ocorrencias',
      'numero_parcela <= 1 && total_parcelas <= 1',
      'created',
      5000,
      0,
    )

    let totalOcorrenciasAtualizadas = 0
    let totalLancamentosAtualizados = 0

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

    for (let oIdx = 0; oIdx < ocorrencias.length; oIdx++) {
      const oc = ocorrencias[oIdx]
      const compId = oc.getString('compromisso')
      const comp = compId ? getCompromisso(compId) : null

      if (comp) {
        const modParc = comp.getString('modalidade_parcelamento')
        const regRep = comp.getString('regra_repeticao')
        const totCompParc = comp.getInt('total_parcelas') || 0
        if (modParc === 'parcelado' || (regRep === 'parcelado' && totCompParc > 1)) {
          // Compromisso parcelado: já tratado na migração 0071
          continue
        }
      }

      // Determinar se está associada a cartão de crédito
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
        if (!cartaoEfetivo) {
          const metComp = comp.getString('metodo_pagamento')
          if (metComp) {
            cartaoEfetivo = getContaFromMetodo(metComp)
          }
        }
      }

      // Se a conta não é cartão e a seção não é cartoes_credito, ignora
      if (!cartaoEfetivo) {
        continue
      }

      // Data da transação:
      let dataTransacaoStr = ''
      const dp = oc.getString('data_pagamento')
      if (dp && dp.length >= 10) {
        dataTransacaoStr = dp.slice(0, 10)
      } else if (comp) {
        const di = comp.getString('data_inicio')
        if (di && di.length >= 10) {
          dataTransacaoStr = di.slice(0, 10)
        }
      }

      if (!dataTransacaoStr) {
        const cr = oc.getString('created') || (comp ? comp.getString('created') : '')
        dataTransacaoStr = cr && cr.length >= 10 ? cr.slice(0, 10) : '2026-09-01'
      }

      const cicloEsperado = calcularCicloFatura(
        cartaoEfetivo.dia_fechamento,
        cartaoEfetivo.dia_vencimento,
        dataTransacaoStr,
      )

      const compEsperada = cicloEsperado.competencia
      const vencEsperadoIso = cicloEsperado.vencimento + ' 12:00:00.000Z'

      const currentComp = oc.getString('competencia')
      const currentDueStr = (oc.getString('data_vencimento') || '').slice(0, 10)

      let precisaSalvar = false

      if (currentComp !== compEsperada) {
        oc.set('competencia', compEsperada)
        precisaSalvar = true
      }

      if (currentDueStr !== cicloEsperado.vencimento) {
        oc.set('data_vencimento', vencEsperadoIso)
        precisaSalvar = true
      }

      if (oc.getString('conta') !== cartaoEfetivo.id) {
        oc.set('conta', cartaoEfetivo.id)
        precisaSalvar = true
      }

      if (oc.getString('secao') !== 'cartoes_credito') {
        oc.set('secao', 'cartoes_credito')
        precisaSalvar = true
      }

      if (precisaSalvar) {
        app.save(oc)
        totalOcorrenciasAtualizadas++

        // Se tiver lançamento financeiro vinculado, move a competência junto
        const lancId = oc.getString('lancamento')
        if (lancId) {
          try {
            const lanc = app.findFirstRecordByData('lancamentos', 'id', lancId)
            if (lanc.getString('competencia') !== compEsperada) {
              lanc.set('competencia', compEsperada)
              app.save(lanc)
              totalLancamentosAtualizados++
            }
          } catch (_) {}
        }
      }
    }

    console.log(
      'Migration 0072 executada: ' +
        totalOcorrenciasAtualizadas +
        ' ocorrencia(s) avulsa(s) e ' +
        totalLancamentosAtualizados +
        ' lancamento(s) atualizados.',
    )
  },
  (app) => {
    // Rollback não aplicável para recalculo retroativo idempotente
  },
)
