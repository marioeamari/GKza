/// <reference types="pocketbase" />

/**
 * Migration 0148: Reparo do cronograma de parcelas em cartão — caso de borda TORO
 * (correção da migração 0147, que não moveu a parcela 2 do compromisso fhlmrrnph6hmbh3).
 *
 * Causa raiz descoberta: a migração 0147 usava um gerador com guarda de sequência em que
 * o ajuste local (offsetExtra) ACUMULAVA entre parcelas. No caso TORO (compra 19/09/2026,
 * NuBank fech 16 / venc 23, 4x), a parcela 2 (compra 19/10 > fechamento 16/10) precisava
 * de um ajuste local (+1 ciclo), e esse ajuste se propagou permanentemente às parcelas
 * seguintes — o que EMPURROU a série para 23/10, 23/12, 23/01 (novembro ausente) e fez a
 * guarda aceitar a parcela 2 em 23/10 (que era o "atual" da série deslocada). Resultado:
 * a migração passou pelo compromisso e ainda assim deixou a parcela 2 em 23/10/2026.
 * O gerador corrigido (0.0.289, src/lib/cartao-fatura.ts) recomputa cada parcela
 * INDEPENDENTEMENTE: parcela N = ciclo da fatura da compra da parcela N, sem offset
 * acumulado. Regra vigente gravada:
 *   vencimento da parcela N = vencimento da fatura do ciclo da compra da parcela N
 *   (mês da data_inicio + N - 1, ajustado pelo dia_fechamento);
 *   compra <= fechamento -> fatura do mês corrente; compra > fechamento -> mês seguinte;
 *   série estritamente crescente (nunca duplica mês, nunca pula mês);
 *   data_fim_calculada = vencimento da última parcela.
 *
 * O que esta migração faz (idempotente):
 * (1) Audita TODOS os compromissos parcelados em conta tipo cartao (secao cartoes_credito
 *     OU conta tipo 'cartao'), recalculando competência e data_vencimento de TODAS as
 *     ocorrências (previstas E pagas) pela regra canônica corrigida — preservando status,
 *     data_pagamento real, valor_pago, valores e lançamento vinculado (só a competência do
 *     lançamento é alinhada à nova competência da ocorrência).
 * (2) Em ocorrências 'prevista', data_pagamento provisionada = vencimento da fatura.
 * (3) data_fim_calculada do compromisso = vencimento da última parcela.
 * (4) Reexecutar NÃO move ocorrências já corretas nem duplica (guarda de igualdade estrita).
 */

