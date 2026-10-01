migrate(
  (app) => {
    // 1. Ocorrência 9uhzn014f6chvnr: se competencia === '2026-10', setar competencia '2026-09' e data_vencimento '2026-09-20 12:00:00.000Z'
    // (manter status paga, data_pagamento 2026-08-23, lancamento pol25cwue19jh5w intactos).
    try {
      const oc9 = app.findFirstRecordByData('despesas_ocorrencias', 'id', '9uhzn014f6chvnr')
      if (oc9 && oc9.getString('competencia') === '2026-10') {
        oc9.set('competencia', '2026-09')
        oc9.set('data_vencimento', '2026-09-20 12:00:00.000Z')
        app.save(oc9)
        console.log(
          'Migration 0055: Ocorrência 9uhzn014f6chvnr atualizada para competencia 2026-09.',
        )
      }
    } catch (e) {
      console.warn('Migration 0055: Ocorrência 9uhzn014f6chvnr não encontrada:', e)
    }

    // 2. Criar ocorrência prevista 2026-10 do compromisso ut69fgi9s7r25b2 se não existir:
    // competencia '2026-10', data_vencimento '2026-10-20 12:00:00.000Z', valor_previsto 49,
    // valor_estimado_original 49, status 'prevista', conta 40iihpvg0n66ezh, secao 'cartoes_credito',
    // contexto_tipo 'pessoal', tipo_dizimo axfa8uor4q9jyzm, dizimo true, numero_parcela 0,
    // total_parcelas 0, valor_ajustado_manualmente false.
    try {
      const existingOct = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = 'ut69fgi9s7r25b2' && competencia = '2026-10'",
        '',
        1,
        0,
      )

      if (existingOct.length === 0) {
        const colOcorr = app.findCollectionByNameOrId('despesas_ocorrencias')
        const novaOc = new Record(colOcorr)
        novaOc.set('compromisso', 'ut69fgi9s7r25b2')
        novaOc.set('competencia', '2026-10')
        novaOc.set('data_vencimento', '2026-10-20 12:00:00.000Z')
        novaOc.set('valor_previsto', 49)
        novaOc.set('valor_estimado_original', 49)
        novaOc.set('status', 'prevista')
        novaOc.set('conta', '40iihpvg0n66ezh')
        novaOc.set('secao', 'cartoes_credito')
        novaOc.set('contexto_tipo', 'pessoal')
        novaOc.set('tipo_dizimo', 'axfa8uor4q9jyzm')
        novaOc.set('dizimo', true)
        novaOc.set('numero_parcela', 0)
        novaOc.set('total_parcelas', 0)
        novaOc.set('valor_ajustado_manualmente', false)
        app.save(novaOc)
        console.log('Migration 0055: Criada ocorrência prevista 2026-10 para ut69fgi9s7r25b2.')
      }
    } catch (e) {
      console.warn('Migration 0055: Erro ao criar ocorrência 2026-10 para ut69fgi9s7r25b2:', e)
    }

    // 3. Caso geral: para compromissos de cartão com data_inicio retroativa,
    // garantir a ocorrência do ciclo inicial sem tocar nas demais pagas.
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

    try {
      const compromissos = app.findRecordsByFilter(
        'despesas_compromisso',
        "secao = 'cartoes_credito' && ativo = true",
        'created',
        500,
        0,
      )

      const colOcorr = app.findCollectionByNameOrId('despesas_ocorrencias')
      let criadasGerais = 0

      for (let i = 0; i < compromissos.length; i++) {
        const comp = compromissos[i]
        const dataInicio = comp.getString('data_inicio')
        if (!dataInicio || dataInicio.length < 10) continue

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
        if (!cartao) continue

        const dataInicioStr = dataInicio.slice(0, 10)
        const cicloInicial = calcularFaturaCartao(
          cartao.dia_fechamento,
          cartao.dia_vencimento,
          dataInicioStr,
        )

        // Verifica se já existe ocorrência (prevista ou paga) para a competência inicial
        const existentes = app.findRecordsByFilter(
          'despesas_ocorrencias',
          "compromisso = '" + comp.id + "' && competencia = '" + cicloInicial.competencia + "'",
          '',
          1,
          0,
        )

        if (existentes.length === 0) {
          const valor =
            comp.getInt('valor_parcela') > 0
              ? comp.getInt('valor_parcela')
              : comp.getInt('valor_estimado')

          const nova = new Record(colOcorr)
          nova.set('compromisso', comp.id)
          nova.set('competencia', cicloInicial.competencia)
          nova.set('data_vencimento', cicloInicial.dataVencimento + ' 12:00:00.000Z')
          nova.set('valor_previsto', valor)
          nova.set('valor_estimado_original', valor)
          nova.set('status', 'prevista')
          nova.set('conta', cartao.id)
          nova.set('secao', 'cartoes_credito')
          nova.set('contexto_tipo', comp.getString('contexto_tipo') || 'pessoal')
          if (comp.getString('empresa')) nova.set('empresa', comp.getString('empresa'))
          if (comp.getString('tipo_dizimo')) nova.set('tipo_dizimo', comp.getString('tipo_dizimo'))
          nova.set('dizimo', comp.getBool('dizimo'))
          nova.set('numero_parcela', 0)
          nova.set('total_parcelas', 0)
          nova.set('valor_ajustado_manualmente', false)
          app.save(nova)
          criadasGerais++
        }
      }

      console.log(
        'Migration 0055: ' +
          criadasGerais +
          ' ocorrência(s) de ciclo inicial criadas no caso geral.',
      )
    } catch (errGeral) {
      console.warn('Migration 0055: Erro no caso geral:', errGeral)
    }
  },
  (app) => {
    // Rollback vazio conforme padrão
  },
)
