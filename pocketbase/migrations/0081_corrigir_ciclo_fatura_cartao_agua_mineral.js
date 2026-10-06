migrate(
  (app) => {
    // Migração 0081: Corrigir de vez o ciclo da fatura no cartão de crédito
    // Caso concreto reproduzido: Água mineral (compromisso si46xliwu06dlkv, compra 17/09, NuBank sglo7dfsqvgfsni)
    // Fechamento dia 16, Vencimento dia 23. Compra 17/09 > 16 -> Fatura 2026-10, Vencimento 2026-10-23
    // E varredura geral para ocorrências de cartão cujo ciclo de fatura divergir da regra única.

    function parseDateParts(dateStr) {
      if (!dateStr) {
        const now = new Date()
        return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() }
      }
      const clean = String(dateStr).slice(0, 10)
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
      const rawF = Number(diaFechamento)
      const rawV = Number(diaVencimento)
      const dFech = !isNaN(rawF) && rawF > 0 ? rawF : 10
      const dVenc = !isNaN(rawV) && rawV > 0 ? rawV : 20

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
      const rawF = Number(diaFechamento)
      const rawV = Number(diaVencimento)
      const dFech = !isNaN(rawF) && rawF > 0 ? rawF : 10
      const dVenc = !isNaN(rawV) && rawV > 0 ? rawV : 20

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

        // Coerção robusta: Number() tratando string e number
        const diaFech = Number(c.get('dia_fechamento'))
        const diaVenc = Number(c.get('dia_vencimento'))

        if (aceitaCredito && !isNaN(diaFech) && diaFech > 0) {
          cartaoCache[contaId] = {
            id: c.id,
            dia_fechamento: diaFech,
            dia_vencimento: !isNaN(diaVenc) && diaVenc > 0 ? diaVenc : 20,
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
    // PARTE 1: CASO CONCRETO - Água mineral (comp: si46xliwu06dlkv)
    // =========================================================================
    console.log('[Migration 0081] Ajustando caso concreto Água mineral (si46xliwu06dlkv)...')
    try {
      const compAgua = app.findFirstRecordByData('despesas_compromisso', 'id', 'si46xliwu06dlkv')
      if (compAgua) {
        if (compAgua.getInt('dia_vencimento') !== 23) {
          compAgua.set('dia_vencimento', 23)
          app.save(compAgua)
        }
      }
    } catch (e) {
      console.log('[Migration 0081] Compromisso si46xliwu06dlkv não encontrado: ' + e)
    }

    // Ocorrência nx6cjmut1hgbpiw
    try {
      const ocAgua = app.findFirstRecordByData('despesas_ocorrencias', 'id', 'nx6cjmut1hgbpiw')
      if (ocAgua) {
        ocAgua.set('competencia', '2026-10')
        ocAgua.set('data_vencimento', '2026-10-23 12:00:00.000Z')
        // Preserva status de pagamento, data_pagamento e valor_pago
        app.save(ocAgua)
        console.log(
          '[Migration 0081] Ocorrência nx6cjmut1hgbpiw atualizada para 2026-10 e venc 2026-10-23.',
        )
      }
    } catch (e) {
      console.log('[Migration 0081] Ocorrência nx6cjmut1hgbpiw não encontrada: ' + e)
    }

    // Lançamento 2g655iwhh3klyq5
    try {
      const lancAgua = app.findFirstRecordByData('lancamentos', 'id', '2g655iwhh3klyq5')
      if (lancAgua) {
        lancAgua.set('competencia', '2026-10')
        // Se a conta for cartão, fatura_paga permanece false até a fatura ser baixada
        app.save(lancAgua)
        console.log(
          '[Migration 0081] Lançamento 2g655iwhh3klyq5 atualizado para competência 2026-10.',
        )
      }
    } catch (e) {
      console.log('[Migration 0081] Lançamento 2g655iwhh3klyq5 não encontrado: ' + e)
    }

    // =========================================================================
    // PARTE 2: VARREDURA IDEMPOTENTE PARA TODAS AS OCORRÊNCIAS DE CARTÃO
    // =========================================================================
    console.log('[Migration 0081] Iniciando varredura geral de cartão...')
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

      let contaId = oc.getString('conta') || (comp ? comp.getString('conta_padrao') : '')
      const metodoId = comp ? comp.getString('metodo_pagamento') : ''

      let contaCartao = null
      if (contaId) {
        contaCartao = getContaCartao(contaId)
      }

      // Se a conta tem fechamento e é cartão/aceita crédito,
      // consideramos crédito a menos que o método de pagamento diga explicitamente que NÃO é crédito (ex: Débito, Pix, Boleto)
      let ehCredito = false
      if (contaCartao) {
        if (metodoId) {
          ehCredito = isMetodoCredito(metodoId)
        } else {
          ehCredito = true
        }
      }

      if (!ehCredito || !contaCartao) {
        continue
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
      '[Migration 0081] Varredura concluída: ' +
        ocorrenciasCorrigidas +
        ' ocorrência(s) e ' +
        lancamentosCorrigidos +
        ' lançamento(s) sincronizados com sucesso.',
    )
  },
  (app) => {
    // Rollback idempotente
  },
)
