migrate(
  (app) => {
    // FRENTE 1: Migração para alinhar compromissos parcelados em cartão de crédito ao ciclo da fatura
    // Regra:
    // 1. Competência da parcela N = ciclo da fatura correspondente.
    //    Parcela 1 vai para o ciclo da fatura da data de compra (se compra > dia_fechamento, fatura do mês seguinte; se <=, próprio mês).
    //    Parcela N fica no ciclo seguinte à parcela N-1 (avança 1 ciclo por parcela).
    // 2. Data de vencimento da parcela = vencimento da fatura do ciclo correspondente (dia_vencimento da conta do cartão).
    // 3. Preserva pagamentos/status já registrados: se a ocorrência estiver paga, atualiza competência e vencimento mantendo data_pagamento e valor_pago intactos.
    //    Se houver lançamento vinculado a uma ocorrência paga que teve sua competência alterada, move o lançamento junto.

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

    function calcularCicloInicial(diaFechamento, diaVencimento, dataTransacao) {
      const dFech = diaFechamento || 10
      const dVenc = diaVencimento || 20

      const parts = parseDateParts(dataTransacao)
      let fechamentoYear = parts.year
      let fechamentoMonth = parts.month

      if (parts.day > dFech) {
        fechamentoMonth += 1
      }

      const compStr = formatYearMonth(fechamentoYear, fechamentoMonth)
      return compStr
    }

    function calcularVencimentoCiclo(diaFechamento, diaVencimento, compStr) {
      const dFech = diaFechamento || 10
      const dVenc = diaVencimento || 20

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
      return (
        vYear +
        '-' +
        String(vMonth + 1).padStart(2, '0') +
        '-' +
        String(realDiaVencimento).padStart(2, '0')
      )
    }

    function adicionarMeses(compStr, offsetMeses) {
      const parts = compStr.split('-')
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      return formatYearMonth(y, m + offsetMeses)
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

    // 1. Busca todos os compromissos com modalidade_parcelamento = 'parcelado'
    // ou regra_repeticao = 'parcelado'
    const compromissos = app.findRecordsByFilter(
      'despesas_compromisso',
      "modalidade_parcelamento = 'parcelado' || regra_repeticao = 'parcelado'",
      'created',
      500,
      0,
    )

    let totalOcorrenciasAtualizadas = 0
    let totalLancamentosAtualizados = 0

    for (let cIdx = 0; cIdx < compromissos.length; cIdx++) {
      const comp = compromissos[cIdx]

      // Determinar se o compromisso é de cartão
      let cartao = null
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

      // Se a conta não for tipo cartão, mantém a regra não-cartão
      if (!cartao) {
        continue
      }

      // Data de compra base
      let dataCompraStr = ''
      const di = comp.getString('data_inicio')
      if (di && di.length >= 10) {
        dataCompraStr = di.slice(0, 10)
      } else {
        const cr = comp.getString('created')
        dataCompraStr = cr && cr.length >= 10 ? cr.slice(0, 10) : '2026-09-01'
      }

      // Ciclo inicial (parcela 1)
      const cicloInicialComp = calcularCicloInicial(
        cartao.dia_fechamento,
        cartao.dia_vencimento,
        dataCompraStr,
      )

      const totalParcelas = comp.getInt('total_parcelas') || 1
      const parcelaInicial = comp.getInt('parcela_inicial') || 1

      // Busca todas as ocorrências deste compromisso
      const ocorrencias = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = '" + comp.id + "'",
        'numero_parcela',
        100,
        0,
      )

      // Atualiza cada ocorrência existente
      for (let oIdx = 0; oIdx < ocorrencias.length; oIdx++) {
        const oc = ocorrencias[oIdx]
        const numParcela = oc.getInt('numero_parcela') || 1
        const offset = Math.max(0, numParcela - parcelaInicial)

        const compEsperada = adicionarMeses(cicloInicialComp, offset)
        const vencEsperadoData = calcularVencimentoCiclo(
          cartao.dia_fechamento,
          cartao.dia_vencimento,
          compEsperada,
        )
        const vencEsperadoIso = vencEsperadoData + ' 12:00:00.000Z'

        const currentComp = oc.getString('competencia')
        const currentDueStr = (oc.getString('data_vencimento') || '').slice(0, 10)

        let precisaSalvar = false

        if (currentComp !== compEsperada) {
          oc.set('competencia', compEsperada)
          precisaSalvar = true
        }

        if (currentDueStr !== vencEsperadoData) {
          oc.set('data_vencimento', vencEsperadoIso)
          precisaSalvar = true
        }

        // Garante conta correta
        if (oc.getString('conta') !== cartao.id) {
          oc.set('conta', cartao.id)
          precisaSalvar = true
        }

        if (precisaSalvar) {
          app.save(oc)
          totalOcorrenciasAtualizadas++

          // Se a ocorrência tiver lançamento vinculado e a competência mudou, move o lançamento junto
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

      // Sincronizar/completar parcelas faltantes de forma idempotente (sem criar duplicatas)
      const ocorrenciasExistentesNums = {}
      for (let oIdx = 0; oIdx < ocorrencias.length; oIdx++) {
        const oc = ocorrencias[oIdx]
        const np = oc.getInt('numero_parcela')
        if (np > 0) {
          ocorrenciasExistentesNums[np] = true
        }
      }

      const colOcorrencias = app.findCollectionByNameOrId('despesas_ocorrencias')
      const valorUnitario =
        comp.getFloat('valor_parcela') > 0
          ? comp.getFloat('valor_parcela')
          : comp.getFloat('valor_estimado')

      for (let p = parcelaInicial; p <= totalParcelas; p++) {
        if (!ocorrenciasExistentesNums[p]) {
          const offset = Math.max(0, p - parcelaInicial)
          const compEsperada = adicionarMeses(cicloInicialComp, offset)
          const vencEsperadoData = calcularVencimentoCiclo(
            cartao.dia_fechamento,
            cartao.dia_vencimento,
            compEsperada,
          )
          const vencEsperadoIso = vencEsperadoData + ' 12:00:00.000Z'

          const novaOc = new Record(colOcorrencias)
          novaOc.set('compromisso', comp.id)
          novaOc.set('contexto_tipo', comp.getString('contexto_tipo') || 'pessoal')
          novaOc.set('empresa', comp.getString('empresa') || null)
          novaOc.set('secao', comp.getString('secao') || 'cartoes_credito')
          novaOc.set('conta', cartao.id)
          novaOc.set('competencia', compEsperada)
          novaOc.set('numero_parcela', p)
          novaOc.set('total_parcelas', totalParcelas)
          novaOc.set('data_vencimento', vencEsperadoIso)
          novaOc.set('valor_previsto', valorUnitario)
          novaOc.set('valor_estimado_original', valorUnitario)
          novaOc.set('valor_ajustado_manualmente', false)
          novaOc.set('status', 'prevista')
          novaOc.set('dizimo', comp.getBool('dizimo'))
          novaOc.set('tipo_dizimo', comp.getString('tipo_dizimo') || null)
          novaOc.set('dizimo_percentual', comp.getInt('dizimo_percentual') || 100)
          novaOc.set('direcionamento', comp.getString('direcionamento') || null)
          novaOc.set('link_pagamento', comp.getString('link_pagamento') || null)
          novaOc.set('observacoes', 'Parcela ' + p + '/' + totalParcelas)

          app.save(novaOc)
          totalOcorrenciasAtualizadas++
        }
      }
    }

    console.log(
      'Migration 0071: ' +
        totalOcorrenciasAtualizadas +
        ' ocorrencia(s) e ' +
        totalLancamentosAtualizados +
        ' lancamento(s) atualizados com sucesso.',
    )
  },
  (app) => {
    // Rollback não aplicável para recalculo retroativo idempotente
  },
)
