/// <reference types="pocketbase" />

/**
 * Migration 0141: Corrigir competência e vencimento de despesas de cartão deslocadas por pagamento
 *
 * Contexto:
 * Ocorrência b7r9hwcj5z6j9ne (compromisso bcxu9jxpn8ujwog, compra em 17/09/2026 no NuBank fech 16 venc 23)
 * teve o pagamento baixado com data 17/09/2026, e o fluxo anterior recalculou competência para 2026-09
 * e vencimento para 23/09/2026 (deslocando da competência correta 2026-10 / vencimento 23/10/2026).
 * O lançamento correspondente (opiij78htvk48pg) também ficou com competência 2026-09.
 *
 * O que esta migração faz:
 * (B) Recoloca a ocorrência b7r9hwcj5z6j9ne em competencia 2026-10 e data_vencimento 23/10/2026,
 *     MANTENDO status 'paga', data_pagamento 17/09/2026 e valor_pago 5;
 *     e ajusta o lançamento opiij78htvk48pg para a mesma competência (2026-10).
 * (C) Varredura preventiva em todas as despesas_ocorrencias de contas tipo 'cartao' onde o pagamento
 *     ou cálculo possa ter deslocado a competência/vencimento em relação ao ciclo canônico derivado
 *     da data da compra (compromisso.data_inicio). Nunca altera a data_pagamento real nem o valor_pago.
 *     Ajusta também a competência do lançamento financeiro correspondente para coincidir com a da ocorrência.
 *     Idempotente.
 */

