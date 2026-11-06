/// <reference types="pocketbase" />

/**
 * Migration 0147: Reparo do cronograma de parcelas em contas tipo cartão (ciclo da fatura)
 *
 * Bug (caso "Conserto Logan - ok", compromisso iswtn97h6fdlq35, NuBank fech 16 / venc 23,
 * 5x de R$ 219, data_inicio 29/08/2026): o gerador antigo avançava o vencimento pelo
 * dia_vencimento do compromisso sem observar o ciclo da fatura da compra de cada parcela,
 * produzindo outubro duplicado (23/10 nas parcelas 2 e 3) e novembro ausente.
 *
 * REGRA VIGENTE GRAVADA (0.0.286, também em src/lib/cartao-fatura.ts):
 * Para compromissos parcelados em conta tipo cartao (crédito), o vencimento de cada parcela N
 * é o vencimento da fatura do ciclo da COMPRA da parcela N (mês da data_inicio + N - 1,
 * ajustado pelo dia_fechamento): compra <= dia_fechamento -> fatura do mês corrente;
 * compra > dia_fechamento -> fatura do mês seguinte. A sequência de vencimentos é
 * estritamente crescente: nunca dois vencimentos iguais e nunca mês pulado.
 * data_fim_calculada = vencimento da última parcela.
 *
 * O que esta migração faz (idempotente):
 * (1) Para cada compromisso parcelado em cartão, recalcula competência/data_vencimento de
 *     TODAS as ocorrências (previstas E pagas) pela regra acima, preservando status,
 *     data_pagamento real, valor_pago, valores e lançamento vinculado (só a competência do
 *     lançamento é alinhada à nova competência da ocorrência).
 * (2) Em ocorrências 'prevista', data_pagamento provisionada = vencimento da fatura.
 * (3) data_fim_calculada do compromisso = vencimento da última parcela.
 * (4) Ocorrências já corretas NÃO são movidas nem duplicadas (guarda de igualdade estrita).
 */

migrate(
  (app) => {
    // ---------- helpers de data (espelham src/lib/cartao-fatura.ts) ----------
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
     * Cronograma canônico: parcela N = fatura do ciclo da compra da parcela N
     * (mês da data_inicio + N - 1, ajustado pelo fechamento), com guarda de
     * vencimentos estritamente crescentes (nunca duplica nem pula mês).
     */
    function construirCronogramaCartao(diaFechamento, diaVencimento, dataCompraStr, totalParcelas) {
      const cicloInicial = calcularCicloFatura(
        diaFechamento,
        diaVencimento,
        dataCompraStr,
      ).competencia
      const itens = []
      let vencAnterior = ''
      let offsetExtra = 0
      for (let p = 1; p <= totalParcelas; p++) {
        let competencia = adicionarMesesCompetencia(cicloInicial, p - 1 + offsetExtra)
        let vencimento = calcularVencimentoFatura(diaFechamento, diaVencimento, competencia)
        while (vencAnterior && vencimento <= vencAnterior) {
          offsetExtra += 1
          competencia = adicionarMesesCompetencia(cicloInicial, p - 1 + offsetExtra)
          vencimento = calcularVencimentoFatura(diaFechamento, diaVencimento, competencia)
        }
        itens.push({ numero: p, competencia: competencia, vencimento: vencimento })
        vencAnterior = vencimento
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

    let compromissosAjustados = 0
    let ocorrenciasAjustadas = 0
    let lancamentosAjustados = 0
    let duplicatasRemovidas = 0

    for (const comp of parcelados) {
      const contaId = comp.getString('conta_padrao')
      const contaInfo = contasMap.get(contaId)
      if (!contaInfo) continue
      // Só contas de cartão com ciclo definido (ou método crédito em conta com fechamento)
      if (contaInfo.dia_fechamento <= 0 && !isMetodoCredito(comp.getString('metodo_pagamento'))) {
        continue
      }

      const dataInicio = comp.getString('data_inicio')
      if (!dataInicio) continue
      const dataCompraStr = dataInicio.slice(0, 10)

      const totalParcelas = Math.max(1, comp.getInt('total_parcelas') || 1)

      // Ocorrências do compromisso
      const ocorrencias = app.findRecordsByFilter(
        'despesas_ocorrencias',
        `compromisso = '${comp.id}'`,
        'numero_parcela',
        500,
        0,
      )
      if (ocorrencias.length === 0) continue

      const diaFech = contaInfo.dia_fechamento || 16
      const diaVenc = contaInfo.dia_vencimento || diaFech
      const cronograma = construirCronogramaCartao(diaFech, diaVenc, dataCompraStr, totalParcelas)

      // Duplicatas de numero_parcela: mantém a paga (ou a primeira) e remove previstas repetidas
      const porNumero = new Map()
      for (const oc of ocorrencias) {
        const num = oc.getInt('numero_parcela') || 0
        if (num <= 0) continue
        const existente = porNumero.get(num)
        if (!existente) {
          porNumero.set(num, oc)
          continue
        }
        const existentePaga = existente.getString('status') === 'paga'
        const atualPaga = oc.getString('status') === 'paga'
        const manter = atualPaga && !existentePaga ? oc : existente
        const descartar = manter === oc ? existente : oc
        if (descartar.getString('status') !== 'paga') {
          try {
            app.delete(descartar)
            duplicatasRemovidas++
            console.log(
              `[0147] Duplicata de parcela ${num} removida do compromisso ${comp.id} (ocr ${descartar.id}).`,
            )
          } catch (_) {}
        }
        porNumero.set(num, manter)
      }

      let mudouCompromisso = false

      for (const [num, oc] of porNumero) {
        // Estende o cronograma caso existam parcelas além do total declarado
        let previsto = cronograma.find((it) => it.numero === num)
        while (!previsto) {
          const ultima = cronograma[cronograma.length - 1]
          let competencia = adicionarMesesCompetencia(
            calcularCicloFatura(diaFech, diaVenc, dataCompraStr).competencia,
            num - 1,
          )
          let vencimento = calcularVencimentoFatura(diaFech, diaVenc, competencia)
          if (vencimento <= ultima.vencimento) {
            vencimento = adicionarMesesCompetencia(ultima.vencimento.slice(0, 7), 1)
            vencimento = calcularVencimentoFatura(diaFech, diaVenc, vencimento)
            competencia = vencimento.slice(0, 7)
          }
          cronograma.push({ numero: cronograma.length + 1, competencia, vencimento })
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
            `[0147] Ocorrência ${oc.id} (comp ${comp.id}, parcela ${num}, status ${oc.getString('status')}): comp ${compAtual} -> ${compEsperada}, venc ${vencAtual} -> ${vencEsperado}`,
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
      const ultimaParcela = cronograma[cronograma.length - 1]
      try {
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
      `[0147] Reparo concluído. Compromissos ajustados: ${compromissosAjustados}, ocorrências ajustadas: ${ocorrenciasAjustadas}, lançamentos ajustados: ${lancamentosAjustados}, duplicatas removidas: ${duplicatasRemovidas}.`,
    )
  },
  (app) => {
    console.log('[0147] Down migration executada.')
  },
)
