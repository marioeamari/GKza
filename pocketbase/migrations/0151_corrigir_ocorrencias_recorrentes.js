/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0151 — Correção de ocorrências de despesas recorrentes mensais.
 *
 * REGRA VIGENTE (protocolo do projeto): para compromisso recorrente mensal NÃO-cartão com
 * dia_vencimento D, cada ocorrência deve ter competência = mês da sequência (ex. 2026-11) e
 * vencimento = dia D do PRÓPRIO mês da competência (10/11 para 2026-11). O vencimento nunca
 * se desloca em relação à competência; meses não podem pular; a mesma competência não pode
 * ter duplicata.
 *
 * Padrão de desvio corrigido (detectado no compromisso "Honorários Contábeis" e "Internet
 * Fibra", ambos criados em 09/10/2026): duplicata de competência carregando o pagamento real
 * do mês seguinte (out/10 com data_pagamento 09/11), mês pulado (novembro inexistente) e
 * vencimentos deslocados +1 mês em relação à competência (2026-12 com venc 10/01, 2027-01
 * com venc 10/02).
 *
 * ALGORITMO (idempotente — rodar de novo não grava nada), por compromisso mensal ativo
 * NÃO-cartão (método de pagamento não é crédito; desvio de vencimento só é desvio fora do
 * ciclo de fatura):
 *   A) Duplicatas de mesma competência: fica a PRIMEIRA paga do grupo (ou, não havendo paga,
 *      a primeira criada); as demais pagas viram "movidas" (recebem o próximo mês faltante,
 *      preservando status/data_pagamento/valor/lancamento); as demais previstas são excluídas.
 *   B) Buracos na sequência (meses pulados): cada ocorrência "movida" de A preenche, em
 *      ordem, o próximo mês faltante entre a primeira e a última competência existentes.
 *   C) Desvio de vencimento: vencimento fora do mês da competência é regravado como dia D do
 *      próprio mês da competência.
 *   D) Buracos residuais: ocorrência PREVISTA (nunca paga) cuja competência está adiante do
 *      esperado é reetiquetada para fechar a sequência, mês a mês.
 *
 * GUARDA DE BAIXA (0.0.292, migração 0149): nenhuma escrita aqui altera status 'paga',
 * data_pagamento, valor_pago ou lancamento — apenas competência/data_vencimento de
 * ocorrências previstas, e o reencaixe de duplicatas pagas (que preserva todo o pagamento).
 */
