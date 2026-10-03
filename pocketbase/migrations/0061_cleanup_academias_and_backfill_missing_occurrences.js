migrate(
  (app) => {
    // -------------------------------------------------------------
    // PARTE 1: Limpeza das 3 Academias fantasma
    // -------------------------------------------------------------
    // IDs das 3 Academias:
    // 1) w69dx6gqr8bipbs: mensal recorrente (paga em 2026-09)
    // 2) gsolfhsqnhviflf: mensal recorrente (paga em 2026-08)
    // 3) 39gzi5nucefnkcp: parcelado 12x (parcela 1 paga em 2026-09, 11 previstas 2026-10 -> 2027-08)
    // Registro j5wx4guexdfpzxd ("Taxa Academia" avulso) NÃO é tocado.

    const targetAcademiaIds = ['w69dx6gqr8bipbs', 'gsolfhsqnhviflf', '39gzi5nucefnkcp']

    let excluidasAcademia = 0
    let desativadasAcademia = 0

    // a) Excluir todas as ocorrências previstas (não pagas) desses 3 compromissos
    for (let i = 0; i < targetAcademiaIds.length; i++) {
      const compId = targetAcademiaIds[i]
      try {
        const ocorrenciasPrevistas = app.findRecordsByFilter(
          'despesas_ocorrencias',
          "compromisso = '" + compId + "' && status = 'prevista'",
          '',
          500,
          0,
        )

        for (let j = 0; j < ocorrenciasPrevistas.length; j++) {
          const oc = ocorrenciasPrevistas[j]
          // Confirmação de segurança: nunca excluir paga
          if (oc.getString('status') === 'prevista' && !oc.getString('data_pagamento')) {
            app.delete(oc)
            excluidasAcademia++
          }
        }
      } catch (err) {
        console.warn(
          'Migration 0061: Erro ao buscar/excluir previstas do compromisso ' + compId,
          err,
        )
      }

      // b) Desativar os 3 compromissos: ativo = false
      try {
        const compRec = app.findFirstRecordByData('despesas_compromisso', 'id', compId)
        if (compRec) {
          compRec.set('ativo', false)
          app.save(compRec)
          desativadasAcademia++
        }
      } catch (err) {
        console.warn('Migration 0061: Erro ao desativar compromisso ' + compId, err)
      }
    }

    console.log(
      'Migration 0061 [Item 1]: ' +
        desativadasAcademia +
        ' compromissos Academia desativados. ' +
        excluidasAcademia +
        ' ocorrências previstas excluídas.',
    )

    // c) Verificação de integridade pós-limpeza: garantir que os lançamentos das ocorrências pagas permanecem intactos
    for (let i = 0; i < targetAcademiaIds.length; i++) {
      const compId = targetAcademiaIds[i]
      const pagas = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = '" + compId + "' && status = 'paga'",
        '',
        50,
        0,
      )
      for (let p = 0; p < pagas.length; p++) {
        const lancId = pagas[p].getString('lancamento')
        if (lancId) {
          try {
            const lanc = app.findFirstRecordByData('lancamentos', 'id', lancId)
            if (!lanc) {
              console.warn(
                'Migration 0061: ALERTA - Lançamento ' +
                  lancId +
                  ' não encontrado para ocorrência ' +
                  pagas[p].id,
              )
            }
          } catch (e) {
            console.warn('Migration 0061: ALERTA - Falha ao verificar lançamento ' + lancId, e)
          }
        }
      }
    }

    // -------------------------------------------------------------
    // PARTE 2: Varredura dos demais afetados e preenchimento de meses futuros
    // -------------------------------------------------------------
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

    function calcularDataVencimentoNoMes(ano, mesZeroBased, dia) {
      const maxDias = getDaysInMonth(ano, mesZeroBased)
      const diaEfetivo = Math.min(Math.max(dia, 1), maxDias)
      return new Date(Date.UTC(ano, mesZeroBased, diaEfetivo, 12, 0, 0))
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
      const colOcorr = app.findCollectionByNameOrId('despesas_ocorrencias')
      const compromissosAtivos = app.findRecordsByFilter(
        'despesas_compromisso',
        'ativo = true',
        'created',
        500,
        0,
      )

      let ocorrenciasCriadasVarredura = 0

      // Competências da janela padrão: mês atual (2026-10) até +3 meses (2027-01)
      const now = new Date()
      const janelasFuturas = []
      const currY = now.getUTCFullYear()
      const currM = now.getUTCMonth()
      for (let offset = 0; offset <= 3; offset++) {
        janelasFuturas.push(formatYearMonth(currY, currM + offset))
      }

      for (let i = 0; i < compromissosAtivos.length; i++) {
        const comp = compromissosAtivos[i]
        const compId = comp.id
        const regra = comp.getString('regra_repeticao')
        const modalidade = comp.getString('modalidade_parcelamento')
        const totalParcelas = comp.getInt('total_parcelas') || 1
        const parcelaInicial = comp.getInt('parcela_inicial') || 1
        const isParcelado = modalidade === 'parcelado' || regra === 'parcelado'
        const isMensal = regra === 'mensal' && !isParcelado

        // Obter cartão de crédito se houver
        let cartao = null
        const contaComp = comp.getString('conta_padrao')
        if (contaComp) cartao = getContaCartao(contaComp)
        if (!cartao) {
          const metComp = comp.getString('metodo_pagamento')
          if (metComp) cartao = getContaFromMetodo(metComp)
        }

        const dataInicioStr = (
          comp.getString('data_inicio') ||
          comp.getString('created') ||
          ''
        ).slice(0, 10)
        const valorUnitario =
          comp.getFloat('valor_parcela') > 0
            ? comp.getFloat('valor_parcela')
            : comp.getFloat('valor_estimado')

        // Caso A: Parcelado com parcelas faltantes
        if (isParcelado && totalParcelas > 1) {
          if (cartao) {
            const parts = parseDateParts(dataInicioStr)
            for (let p = parcelaInicial; p <= totalParcelas; p++) {
              const offset = p - parcelaInicial
              const parcelaDate = calcularDataVencimentoNoMes(
                parts.year,
                parts.month + offset,
                parts.day,
              )
              const pDataIso =
                parcelaDate.getUTCFullYear() +
                '-' +
                String(parcelaDate.getUTCMonth() + 1).padStart(2, '0') +
                '-' +
                String(parcelaDate.getUTCDate()).padStart(2, '0')

              const ciclo = calcularFaturaCartao(
                cartao.dia_fechamento,
                cartao.dia_vencimento,
                pDataIso,
              )

              const exists = app.findRecordsByFilter(
                'despesas_ocorrencias',
                "compromisso = '" + compId + "' && numero_parcela = " + p,
                '',
                1,
                0,
              )
              if (exists.length === 0) {
                const nova = new Record(colOcorr)
                nova.set('compromisso', compId)
                nova.set('competencia', ciclo.competencia)
                nova.set('data_vencimento', ciclo.dataVencimento + ' 12:00:00.000Z')
                nova.set('valor_previsto', valorUnitario)
                nova.set('valor_estimado_original', valorUnitario)
                nova.set('status', 'prevista')
                nova.set('conta', cartao.id)
                nova.set('secao', comp.getString('secao'))
                nova.set('contexto_tipo', comp.getString('contexto_tipo') || 'pessoal')
                if (comp.getString('empresa')) nova.set('empresa', comp.getString('empresa'))
                if (comp.getString('tipo_dizimo'))
                  nova.set('tipo_dizimo', comp.getString('tipo_dizimo'))
                nova.set('dizimo', comp.getBool('dizimo'))
                nova.set('numero_parcela', p)
                nova.set('total_parcelas', totalParcelas)
                nova.set('valor_ajustado_manualmente', false)
                nova.set('observacoes', 'Parcela ' + p + '/' + totalParcelas)
                app.save(nova)
                ocorrenciasCriadasVarredura++
              }
            }
          } else {
            // Não-cartão parcelado
            const day = comp.getInt('dia_vencimento') || 10
            const parts = parseDateParts(dataInicioStr)
            for (let p = parcelaInicial; p <= totalParcelas; p++) {
              const offset = p - parcelaInicial
              const dueDate = calcularDataVencimentoNoMes(parts.year, parts.month + offset, day)
              const compStr = formatYearMonth(dueDate.getUTCFullYear(), dueDate.getUTCMonth())

              const exists = app.findRecordsByFilter(
                'despesas_ocorrencias',
                "compromisso = '" + compId + "' && numero_parcela = " + p,
                '',
                1,
                0,
              )
              if (exists.length === 0) {
                const nova = new Record(colOcorr)
                nova.set('compromisso', compId)
                nova.set('competencia', compStr)
                nova.set('data_vencimento', dueDate.toISOString())
                nova.set('valor_previsto', valorUnitario)
                nova.set('valor_estimado_original', valorUnitario)
                nova.set('status', 'prevista')
                if (comp.getString('conta_padrao'))
                  nova.set('conta', comp.getString('conta_padrao'))
                nova.set('secao', comp.getString('secao'))
                nova.set('contexto_tipo', comp.getString('contexto_tipo') || 'pessoal')
                if (comp.getString('empresa')) nova.set('empresa', comp.getString('empresa'))
                if (comp.getString('tipo_dizimo'))
                  nova.set('tipo_dizimo', comp.getString('tipo_dizimo'))
                nova.set('dizimo', comp.getBool('dizimo'))
                nova.set('numero_parcela', p)
                nova.set('total_parcelas', totalParcelas)
                nova.set('valor_ajustado_manualmente', false)
                nova.set('observacoes', 'Parcela ' + p + '/' + totalParcelas)
                app.save(nova)
                ocorrenciasCriadasVarredura++
              }
            }
          }
        }

        // Caso B: Mensal recorrente com meses futuros faltantes (janela padrão mês atual + 3 meses)
        if (isMensal) {
          if (cartao) {
            const cicloInicial = calcularFaturaCartao(
              cartao.dia_fechamento,
              cartao.dia_vencimento,
              dataInicioStr,
            )
            const startComp = cicloInicial.competencia

            for (let j = 0; j < janelasFuturas.length; j++) {
              const compStr = janelasFuturas[j]
              if (compStr < startComp) continue

              const exists = app.findRecordsByFilter(
                'despesas_ocorrencias',
                "compromisso = '" + compId + "' && competencia = '" + compStr + "'",
                '',
                1,
                0,
              )
              if (exists.length === 0) {
                const cParts = compStr.split('-')
                const cY = parseInt(cParts[0], 10)
                const cM = parseInt(cParts[1], 10) - 1
                const cicloComp = calcularFaturaCartao(
                  cartao.dia_fechamento,
                  cartao.dia_vencimento,
                  cY + '-' + String(cM + 1).padStart(2, '0') + '-01',
                )

                const nova = new Record(colOcorr)
                nova.set('compromisso', compId)
                nova.set('competencia', compStr)
                nova.set('data_vencimento', cicloComp.dataVencimento + ' 12:00:00.000Z')
                nova.set('valor_previsto', valorUnitario)
                nova.set('valor_estimado_original', valorUnitario)
                nova.set('status', 'prevista')
                nova.set('conta', cartao.id)
                nova.set('secao', comp.getString('secao'))
                nova.set('contexto_tipo', comp.getString('contexto_tipo') || 'pessoal')
                if (comp.getString('empresa')) nova.set('empresa', comp.getString('empresa'))
                if (comp.getString('tipo_dizimo'))
                  nova.set('tipo_dizimo', comp.getString('tipo_dizimo'))
                nova.set('dizimo', comp.getBool('dizimo'))
                nova.set('numero_parcela', 0)
                nova.set('total_parcelas', 0)
                nova.set('valor_ajustado_manualmente', false)
                if (comp.getString('observacoes'))
                  nova.set('observacoes', comp.getString('observacoes'))
                app.save(nova)
                ocorrenciasCriadasVarredura++
              }
            }
          } else {
            // Mensal não-cartão
            const startComp =
              dataInicioStr.length >= 7 ? dataInicioStr.slice(0, 7) : janelasFuturas[0]
            const day = comp.getInt('dia_vencimento') || 10

            for (let j = 0; j < janelasFuturas.length; j++) {
              const compStr = janelasFuturas[j]
              if (compStr < startComp) continue

              const exists = app.findRecordsByFilter(
                'despesas_ocorrencias',
                "compromisso = '" + compId + "' && competencia = '" + compStr + "'",
                '',
                1,
                0,
              )
              if (exists.length === 0) {
                const cParts = compStr.split('-')
                const cY = parseInt(cParts[0], 10)
                const cM = parseInt(cParts[1], 10) - 1
                const dueDate = calcularDataVencimentoNoMes(cY, cM, day)

                const nova = new Record(colOcorr)
                nova.set('compromisso', compId)
                nova.set('competencia', compStr)
                nova.set('data_vencimento', dueDate.toISOString())
                nova.set('valor_previsto', valorUnitario)
                nova.set('valor_estimado_original', valorUnitario)
                nova.set('status', 'prevista')
                if (comp.getString('conta_padrao'))
                  nova.set('conta', comp.getString('conta_padrao'))
                nova.set('secao', comp.getString('secao'))
                nova.set('contexto_tipo', comp.getString('contexto_tipo') || 'pessoal')
                if (comp.getString('empresa')) nova.set('empresa', comp.getString('empresa'))
                if (comp.getString('tipo_dizimo'))
                  nova.set('tipo_dizimo', comp.getString('tipo_dizimo'))
                nova.set('dizimo', comp.getBool('dizimo'))
                nova.set('numero_parcela', 0)
                nova.set('total_parcelas', 0)
                nova.set('valor_ajustado_manualmente', false)
                if (comp.getString('observacoes'))
                  nova.set('observacoes', comp.getString('observacoes'))
                app.save(nova)
                ocorrenciasCriadasVarredura++
              }
            }
          }
        }
      }

      console.log(
        'Migration 0061 [Item 2]: Varredura concluída. ' +
          ocorrenciasCriadasVarredura +
          ' ocorrências futuras faltantes criadas.',
      )
    } catch (errVarredura) {
      console.warn('Migration 0061: Erro na varredura:', errVarredura)
    }
  },
  (app) => {
    // Rollback não-destrutivo vazio
  },
)
