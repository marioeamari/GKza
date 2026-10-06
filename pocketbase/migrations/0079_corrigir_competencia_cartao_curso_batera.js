migrate(
  (app) => {
    // Migração 0079: Corrigir competência e vencimento de despesas de cartão (caso Curso Batera e varredura geral)
    // Caso específico:
    // Compromisso: mst4cfpt34j7hpy (Curso Batera)
    // Ocorrência 1/2: jg43lkm1pasz0hd -> competência 2026-10, vencimento 2026-10-23 12:00:00.000Z
    // Lançamento: 871p6wel50zmhpp -> competência 2026-10
    // Compromisso mst4cfpt34j7hpy -> dia_vencimento = 23
    // Varredura: ocorrências de cartão onde a parcela 1 gravou competência do mês da compra após o fechamento

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

    function adicionarMesesCompetencia(competencia, deltaMeses) {
      const parts = competencia.split('-')
      const ano = parseInt(parts[0], 10)
      const mesZero = parseInt(parts[1], 10) - 1
      return formatYearMonth(ano, mesZero + deltaMeses)
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

    const cartaoCache = {}
    function getContaCartao(contaId) {
      if (!contaId) return null
      if (cartaoCache[contaId] !== undefined) return cartaoCache[contaId]
      try {
        const c = app.findFirstRecordByData('contas', 'id', contaId)
        const tipo = c.getString('tipo')
        const tiposPagamento = c.get('tipos_pagamento') || []
        const tiposPagStr = Array.isArray(tiposPagamento)
          ? tiposPagamento.join(',')
          : String(tiposPagamento)
        const aceitaCredito = tipo === 'cartao' || tiposPagStr.indexOf('credito') !== -1
        const diaFech = c.getInt('dia_fechamento')

        if (aceitaCredito && diaFech > 0) {
          cartaoCache[contaId] = {
            id: c.id,
            dia_fechamento: diaFech,
            dia_vencimento: c.getInt('dia_vencimento') || 20,
          }
          return cartaoCache[contaId]
        }
      } catch (_) {}
      cartaoCache[contaId] = null
      return null
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

    // =========================================================================
    // PARTE 1: CASO CONCRETO - Compromisso Curso Batera (mst4cfpt34j7hpy)
    // =========================================================================
    console.log(
      '[Migration 0079] Iniciando ajuste no compromisso Curso Batera (mst4cfpt34j7hpy)...',
    )
    try {
      const comp = app.findFirstRecordByData('despesas_compromisso', 'id', 'mst4cfpt34j7hpy')
      if (comp) {
        if (comp.getInt('dia_vencimento') !== 23) {
          comp.set('dia_vencimento', 23)
          app.save(comp)
          console.log(
            '[Migration 0079] Compromisso mst4cfpt34j7hpy: dia_vencimento atualizado para 23.',
          )
        }
      }
    } catch (e) {
      console.log('[Migration 0079] Compromisso mst4cfpt34j7hpy não encontrado: ' + e)
    }

    // Ocorrência 1/2: jg43lkm1pasz0hd
    try {
      const oc1 = app.findFirstRecordByData('despesas_ocorrencias', 'id', 'jg43lkm1pasz0hd')
      if (oc1) {
        oc1.set('competencia', '2026-10')
        oc1.set('data_vencimento', '2026-10-23 12:00:00.000Z')
        // Preserva intactos status, valor_pago, data_pagamento
        app.save(oc1)
        console.log(
          '[Migration 0079] Ocorrência jg43lkm1pasz0hd atualizada para competência 2026-10 e vencimento 2026-10-23.',
        )
      }
    } catch (e) {
      console.log('[Migration 0079] Ocorrência jg43lkm1pasz0hd não encontrada: ' + e)
    }

    // Lançamento 871p6wel50zmhpp
    try {
      const l = app.findFirstRecordByData('lancamentos', 'id', '871p6wel50zmhpp')
      if (l) {
        l.set('competencia', '2026-10')
        app.save(l)
        console.log(
          '[Migration 0079] Lançamento 871p6wel50zmhpp atualizado para competência 2026-10.',
        )
      }
    } catch (e) {
      console.log('[Migration 0079] Lançamento 871p6wel50zmhpp não encontrado: ' + e)
    }

    // =========================================================================
    // PARTE 2: VARREDURA IDEMPOTENTE PARA OCORRÊNCIAS DE CARTÃO DE CRÉDITO
    // =========================================================================
    console.log('[Migration 0079] Iniciando varredura geral para ocorrências de cartão...')
    const allOcorrencias = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "id != ''",
      'created',
      5000,
      0,
    )

    const compCache = {}
    function getComp(id) {
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

    for (let i = 0; i < allOcorrencias.length; i++) {
      const oc = allOcorrencias[i]
      const compId = oc.getString('compromisso')
      const comp = compId ? getComp(compId) : null

      // Ignora registros já corrigidos
      if (oc.id === 'jg43lkm1pasz0hd') {
        continue
      }

      let contaId = oc.getString('conta') || (comp ? comp.getString('conta_padrao') : '')
      const metodoId = comp ? comp.getString('metodo_pagamento') : ''

      let contaCartao = null
      if (contaId) {
        contaCartao = getContaCartao(contaId)
      }

      const ehCredito = contaCartao !== null && (metodoId ? isMetodoCredito(metodoId) : true)

      if (!ehCredito || !contaCartao) {
        continue
      }

      // Sincroniza dia_vencimento do compromisso com o cartão se necessário
      if (
        comp &&
        contaCartao.dia_vencimento &&
        comp.getInt('dia_vencimento') !== contaCartao.dia_vencimento
      ) {
        comp.set('dia_vencimento', contaCartao.dia_vencimento)
        try {
          app.save(comp)
        } catch (_) {}
      }

      let dataCompraStr = ''
      if (comp) {
        const di = comp.getString('data_inicio')
        if (di && di.length >= 10) {
          dataCompraStr = di.slice(0, 10)
        }
      }
      if (!dataCompraStr) {
        const cr = oc.getString('created') || (comp ? comp.getString('created') : '')
        dataCompraStr = cr && cr.length >= 10 ? cr.slice(0, 10) : '2026-09-01'
      }

      const numParc = oc.getInt('numero_parcela') || 1
      const offsetParcela = Math.max(0, numParc - 1)

      const cicloInicial = calcularCicloFatura(
        contaCartao.dia_fechamento,
        contaCartao.dia_vencimento,
        dataCompraStr,
      )
      const compEsperada = adicionarMesesCompetencia(cicloInicial.competencia, offsetParcela)
      const vencEsperado = calcularVencimentoFatura(
        contaCartao.dia_fechamento,
        contaCartao.dia_vencimento,
        compEsperada,
      )

      const currComp = oc.getString('competencia')
      const currDue = (oc.getString('data_vencimento') || '').slice(0, 10)

      let mudou = false
      if (currComp !== compEsperada) {
        oc.set('competencia', compEsperada)
        mudou = true
      }
      if (currDue !== vencEsperado) {
        oc.set('data_vencimento', vencEsperado + ' 12:00:00.000Z')
        mudou = true
      }

      if (mudou) {
        app.save(oc)
        ocorrenciasCorrigidas++

        // Sincroniza lançamento vinculado se houver
        const lancId = oc.getString('lancamento')
        if (lancId) {
          try {
            const l = app.findFirstRecordByData('lancamentos', 'id', lancId)
            if (l.getString('competencia') !== compEsperada) {
              l.set('competencia', compEsperada)
              app.save(l)
              lancamentosCorrigidos++
            }
          } catch (_) {}
        }
      }
    }

    console.log(
      '[Migration 0079] Varredura geral concluída: ' +
        ocorrenciasCorrigidas +
        ' ocorrência(s) e ' +
        lancamentosCorrigidos +
        ' lançamento(s) atualizados.',
    )
  },
  (app) => {
    // Rollback idempotente
  },
)