migrate(
  (app) => {
    const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

    const proximoMes = (competencia) => {
      const parts = String(competencia || '').split('-')
      let y = parseInt(parts[0], 10)
      let m = parseInt(parts[1], 10)
      if (isNaN(y) || isNaN(m)) return null
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
      return y + '-' + pad2(m)
    }

    // Vencimento canônico: dia D do PRÓPRIO mês da competência (clamp no último dia do mês)
    const dataVencIso = (competencia, dia) => {
      const parts = String(competencia || '').split('-')
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      if (isNaN(y) || isNaN(m)) return ''
      const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const d = Math.min(Math.max(1, dia), ultimoDia)
      return competencia + '-' + pad2(d) + ' 12:00:00.000Z'
    }

    const isPaga = (oc) =>
      oc.getString('status') === 'paga' ||
      oc.getString('lancamento') !== '' ||
      oc.getString('data_pagamento') !== '' ||
      oc.getFloat('valor_pago') > 0

    // Espelha despesasService.obterContaCartaoCompromisso: só é "cartão" quando o método é
    // crédito; método explícito não-crédito (boleto/pix/débito) vence a conta tipo cartão.
    const isCompromissoCartao = (comp) => {
      const metodoId = comp.getString('metodo_pagamento')
      if (metodoId !== '') {
        try {
          const m = app.findRecordById('metodos_pagamento', metodoId)
          const tipo = (m.getString('tipo') || '').toLowerCase()
          const codigo = (m.getString('codigo') || '').toLowerCase()
          const nome = (m.getString('nome') || '').toLowerCase()
          if (nome.indexOf('débito') >= 0 || nome.indexOf('debito') >= 0) return false
          if (
            tipo.indexOf('credito') >= 0 ||
            tipo === 'cartao' ||
            codigo.indexOf('credito') >= 0 ||
            codigo === 'cartao_credito'
          ) {
            return true
          }
          return false
        } catch (e) {
          /* método inexistente: segue para a conta */
        }
      }
      const contaId = comp.getString('conta_padrao')
      if (contaId !== '') {
        try {
          const c = app.findRecordById('contas', contaId)
          const tipo = (c.getString('tipo') || '').toLowerCase()
          const fech = c.getInt('dia_fechamento')
          if (tipo === 'cartao' && fech > 0) return true
        } catch (e) {
          /* conta inexistente: trata como não-cartão */
        }
      }
      return false
    }

    const compromissos = app.findRecordsByFilter(
      'despesas_compromisso',
      "regra_repeticao = 'mensal' && ativo = true && dia_vencimento > 0",
      '-created',
      0,
      0,
    )

    for (const comp of compromissos) {
      const dia = Math.min(Math.max(1, comp.getInt('dia_vencimento')), 31)

      // Desvio de vencimento só é desvio fora do ciclo de fatura (compromissos não-cartão)
      if (isCompromissoCartao(comp)) continue

      // Ordenado por created: em cada grupo de competência, "a primeira criada" é a [0]
      const ocsAll = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = '" + comp.id + "'",
        'created',
        0,
        0,
      )
      if (ocsAll.length === 0) continue

      // ---------- PASSO A: duplicatas de mesma competência ----------
      const porCompetencia = {}
      const ordem = []
      const deletados = {}
      for (const oc of ocsAll) {
        const c = oc.getString('competencia')
        if (!c) continue
        if (!porCompetencia[c]) {
          porCompetencia[c] = []
          ordem.push(c)
        }
        porCompetencia[c].push(oc)
      }
      const movidas = []
      for (const c of ordem) {
        const grupo = porCompetencia[c]
        if (grupo.length <= 1) continue
        let idxPrimaria = -1
        for (let i = 0; i < grupo.length; i++) {
          if (isPaga(grupo[i])) {
            idxPrimaria = i
            break
          }
        }
        if (idxPrimaria === -1) idxPrimaria = 0
        for (let i = 0; i < grupo.length; i++) {
          if (i === idxPrimaria) continue
          const dup = grupo[i]
          if (isPaga(dup)) {
            movidas.push(dup) // pagamento real preservado; recebe um mês faltante no PASSO B
          } else {
            deletados[dup.id] = true
            app.delete(dup)
          }
        }
      }

      // ---------- PASSO B: buracos na sequência preenchidos pelas duplicatas movidas ----------
      if (movidas.length > 0) {
        const vivos = ocsAll.filter((oc) => !deletados[oc.id] && movidas.indexOf(oc) === -1)
        const mesesVivos = vivos
          .map((o) => o.getString('competencia'))
          .filter((c) => c && c.length >= 7)
          .sort()
        if (mesesVivos.length > 0) {
          const mesInicio = mesesVivos[0]
          const mesFim = mesesVivos[mesesVivos.length - 1]
          let cursor = mesInicio
          while (cursor && cursor <= mesFim && movidas.length > 0) {
            if (mesesVivos.indexOf(cursor) === -1) {
              const oc = movidas.shift()
              oc.set('competencia', cursor)
              oc.set('data_vencimento', dataVencIso(cursor, dia))
              app.save(oc)
              mesesVivos.push(cursor)
              mesesVivos.sort()
            }
            cursor = proximoMes(cursor)
          }
        }
      }

      // ---------- PASSO C: desvio de vencimento (mês do vencimento != mês da competência) ----------
      const vivosFinais = ocsAll.filter((oc) => !deletados[oc.id] && movidas.indexOf(oc) === -1)
      for (const oc of vivosFinais) {
        const c = oc.getString('competencia')
        if (!c || c.length < 7) continue
        const venc = (oc.getString('data_vencimento') || '').slice(0, 10)
        if (!venc) continue
        if (venc.slice(0, 7) === c) continue
        oc.set('data_vencimento', dataVencIso(c, dia))
        app.save(oc)
      }

      // ---------- PASSO D: buracos residuais — reetiquetar previstas adiante do esperado ----------
      const finais = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = '" + comp.id + "'",
        'competencia',
        0,
        0,
      )
      let anchor = null
      for (const oc of finais) {
        const c = oc.getString('competencia')
        if (!c || c.length < 7) continue
        if (!anchor) {
          anchor = c
          continue
        }
        const esperado = proximoMes(anchor)
        if (!esperado) continue
        if (c === esperado) {
          anchor = c
          continue
        }
        if (c > esperado && !isPaga(oc)) {
          oc.set('competencia', esperado)
          oc.set('data_vencimento', dataVencIso(esperado, dia))
          app.save(oc)
          anchor = esperado
        } else {
          // paga ou fora de ordem: histórico preservado (guarda de baixa 0.0.292)
          anchor = c
        }
      }
    }
  },
  // Reverso: reparo de dados não é reversível — no-op seguro
  (app) => {},
)
