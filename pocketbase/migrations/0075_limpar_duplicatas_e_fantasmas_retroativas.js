migrate(
  (app) => {
    // Migração 0075: Limpar ocorrências atrasadas fantasma e duplicatas idênticas
    // ERP GKza - Idempotente

    // =========================================================================
    // PARTE 1: Excluir ocorrências fantasma retroativas
    // =========================================================================
    // Critérios:
    // 1. Ocorrências com competência < mês de criação do compromisso (competencia < substr(c.created, 1, 7))
    // 2. Sem pagamento: status = 'prevista'
    // 3. Sem valor pago: (valor_pago IS NULL OR valor_pago = 0)
    // 4. Sem data de pagamento: (data_pagamento IS NULL OR data_pagamento = '')
    // 5. Sem lançamento financeiro vinculado: (lancamento IS NULL OR lancamento = '')
    // NUNCA tocar em ocorrências pagas/parciais nem com lançamento vinculado!

    const fantasmas = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "status = 'prevista' && (lancamento = '' || lancamento = null) && (data_pagamento = '' || data_pagamento = null) && (valor_pago = 0 || valor_pago = null)",
      'created',
      5000,
      0,
    )

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

    let totalRetroativasExcluidas = 0
    const retroativasDetalhes = []

    for (let i = 0; i < fantasmas.length; i++) {
      const oc = fantasmas[i]
      const compId = oc.getString('compromisso')
      const comp = compId ? getCompromisso(compId) : null
      if (!comp) continue

      const compCreated = comp.getString('created')
      if (!compCreated || compCreated.length < 7) continue

      const compCreatedMonth = compCreated.slice(0, 7)
      const ocCompetencia = oc.getString('competencia')

      // Se a competência é anterior ao mês em que o compromisso foi criado
      if (ocCompetencia && ocCompetencia < compCreatedMonth) {
        const descComp = comp.getString('descricao')
        retroativasDetalhes.push({
          id: oc.id,
          compromisso: descComp,
          competencia: ocCompetencia,
          valor: oc.getFloat('valor_previsto'),
        })
        app.delete(oc)
        totalRetroativasExcluidas++
      }
    }

    console.log(
      '[Migration 0075 - Parte 1] Ocorrências retroativas excluídas: ' + totalRetroativasExcluidas,
    )
    for (let r = 0; r < Math.min(retroativasDetalhes.length, 10); r++) {
      console.log(
        '  - ' +
          retroativasDetalhes[r].compromisso +
          ' (' +
          retroativasDetalhes[r].competencia +
          ') R$ ' +
          retroativasDetalhes[r].valor,
      )
    }

    // =========================================================================
    // PARTE 2: Excluir duplicatas idênticas
    // =========================================================================
    // Critérios:
    // Ocorrências do mesmo compromisso com:
    // - mesma competência
    // - mesmo numero_parcela (ex: 0 ou 1)
    // - mesmo valor_previsto (com tolerância centesimal)
    // Regra de preservação:
    // - Manter SEMPRE a cópia mais antiga (menor created) OU se uma já estiver paga/vinculada a lancamento,
    //   priorizar a que estiver paga/com lancamento sobre a pendente/prevista.
    // - Se houver cópias adicionais 'prevista' idênticas, deletar as posteriores.
    // - NUNCA deletar ocorrência com lancamento vinculado ou status 'paga' se for a única paga.
    // - Idempotente: se já não houver duplicatas, nada é excluído.

    // Consulta todas as ocorrências restantes agrupadas por compromisso
    const todasOcorrencias = app.findRecordsByFilter(
      'despesas_ocorrencias',
      'id != ""',
      'created',
      10000,
      0,
    )

    // Agrupa por chave: compromisso + '__' + competencia + '__' + numero_parcela + '__' + valor_previsto_arredondado
    const grupos = {}
    for (let j = 0; j < todasOcorrencias.length; j++) {
      const oc = todasOcorrencias[j]
      const compId = oc.getString('compromisso')
      const comp = oc.getString('competencia')
      const numParc = oc.getInt('numero_parcela') || 0
      const valorPrev = Math.round(oc.getFloat('valor_previsto') * 100)

      const key = compId + '__' + comp + '__' + numParc + '__' + valorPrev
      if (!grupos[key]) {
        grupos[key] = []
      }
      grupos[key].push(oc)
    }

    let totalDuplicatasExcluidas = 0
    const duplicatasDetalhes = []

    const chaves = Object.keys(grupos)
    for (let k = 0; k < chaves.length; k++) {
      const lista = grupos[chaves[k]]
      if (lista.length <= 1) continue

      // Temos 2 ou mais ocorrências idênticas no mesmo ciclo para o mesmo compromisso.
      // Escolhemos qual MANTER:
      // 1º critério: se houver alguma com lancamento vinculado ou status 'paga', prioriza essa.
      // 2º critério: menor created (mais antiga).
      lista.sort((a, b) => {
        const aTemLanc = !!a.getString('lancamento') || a.getString('status') === 'paga'
        const bTemLanc = !!b.getString('lancamento') || b.getString('status') === 'paga'
        if (aTemLanc && !bTemLanc) return -1
        if (!aTemLanc && bTemLanc) return 1

        const aCreated = a.getString('created') || ''
        const bCreated = b.getString('created') || ''
        if (aCreated < bCreated) return -1
        if (aCreated > bCreated) return 1
        return 0
      })

      // O elemento lista[0] é preservado!
      // Os demais são candidatos a exclusão.
      // Apenas exclui cópias que:
      // - status = 'prevista'
      // - lancamento IS NULL OR lancamento = ''
      // - data_pagamento IS NULL OR data_pagamento = ''
      // - valor_pago = 0 ou NULL
      for (let d = 1; d < lista.length; d++) {
        const dup = lista[d]
        const st = dup.getString('status')
        const lanc = dup.getString('lancamento')
        const dp = dup.getString('data_pagamento')
        const vp = dup.getFloat('valor_pago')

        if (st === 'prevista' && !lanc && !dp && (!vp || vp === 0)) {
          const comp = getCompromisso(dup.getString('compromisso'))
          const descComp = comp ? comp.getString('descricao') : dup.getString('compromisso')
          duplicatasDetalhes.push({
            id: dup.id,
            compromisso: descComp,
            competencia: dup.getString('competencia'),
            valor: dup.getFloat('valor_previsto'),
            created: dup.getString('created'),
          })
          app.delete(dup)
          totalDuplicatasExcluidas++
        }
      }
    }

    console.log(
      '[Migration 0075 - Parte 2] Duplicatas idênticas excluídas: ' + totalDuplicatasExcluidas,
    )
    for (let d = 0; d < Math.min(duplicatasDetalhes.length, 10); d++) {
      console.log(
        '  - ' +
          duplicatasDetalhes[d].compromisso +
          ' (' +
          duplicatasDetalhes[d].competencia +
          ') R$ ' +
          duplicatasDetalhes[d].valor +
          ' [created: ' +
          duplicatasDetalhes[d].created +
          ']',
      )
    }

    console.log(
      '[Migration 0075] Finalizada. Total retroativas: ' +
        totalRetroativasExcluidas +
        ', Total duplicatas: ' +
        totalDuplicatasExcluidas,
    )
  },
  (app) => {
    // Rollback não aplicável para limpeza idempotente
  },
)
