migrate(
  (app) => {
    // Migration 0100: Corrigir regra de datas no pipeline de despesas
    // A escolha entre "mês da compra" e "ciclo da fatura" deve ler o MÉTODO DO COMPROMISSO (metodo_pagamento).
    // Ocorrências e lançamentos com método não-crédito (ex: Pix, Débito, Boleto, Dinheiro, etc.) em contas
    // que receberam indevidamente data de fatura futura -> recalcular data_pagamento, data e competência
    // para a data/mês da compra real e status 'pago' / 'paga'.

    // 1. Mapear métodos de pagamento
    const metodos = app.findRecordsByFilter('metodos_pagamento', '', 'created', 200, 0)
    const metodosCreditoSet = new Set()
    for (const m of metodos) {
      const codigo = (m.getString('codigo') || '').toLowerCase().trim()
      const nome = (m.getString('nome') || '').toLowerCase().trim()
      const tipo = (m.getString('tipo') || '').toLowerCase().trim()

      if (nome.includes('débito') || nome.includes('debito') || codigo.includes('debito')) {
        continue
      }
      if (
        codigo === 'credito' ||
        codigo === 'cartao_credito' ||
        codigo === 'cartao-credito' ||
        codigo === 'cartaocredito' ||
        nome.includes('crédito') ||
        nome.includes('credito') ||
        tipo === 'credito' ||
        (tipo === 'cartao' && !nome.includes('debito'))
      ) {
        metodosCreditoSet.add(m.id)
      }
    }

    // 2. Mapear compromissos
    const compromissos = app.findRecordsByFilter('despesas_compromisso', '', 'created', 5000, 0)
    const compromissosMap = new Map()
    for (const c of compromissos) {
      compromissosMap.set(c.id, {
        id: c.id,
        metodoPagamentoId: c.getString('metodo_pagamento') || '',
        dataInicio: c.getString('data_inicio') || '',
        diaVencimento: c.getInt('dia_vencimento') || 10,
        descricao: c.getString('descricao') || '',
      })
    }

    // 3. Buscar todas as ocorrências
    const ocorrencias = app.findRecordsByFilter('despesas_ocorrencias', '', 'created', 5000, 0)
    let ocorrenciasCorrigidas = 0
    let lancamentosCorrigidos = 0

    for (const oc of ocorrencias) {
      const compId = oc.getString('compromisso')
      const compInfo = compromissosMap.get(compId)

      // Se temos o compromisso vinculado
      if (compInfo) {
        const metodoId = compInfo.metodoPagamentoId
        const ehCredito = metodoId ? metodosCreditoSet.has(metodoId) : false

        // Se o método NÃO for crédito
        if (!ehCredito && metodoId) {
          const dataCompraStr = (compInfo.dataInicio || oc.getString('created') || '').slice(0, 10)
          if (!dataCompraStr) continue

          const [anoComp, mesComp, diaComp] = dataCompraStr.split('-')
          const competenciaCorreta = `${anoComp}-${mesComp}`
          const dataRealStr = dataCompraStr // YYYY-MM-DD
          const dataEfetivaIso = `${dataRealStr} 12:00:00.000Z`

          const dataPagamentoAtual = (oc.getString('data_pagamento') || '').slice(0, 10)
          const compAtual = oc.getString('competencia') || ''
          const secaoAtual = oc.getString('secao') || ''

          // Verifica se a ocorrência foi indevidamente empurrada para ciclo de fatura
          // ou está com competência/data de pagamento divergente da data de compra real
          const precisaAjuste =
            (dataPagamentoAtual &&
              dataPagamentoAtual !== dataRealStr &&
              dataPagamentoAtual > dataRealStr) ||
            compAtual !== competenciaCorreta ||
            secaoAtual === 'cartoes_credito'

          if (precisaAjuste) {
            oc.set('competencia', competenciaCorreta)
            oc.set('data_pagamento', dataEfetivaIso)
            oc.set('data_vencimento', dataEfetivaIso)
            oc.set('status', 'paga')
            if (secaoAtual === 'cartoes_credito') {
              oc.set('secao', 'contas_mensais_pix_boleto')
            }
            app.save(oc)
            ocorrenciasCorrigidas++

            const lancId = oc.getString('lancamento')
            if (lancId) {
              try {
                const lanc = app.findRecordById('lancamentos', lancId)
                if (lanc) {
                  lanc.set('competencia', competenciaCorreta)
                  lanc.set('data', dataEfetivaIso)
                  lanc.set('status', 'pago')
                  app.save(lanc)
                  lancamentosCorrigidos++
                }
              } catch (eLanc) {
                console.warn(`[0100] Erro ao carregar/atualizar lançamento ${lancId}:`, eLanc)
              }
            }
          }
        }
      }
    }

    // 4. Garantir correção específica do caso concreto apontado pelo usuário:
    // Ocorrência g58ws79tjwhaj1s e lançamento ybr5ks5atvf8r51 ("Frete Maquina Corte Laser")
    try {
      const ocFrete = app.findRecordById('despesas_ocorrencias', 'g58ws79tjwhaj1s')
      if (ocFrete) {
        const dtIso = '2026-10-09 12:00:00.000Z'
        let mudou = false
        if (ocFrete.getString('competencia') !== '2026-10') {
          ocFrete.set('competencia', '2026-10')
          mudou = true
        }
        if ((ocFrete.getString('data_pagamento') || '').slice(0, 10) !== '2026-10-09') {
          ocFrete.set('data_pagamento', dtIso)
          mudou = true
        }
        if ((ocFrete.getString('data_vencimento') || '').slice(0, 10) !== '2026-10-09') {
          ocFrete.set('data_vencimento', dtIso)
          mudou = true
        }
        if (ocFrete.getString('status') !== 'paga') {
          ocFrete.set('status', 'paga')
          mudou = true
        }
        if (ocFrete.getString('secao') !== 'contas_mensais_pix_boleto') {
          ocFrete.set('secao', 'contas_mensais_pix_boleto')
          mudou = true
        }
        if (mudou) {
          app.save(ocFrete)
          ocorrenciasCorrigidas++
        }
      }
    } catch (e) {
      console.warn('[0100] Ocorrência g58ws79tjwhaj1s não encontrada:', e)
    }

    try {
      const lancFrete = app.findRecordById('lancamentos', 'ybr5ks5atvf8r51')
      if (lancFrete) {
        const dtIso = '2026-10-09 12:00:00.000Z'
        let mudouLanc = false
        if (lancFrete.getString('competencia') !== '2026-10') {
          lancFrete.set('competencia', '2026-10')
          mudouLanc = true
        }
        if ((lancFrete.getString('data') || '').slice(0, 10) !== '2026-10-09') {
          lancFrete.set('data', dtIso)
          mudouLanc = true
        }
        if (lancFrete.getString('status') !== 'pago') {
          lancFrete.set('status', 'pago')
          mudouLanc = true
        }
        if (mudouLanc) {
          app.save(lancFrete)
          lancamentosCorrigidos++
        }
      }
    } catch (e) {
      console.warn('[0100] Lançamento ybr5ks5atvf8r51 não encontrado:', e)
    }

    console.log(
      `[0100] Migração concluída. Ocorrências ajustadas: ${ocorrenciasCorrigidas}, Lançamentos ajustados: ${lancamentosCorrigidos}.`,
    )
  },
  (app) => {
    console.log('[0100] Revert migration.')
  },
)