migrate(
  (app) => {
    // ---------- helpers de data (espelham src/lib/cartao-fatura.ts 0.0.289) ----------
    function getDaysInMonth(year, month) {
      return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    }

    function formatYearMonth(year, month) {
      const normalized = new Date(Date.UTC(year, month, 1))
      const y = normalized.getUTCFullYear()
      const m = String(normalized.getUTCMonth() + 1).padStart(2, '0')
      return y + '-' + m
    }

    function adicionarMesesCompetencia(competencia, offsetMeses) {
      const parts = competencia.split('-')
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      return formatYearMonth(y, m + offsetMeses)
    }

    function calcularCicloFatura(diaFechamento, diaVencimento, dataTransacao) {
      const dFech = diaFechamento || 10
      const dVenc = diaVencimento || 20
      const clean = (dataTransacao || '').slice(0, 10)
      const parts = clean.split('-')
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)

      let fechamentoYear = year
      let fechamentoMonth = month
      if (day > dFech) {
        fechamentoMonth += 1
      }
      const compStr = formatYearMonth(fechamentoYear, fechamentoMonth)

      let vencYear = year
      let vencMonth = fechamentoMonth
      if (dVenc < dFech) {
        vencMonth += 1
      }
      const vencComp = formatYearMonth(vencYear, vencMonth)
      const vParts = vencComp.split('-')
      const vYear = parseInt(vParts[0], 10)
      const vMonth = parseInt(vParts[1], 10) - 1
      const realDiaVencimento = Math.min(dVenc, getDaysInMonth(vYear, vMonth))
      const vencStr =
        vYear +
        '-' +
        String(vMonth + 1).padStart(2, '0') +
        '-' +
        String(realDiaVencimento).padStart(2, '0')

      return { competencia: compStr, vencimento: vencStr }
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
      const realDiaVencimento = Math.min(dVenc, getDaysInMonth(vYear, vMonth))
      return (
        vYear +
        '-' +
        String(vMonth + 1).padStart(2, '0') +
        '-' +
        String(realDiaVencimento).padStart(2, '0')
      )
    }

    /**
     * Cronograma canônico (gerador 0.0.289): parcela N = fatura do ciclo da COMPRA da
     * parcela N (mês da data_inicio + N - 1, ajustado pelo fechamento). Sem offset
     * acumulado entre parcelas — cada parcela é computada independentemente.
     */
    function construirCronogramaCartao(diaFechamento, diaVencimento, dataCompraStr, totalParcelas) {
      const itens = []
      for (let p = 1; p <= totalParcelas; p++) {
        // Compra da parcela N = data_inicio avançada em (N - 1) meses (clamp do dia)
        const parts = dataCompraStr.split('-')
        const cYear = parseInt(parts[0], 10)
        const cMonth = parseInt(parts[1], 10) - 1
        const cDay = Math.min(parseInt(parts[2], 10), getDaysInMonth(cYear, cMonth + p - 1))
        const dataCompraParcela =
          formatYearMonth(cYear, cMonth + p - 1) + '-' + String(cDay).padStart(2, '0')
        const ciclo = calcularCicloFatura(diaFechamento, diaVencimento, dataCompraParcela)
        itens.push({ numero: p, competencia: ciclo.competencia, vencimento: ciclo.vencimento })
      }
      return itens
    }

    // ---------- mapa de contas cartão ----------
    const contasMap = new Map()
    const contasCartao = app.findRecordsByFilter('contas', "tipo = 'cartao'", '', 500, 0)
    for (const c of contasCartao) {
      contasMap.set(c.id, {
        id: c.id,
        dia_fechamento: c.getInt('dia_fechamento') || 0,
        dia_vencimento: c.getInt('dia_vencimento') || 0,
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

    // ---------- compromissos parcelados ----------
    const parcelados = app.findRecordsByFilter(
      'despesas_compromisso',
      "modalidade_parcelamento = 'parcelado' || regra_repeticao = 'parcelado'",
      'created',
      2000,
      0,
    )

    let compromissosAuditados = 0
    let compromissosAjustados = 0
    let ocorrenciasAuditadas = 0
    let ocorrenciasAjustadas = 0
    let lancamentosAjustados = 0

    for (const comp of parcelados) {
      const contaId = comp.getString('conta_padrao')
      const contaInfo = contasMap.get(contaId)
      const secaoComp = (comp.getString('secao') || '').toLowerCase()
      if (!contaInfo && secaoComp !== 'cartoes_credito') continue
      // Só entra se houver ciclo de cartão (conta com fechamento) ou método crédito
      if (
        (!contaInfo || contaInfo.dia_fechamento <= 0) &&
        !isMetodoCredito(comp.getString('metodo_pagamento'))
      ) {
        continue
      }

      const dataInicio = comp.getString('data_inicio')
      if (!dataInicio) continue
      const dataCompraStr = dataInicio.slice(0, 10)

      const totalParcelas = Math.max(1, comp.getInt('total_parcelas') || 1)
      const parcelaInicial = Math.max(1, comp.getInt('parcela_inicial') || 1)

      const diaFech = contaInfo ? contaInfo.dia_fechamento || 16 : 16
      const diaVenc = contaInfo ? contaInfo.dia_vencimento || diaFech : 23
      const cronograma = construirCronogramaCartao(diaFech, diaVenc, dataCompraStr, totalParcelas)

      compromissosAuditados++

      const ocorrencias = app.findRecordsByFilter(
        'despesas_ocorrencias',
        `compromisso = '${comp.id}'`,
        'numero_parcela',
        500,
        0,
      )
      if (ocorrencias.length === 0) continue

      let mudouCompromisso = false

      for (const oc of ocorrencias) {
        ocorrenciasAuditadas++
        const num = oc.getInt('numero_parcela') || 0
        if (num <= 0) continue

        // Estende o cronograma caso existam parcelas além do total declarado
        let previsto = cronograma.find((it) => it.numero === num)
        while (!previsto) {
          const anterior = cronograma[cronograma.length - 1]
          const proxNum = cronograma.length + 1
          const parts = dataCompraStr.split('-')
          const cYear = parseInt(parts[0], 10)
          const cMonth = parseInt(parts[1], 10) - 1
          const cDay = Math.min(parseInt(parts[2], 10), getDaysInMonth(cYear, cMonth + proxNum - 1))
          const dataCompraParcela =
            formatYearMonth(cYear, cMonth + proxNum - 1) + '-' + String(cDay).padStart(2, '0')
          const ciclo = calcularCicloFatura(diaFech, diaVenc, dataCompraParcela)
          let competencia = ciclo.competencia
          let vencimento = ciclo.vencimento
          if (vencimento <= anterior.vencimento) {
            competencia = adicionarMesesCompetencia(anterior.competencia, 1)
            vencimento = calcularVencimentoFatura(diaFech, diaVenc, competencia)
          }
          cronograma.push({ numero: proxNum, competencia, vencimento })
          previsto = cronograma.find((it) => it.numero === num)
        }

        const compEsperada = previsto.competencia
        const vencEsperado = previsto.vencimento
        const targetIso = `${vencEsperado} 12:00:00.000Z`

        const compAtual = oc.getString('competencia') || ''
        const vencAtual = (oc.getString('data_vencimento') || '').slice(0, 10)

        let mudou = false
        if (compAtual !== compEsperada) {
          oc.set('competencia', compEsperada)
          mudou = true
        }
        if (vencAtual !== vencEsperado) {
          oc.set('data_vencimento', targetIso)
          mudou = true
        }
        // Prevista: data_pagamento provisionada = vencimento da fatura
        if (oc.getString('status') === 'prevista') {
          const pagAtual = (oc.getString('data_pagamento') || '').slice(0, 10)
          if (pagAtual !== vencEsperado) {
            oc.set('data_pagamento', targetIso)
            mudou = true
          }
        }
        // Paga: NUNCA altera data_pagamento, valor_pago nem valores

        if (mudou) {
          app.save(oc)
          ocorrenciasAjustadas++
          console.log(
            `[0148] Ocorrência ${oc.id} (comp ${comp.id}, parcela ${num}, status ${oc.getString('status')}): comp ${compAtual} -> ${compEsperada}, venc ${vencAtual} -> ${vencEsperado}`,
          )
        }

        // Alinha competência do lançamento vinculado
        const lancId = oc.getString('lancamento')
        if (lancId) {
          try {
            const lanc = app.findRecordById('lancamentos', lancId)
            if (lanc && lanc.getString('competencia') !== compEsperada) {
              lanc.set('competencia', compEsperada)
              app.save(lanc)
              lancamentosAjustados++
            }
          } catch (_) {}
        }
      }

      // data_fim_calculada = vencimento da última parcela do cronograma
      try {
        const ultimaParcela =
          cronograma[Math.max(0, totalParcelas - parcelaInicial)] ||
          cronograma[cronograma.length - 1]
        const dataFimAtual = (comp.getString('data_fim_calculada') || '').slice(0, 10)
        if (dataFimAtual !== ultimaParcela.vencimento) {
          comp.set('data_fim_calculada', `${ultimaParcela.vencimento} 12:00:00.000Z`)
          app.save(comp)
          mudouCompromisso = true
        }
      } catch (_) {}

      if (mudouCompromisso) compromissosAjustados++
    }

    console.log(
      `[0148] Reparo concluído. Compromissos auditados: ${compromissosAuditados} (ajustados: ${compromissosAjustados}), ocorrências auditadas: ${ocorrenciasAuditadas} (ajustadas: ${ocorrenciasAjustadas}), lançamentos ajustados: ${lancamentosAjustados}.`,
    )
  },
  (app) => {
    console.log('[0148] Down migration executada.')
  },
)
