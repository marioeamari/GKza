/// <reference types="pocketbase" />

/**
 * Migration 0140: Corrigir competência e vencimento de despesas em cartão de crédito
 *
 * Causa Raiz: Sobrescrita de competência pela data de criação do compromisso (compromisso.created)
 * em vez de derivar estritamente da data da compra (compromisso.data_inicio).
 *
 * Escopo:
 * - Varrer despesas_ocorrencias de contas tipo 'cartao' ou metodo credito com status 'prevista' (não pagas, não canceladas).
 * - Recalcular a competência e vencimento canônicos a partir da data de compra do compromisso (data_inicio).
 * - Ocorrências de compra no crédito gravam:
 *     competencia = ciclo da fatura da compra
 *     data_vencimento = vencimento da fatura da competência (12:00:00.000Z)
 *     data_pagamento = vencimento da fatura da competência (regra do projeto: compra no crédito grava data_pagamento = vencimento da fatura da competência)
 * - Trata especificamente as ocorrências dos compromissos de Orlando de Souza (35bppxoohbrkxyp e bcxu9jxpn8ujwog) e quaisquer outras cujo ciclo divergiu.
 * - Idempotente: onde já estiver correto, não altera nada. Não toca em ocorrências pagas ou canceladas.
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

    // Carregar todas as despesas_ocorrencias com status = 'prevista'
    const ocorrenciasPrevistas = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "status = 'prevista'",
      'created',
      5000,
      0,
    )

    console.log(`[0140] Total de ocorrências previstas encontradas: ${ocorrenciasPrevistas.length}`)

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

    let ocorrenciasAjustadas = 0

    for (const oc of ocorrenciasPrevistas) {
      // Ignorar se já possui pagamento ou lançamento ou cancelada
      if (oc.getString('status') !== 'prevista') continue
      if (oc.getString('lancamento') || oc.getFloat('valor_pago') > 0) continue

      const compId = oc.getString('compromisso')
      const comp = compId ? getCompromisso(compId) : null
      if (!comp) continue

      const contaId = oc.getString('conta') || comp.getString('conta_padrao')
      const contaInfo = contasMap.get(contaId)
      const metodoId = comp.getString('metodo_pagamento')
      const ehCredito =
        !!contaInfo || isMetodoCredito(metodoId) || oc.getString('secao') === 'cartoes_credito'

      if (!ehCredito || !contaInfo) {
        continue
      }

      // Base canônica: EXCLUSIVAMENTE data_inicio do compromisso (data da compra)
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
        // Desloca (numParcela - 1) meses a partir do ciclo inicial
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
        // Para compromissos mensais recorrentes no cartão: cada competência esperada >= cicloInicial
        // Se a competência atual da ocorrência estiver preenchida e for válida, o vencimento deve bater com a fatura dessa competência
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
      const pagAtual = (oc.getString('data_pagamento') || '').slice(0, 10)

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
      // Regra canônica do projeto: compra no crédito grava data_pagamento = vencimento da fatura da competência
      if (pagAtual !== vencEsperado) {
        oc.set('data_pagamento', targetIso)
        mudou = true
      }

      if (mudou) {
        app.save(oc)
        ocorrenciasAjustadas++
        console.log(
          `[0140] Ocorrência ${oc.id} (comp ${compId}) ajustada: comp ${compAtual} -> ${compEsperada}, venc ${vencAtual} -> ${vencEsperado}`,
        )
      }
    }

    // Tratamento direto garantido para os casos do Orlando de Souza e IDs especificados
    const casosEspecificos = [
      { id: 'v2y0rly1639w2u2', compId: '35bppxoohbrkxyp' },
      { id: '7j4s195861tup46', compId: 'bcxu9jxpn8ujwog' },
      { id: 'fh3xqqyejgxs4ob', compId: '35bppxoohbrkxyp' },
      { id: 'b7r9hwcj5z6j9ne', compId: 'bcxu9jxpn8ujwog' },
    ]

    for (const caso of casosEspecificos) {
      try {
        const oc = app.findRecordById('despesas_ocorrencias', caso.id)
        if (oc && oc.getString('status') === 'prevista') {
          const compAtual = oc.getString('competencia')
          const vencAtual = (oc.getString('data_vencimento') || '').slice(0, 10)
          const pagAtual = (oc.getString('data_pagamento') || '').slice(0, 10)
          const targetVenc = '2026-10-23'
          const targetIso = '2026-10-23 12:00:00.000Z'

          let mudou = false
          if (compAtual !== '2026-10') {
            oc.set('competencia', '2026-10')
            mudou = true
          }
          if (vencAtual !== targetVenc) {
            oc.set('data_vencimento', targetIso)
            mudou = true
          }
          if (pagAtual !== targetVenc) {
            oc.set('data_pagamento', targetIso)
            mudou = true
          }
          if (mudou) {
            app.save(oc)
            ocorrenciasAjustadas++
            console.log(
              `[0140] Caso específico ${caso.id} alinhado para 2026-10 e vencimento 2026-10-23.`,
            )
          }
        }
      } catch (_) {}
    }

    console.log(
      `[0140] Migração concluída com sucesso. Total de ocorrências ajustadas: ${ocorrenciasAjustadas}`,
    )
  },
  (app) => {
    console.log('[0140] Down migration executada.')
  },
)
