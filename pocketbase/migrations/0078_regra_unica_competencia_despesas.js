migrate(
  (app) => {
    // Migração 0078: Aplicar REGRA ÚNICA de competência e vencimento
    // 1. Caso prioritário: Consolidar "Curso Batera" (compromisso wds1nu8ll93rs09)
    // 2. Varredura geral idempotente para todas as ocorrências e lançamentos vinculados

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
    // PARTE 1: CASO PRIORITÁRIO - "CURSO BATERA" (wds1nu8ll93rs09)
    // =========================================================================
    console.log('[Migration 0078] Iniciando tratamento prioritário Curso Batera...')
    let cursoComp = null
    try {
      cursoComp = app.findFirstRecordByData('despesas_compromisso', 'id', 'wds1nu8ll93rs09')
    } catch (_) {
      console.log('[Migration 0078] Compromisso Curso Batera não encontrado.')
    }

    if (cursoComp) {
      // Garante total_parcelas = 4 no compromisso
      if (cursoComp.getInt('total_parcelas') !== 4) {
        cursoComp.set('total_parcelas', 4)
        app.save(cursoComp)
      }

      // Busca ocorrências atuais do Curso Batera
      const ocorrenciasCurso = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = 'wds1nu8ll93rs09'",
        'created',
        50,
        0,
      )

      console.log(
        '[Migration 0078] Curso Batera tem ' + ocorrenciasCurso.length + ' ocorrências atuais.',
      )

      // Identifica os registros chave:
      // g09zay08v2pjoaz (1/4 paga, 72.09, lancamento tjkmw7md1q9fkzi)
      // ni7mavolilf7pfs (1/3 paga, lancamento 4y3z6tw3463wpa7)
      // prv4qmeppk5nh58 (2/3 paga, lancamento ldcs455oexufhvp)
      // hq5sk40qg7jb78s (3/3 prevista, sem lancamento)
      let ocG09 = null
      let ocNi7 = null
      let ocPrv = null
      let ocHq5 = null
      const outros = []

      for (let i = 0; i < ocorrenciasCurso.length; i++) {
        const o = ocorrenciasCurso[i]
        if (o.id === 'g09zay08v2pjoaz') ocG09 = o
        else if (o.id === 'ni7mavolilf7pfs') ocNi7 = o
        else if (o.id === 'prv4qmeppk5nh58') ocPrv = o
        else if (o.id === 'hq5sk40qg7jb78s') ocHq5 = o
        else outros.push(o)
      }

      // 4 parcelas esperadas para compra em 17/09/2026 (após fechamento dia 16):
      // Ciclo 1 = Fatura Outubro (2026-10), Vencimento 2026-10-23
      // Ciclo 2 = Fatura Novembro (2026-11), Vencimento 2026-11-23
      // Ciclo 3 = Fatura Dezembro (2026-12), Vencimento 2026-12-23
      // Ciclo 4 = Fatura Janeiro (2027-01), Vencimento 2027-01-23

      // Parcela 1 -> Usar g09zay08v2pjoaz (já tem total_parcelas 4 e lançamento vinculado tjkmw7md1q9fkzi)
      if (ocG09) {
        ocG09.set('competencia', '2026-10')
        ocG09.set('data_vencimento', '2026-10-23 12:00:00.000Z')
        ocG09.set('numero_parcela', 1)
        ocG09.set('total_parcelas', 4)
        ocG09.set('observacoes', 'Parcela 1/4')
        app.save(ocG09)

        const lancId = ocG09.getString('lancamento')
        if (lancId) {
          try {
            const l = app.findFirstRecordByData('lancamentos', 'id', lancId)
            l.set('competencia', '2026-10')
            l.set('data', '2026-09-17 12:00:00.000Z')
            app.save(l)
          } catch (_) {}
        }
      }

      // Parcela 2 -> Usar prv4qmeppk5nh58 (paga, lançamento ldcs455oexufhvp) -> alinhar para parcela 2/4 em 2026-11
      if (ocPrv) {
        ocPrv.set('competencia', '2026-11')
        ocPrv.set('data_vencimento', '2026-11-23 12:00:00.000Z')
        ocPrv.set('numero_parcela', 2)
        ocPrv.set('total_parcelas', 4)
        ocPrv.set('observacoes', 'Parcela 2/4')
        app.save(ocPrv)

        const lancId = ocPrv.getString('lancamento')
        if (lancId) {
          try {
            const l = app.findFirstRecordByData('lancamentos', 'id', lancId)
            l.set('competencia', '2026-11')
            app.save(l)
          } catch (_) {}
        }
      }

      // Parcela 3 -> Usar hq5sk40qg7jb78s (se prevista) ou ni7mavolilf7pfs
      // Note que ni7mavolilf7pfs estava paga (parc 1/3 anterior com data_pag 16/08) e hq5sk40qg7jb78s estava prevista (parc 3/3 em 2026-12).
      // Vamos verificar: se ni7mavolilf7pfs tem lançamento pago histórico (4y3z6tw3463wpa7), vamos preservá-lo!
      // Podemos alinhar ni7mavolilf7pfs para Parcela 3/4 (competência 2026-12, venc 2026-12-23),
      // e excluir hq5sk40qg7jb78s que é redundante e NÃO paga!
      if (ocNi7 && ocNi7.getString('status') === 'paga') {
        ocNi7.set('competencia', '2026-12')
        ocNi7.set('data_vencimento', '2026-12-23 12:00:00.000Z')
        ocNi7.set('numero_parcela', 3)
        ocNi7.set('total_parcelas', 4)
        ocNi7.set('observacoes', 'Parcela 3/4')
        app.save(ocNi7)

        const lancId = ocNi7.getString('lancamento')
        if (lancId) {
          try {
            const l = app.findFirstRecordByData('lancamentos', 'id', lancId)
            l.set('competencia', '2026-12')
            app.save(l)
          } catch (_) {}
        }

        // Como ni7 virou a parcela 3/4 paga, a ocorrência hq5 (prevista) torna-se redundante e pode ser removida
        if (ocHq5 && ocHq5.getString('status') === 'prevista' && !ocHq5.getString('lancamento')) {
          try {
            app.delete(ocHq5)
            console.log('[Migration 0078] Ocorrência redundante prevista hq5sk40qg7jb78s removida.')
          } catch (_) {}
        }
      } else if (ocHq5) {
        // Se ni7 não estava paga ou não existia, usa hq5 como parcela 3
        ocHq5.set('competencia', '2026-12')
        ocHq5.set('data_vencimento', '2026-12-23 12:00:00.000Z')
        ocHq5.set('numero_parcela', 3)
        ocHq5.set('total_parcelas', 4)
        ocHq5.set('observacoes', 'Parcela 3/4')
        app.save(ocHq5)
      }

      // Parcela 4 -> Verificar se já existe parcela 4 de Curso Batera; se não existir, criar como prevista!
      const parc4Check = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = 'wds1nu8ll93rs09' && numero_parcela = 4",
        'created',
        1,
        0,
      )

      if (parc4Check.length === 0) {
        const oCollection = app.findCollectionByNameOrId('despesas_ocorrencias')
        try {
          const rec4 = new Record(oCollection)
          rec4.set('compromisso', 'wds1nu8ll93rs09')
          rec4.set('contexto_tipo', 'pessoal')
          rec4.set('secao', 'cartoes_credito')
          rec4.set('conta', 'sglo7dfsqvgfsni')
          rec4.set('competencia', '2027-01')
          rec4.set('numero_parcela', 4)
          rec4.set('total_parcelas', 4)
          rec4.set('data_vencimento', '2027-01-23 12:00:00.000Z')
          rec4.set('valor_previsto', 72.09)
          rec4.set('valor_estimado_original', 72.09)
          rec4.set('valor_ajustado_manualmente', false)
          rec4.set('status', 'prevista')
          rec4.set('dizimo', true)
          rec4.set('tipo_dizimo', 'axfa8uor4q9jyzm')
          rec4.set('dizimo_percentual', 100)
          rec4.set('observacoes', 'Parcela 4/4')
          app.save(rec4)
          console.log('[Migration 0078] Parcela 4/4 criada com sucesso (2027-01, venc 2027-01-23).')
        } catch (e) {
          console.log('[Migration 0078] Erro ao criar parcela 4 via new Record: ' + e)
        }
      }

      // Limpar outras ocorrências redundantes não pagas se houver
      for (let i = 0; i < outros.length; i++) {
        const o = outros[i]
        if (o.getString('status') === 'prevista' && !o.getString('lancamento')) {
          try {
            app.delete(o)
          } catch (_) {}
        }
      }
    }

    // =========================================================================
    // PARTE 2: VARREDURA GERAL IDEMPOTENTE
    // =========================================================================
    console.log('[Migration 0078] Iniciando varredura geral para alinhamento à regra única...')

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

      // Ignora Curso Batera aqui pois já foi tratado minuciosamente acima
      if (compId === 'wds1nu8ll93rs09') {
        continue
      }

      // Determina conta e se o método é crédito
      let contaId = oc.getString('conta') || (comp ? comp.getString('conta_padrao') : '')
      const metodoId = comp ? comp.getString('metodo_pagamento') : ''

      let contaCartao = null
      if (contaId) {
        contaCartao = getContaCartao(contaId)
      }

      // REGRA: Apenas é cartão se conta for aceita crédito E método for crédito (ou sem método explícito mas conta cartão)
      const ehCredito = contaCartao !== null && (metodoId ? isMetodoCredito(metodoId) : true)

      // Data base da compra (fonte de verdade: data_inicio do compromisso ou created)
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
      const diaVencComp = comp ? comp.getInt('dia_vencimento') : 0

      let compEsperada = ''
      let vencEsperado = ''

      if (ehCredito && contaCartao) {
        // Regra 2: Crédito -> ciclo da fatura
        const cicloInicial = calcularCicloFatura(
          contaCartao.dia_fechamento,
          contaCartao.dia_vencimento,
          dataCompraStr,
        )
        compEsperada = adicionarMesesCompetencia(cicloInicial.competencia, offsetParcela)
        vencEsperado = calcularVencimentoFatura(
          contaCartao.dia_fechamento,
          contaCartao.dia_vencimento,
          compEsperada,
        )
      } else {
        // Regra 1: Não-cartão -> competência = mês da compra + offsetParcela
        const parts = parseDateParts(dataCompraStr)
        compEsperada = formatYearMonth(parts.year, parts.month + offsetParcela)

        const cParts = compEsperada.split('-')
        const cYear = parseInt(cParts[0], 10)
        const cMonth = parseInt(cParts[1], 10) - 1
        const maxDias = getDaysInMonth(cYear, cMonth)
        const diaDesejado = diaVencComp > 0 ? diaVencComp : parts.day || 10
        const realDia = Math.min(diaDesejado, maxDias)
        vencEsperado =
          cYear + '-' + String(cMonth + 1).padStart(2, '0') + '-' + String(realDia).padStart(2, '0')
      }

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
      '[Migration 0078] Varredura geral concluída: ' +
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