migrate(
  (app) => {
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

    function calcularVencimentoFatura(diaFechamento, diaVencimento, competencia) {
      const dFech = diaFechamento || 10
      const dVenc = diaVencimento || 20

      const parts = competencia.split('-')
      const fYear = parseInt(parts[0], 10)
      const fMonth = parseInt(parts[1], 10) - 1

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

      return (
        vYear +
        '-' +
        String(vMonth + 1).padStart(2, '0') +
        '-' +
        String(realDiaVencimento).padStart(2, '0')
      )
    }

    // 1. Mapa de contas do tipo cartão
    const contasCartao = app.findRecordsByFilter('contas', "tipo = 'cartao'", '', 100, 0)
    const contasMap = new Map()
    for (const c of contasCartao) {
      contasMap.set(c.id, {
        id: c.id,
        dia_fechamento: c.getInt('dia_fechamento') || 16,
        dia_vencimento: c.getInt('dia_vencimento') || 23,
      })
    }

    const metodoCache = {}
    function isMetodoCredito(metodoId) {
      if (!metodoId) return false
      if (metodoCache[metodoId] !== undefined) return metodoCache[metodoId]
      try {
        const mp = app.findFirstRecordByData('metodos_pagamento', 'id', metodoId)
        const cod = (mp.getString('codigo') || '').toLowerCase()
        const nome = (mp.getString('nome') || '').toLowerCase()
        const tipo = (mp.getString('tipo') || '').toLowerCase()
        if (
          cod.indexOf('debito') !== -1 ||
          nome.indexOf('debito') !== -1 ||
          nome.indexOf('débito') !== -1
        ) {
          metodoCache[metodoId] = false
          return false
        }
        const ehCred =
          cod === 'credito' ||
          cod === 'cartao_credito' ||
          nome.indexOf('crédito') !== -1 ||
          nome.indexOf('credito') !== -1 ||
          tipo === 'cartao' ||
          tipo === 'credito'
        metodoCache[metodoId] = ehCred
        return ehCred
      } catch (_) {}
      metodoCache[metodoId] = false
      return false
    }

    const compCache = {}
    function getCompromisso(id) {
      if (!id) return null
      if (compCache[id] !== undefined) return compCache[id]
      try {
        compCache[id] = app.findFirstRecordByData('despesas_compromisso', 'id', id)
        return compCache[id]
      } catch (_) {
        compCache[id] = null
        return null
      }
    }

    let ocorrenciasCorrigidas = 0
    let lancamentosCorrigidos = 0

    // (B) Correção pontual garantida do caso relatado: b7r9hwcj5z6j9ne e opiij78htvk48pg
    try {
      const ocBug = app.findRecordById('despesas_ocorrencias', 'b7r9hwcj5z6j9ne')
      if (ocBug) {
        let mudou = false
        if (ocBug.getString('competencia') !== '2026-10') {
          ocBug.set('competencia', '2026-10')
          mudou = true
        }
        if ((ocBug.getString('data_vencimento') || '').slice(0, 10) !== '2026-10-23') {
          ocBug.set('data_vencimento', '2026-10-23 12:00:00.000Z')
          mudou = true
        }
        // Garante que o status 'paga', valor_pago 5 e data_pagamento 17/09 são mantidos
        if (ocBug.getString('status') !== 'paga') {
          ocBug.set('status', 'paga')
          mudou = true
        }
        if (mudou) {
          app.save(ocBug)
          ocorrenciasCorrigidas++
          console.log('[0141] Ocorrência b7r9hwcj5z6j9ne corrigida para 2026-10 / 2026-10-23.')
        }
      }
    } catch (e) {
      console.log('[0141] Erro ao buscar ocorrência b7r9hwcj5z6j9ne:', e)
    }

    try {
      const lancBug = app.findRecordById('lancamentos', 'opiij78htvk48pg')
      if (lancBug) {
        if (lancBug.getString('competencia') !== '2026-10') {
          lancBug.set('competencia', '2026-10')
          app.save(lancBug)
          lancamentosCorrigidos++
          console.log('[0141] Lançamento opiij78htvk48pg ajustado para competência 2026-10.')
        }
      }
    } catch (e) {
      console.log('[0141] Erro ao buscar lançamento opiij78htvk48pg:', e)
    }

    // (C) Varredura preventiva: todas as despesas_ocorrencias de cartão
    const ocorrenciasCartao = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "secao = 'cartoes_credito'",
      'created',
      5000,
      0,
    )

    console.log(`[0141] Varredura em ${ocorrenciasCartao.length} ocorrências de cartão de crédito.`)

    for (const oc of ocorrenciasCartao) {
      const compId = oc.getString('compromisso')
      const comp = compId ? getCompromisso(compId) : null
      if (!comp) continue

      const contaId = oc.getString('conta') || comp.getString('conta_padrao')
      const contaInfo = contasMap.get(contaId)
      if (!contaInfo) continue

      const metodoId = comp.getString('metodo_pagamento')
      if (!isMetodoCredito(metodoId) && oc.getString('secao') !== 'cartoes_credito') {
        continue
      }

      // Base canônica: data_inicio do compromisso
      const dataCompra = comp.getString('data_inicio')
      if (!dataCompra) continue

      const dataCompraStr = dataCompra.slice(0, 10)
      const cicloInicial = calcularCicloFatura(
        contaInfo.dia_fechamento,
        contaInfo.dia_vencimento,
        dataCompraStr,
      )

      const numParcela = oc.getInt('numero_parcela') || 0
      const regraRepeticao = comp.getString('regra_repeticao')
      const modalidadeParcelamento = comp.getString('modalidade_parcelamento')
      const isParcelado = modalidadeParcelamento === 'parcelado' || regraRepeticao === 'parcelado'

      let compEsperada = cicloInicial.competencia
      let vencEsperado = cicloInicial.vencimento

      if (isParcelado && numParcela > 1) {
        const parts = cicloInicial.competencia.split('-')
        const y = parseInt(parts[0], 10)
        const m = parseInt(parts[1], 10) - 1
        compEsperada = formatYearMonth(y, m + (numParcela - 1))
        vencEsperado = calcularVencimentoFatura(
          contaInfo.dia_fechamento,
          contaInfo.dia_vencimento,
          compEsperada,
        )
      } else if (regraRepeticao === 'mensal' && !isParcelado) {
        // Mensal recorrente: se competência >= cicloInicial, vencimento deve seguir a fatura dessa competência
        const compAtual = oc.getString('competencia')
        if (compAtual && compAtual >= cicloInicial.competencia) {
          compEsperada = compAtual
          vencEsperado = calcularVencimentoFatura(
            contaInfo.dia_fechamento,
            contaInfo.dia_vencimento,
            compEsperada,
          )
        }
      }

      const compAtual = oc.getString('competencia') || ''
      const vencAtual = (oc.getString('data_vencimento') || '').slice(0, 10)
      const targetIso = `${vencEsperado} 12:00:00.000Z`

      let mudou = false
      if (compAtual !== compEsperada) {
        oc.set('competencia', compEsperada)
        mudou = true
      }
      if (vencAtual !== vencEsperado) {
        oc.set('data_vencimento', targetIso)
        mudou = true
      }

      // Para ocorrências previstas, data_pagamento provisionada = vencimento da fatura
      if (oc.getString('status') === 'prevista') {
        const pagAtual = (oc.getString('data_pagamento') || '').slice(0, 10)
        if (pagAtual !== vencEsperado) {
          oc.set('data_pagamento', targetIso)
          mudou = true
        }
      }
      // Para ocorrências pagas, NUNCA altera data_pagamento nem valor_pago!

      if (mudou) {
        app.save(oc)
        ocorrenciasCorrigidas++
        console.log(
          `[0141] Ocorrência ${oc.id} (comp ${compId}, status ${oc.getString('status')}): comp ${compAtual} -> ${compEsperada}, venc ${vencAtual} -> ${vencEsperado}`,
        )
      }

      // Se possui lançamento financeiro associado, garante que a competência do lançamento reflete a competência da ocorrência
      const lancId = oc.getString('lancamento')
      if (lancId) {
        try {
          const lanc = app.findRecordById('lancamentos', lancId)
          if (lanc && lanc.getString('competencia') !== compEsperada) {
            lanc.set('competencia', compEsperada)
            app.save(lanc)
            lancamentosCorrigidos++
            console.log(`[0141] Lançamento ${lancId} atualizado para competência ${compEsperada}.`)
          }
        } catch (_) {}
      }
    }

    console.log(
      `[0141] Migração concluída. Ocorrências ajustadas: ${ocorrenciasCorrigidas}, Lançamentos ajustados: ${lancamentosCorrigidos}.`,
    )
  },
  (app) => {
    console.log('[0141] Down migration executada.')
  },
)
