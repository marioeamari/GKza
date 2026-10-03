migrate(
  (app) => {
    // 0062: Correção completa no banco de dados da alocação de competência e vencimento
    // de TODAS as ocorrências de despesas cujo método de pagamento NÃO é crédito,
    // mas que foram empurradas para o ciclo da fatura do cartão.
    //
    // Regra vigente desde v0.0.128: APENAS o método "Crédito" segue o ciclo da fatura.
    // Pix, Débito, Transferência, Boletos e Dinheiro têm:
    //   - competência = mês da data da despesa (data_pagamento se paga, senão data_vencimento original / compromisso data_inicio)
    //   - vencimento = data informada da despesa (ou dia_vencimento do compromisso no mês)
    //
    // Preservar ABSOLUTAMENTE:
    //   - status pago / prevista
    //   - valor_pago, valor_previsto, valor_estimado_original
    //   - data_pagamento
    //   - lançamento vinculado (ID intacto)
    //   - comprovante_pagamento
    //   - observações, categoria, conta, contexto_tipo, empresa, etc.

    function parseDateParts(dateStr) {
      if (!dateStr) {
        return null
      }
      const clean = dateStr.slice(0, 10)
      const parts = clean.split('-')
      if (parts.length < 3) return null
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)
      if (isNaN(year) || isNaN(month) || isNaN(day)) return null
      return { year, month, day, dateOnly: clean }
    }

    function getDaysInMonth(year, month) {
      return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    }

    // 1. Mapear TODOS os métodos de pagamento existentes
    const todosMetodos = app.findRecordsByFilter('metodos_pagamento', 'id != ""', 'nome', 500, 0)
    const metodosCreditoSet = new Set()
    const metodosNaoCreditoSet = new Set()
    const metodosMap = {}

    for (let i = 0; i < todosMetodos.length; i++) {
      const m = todosMetodos[i]
      metodosMap[m.id] = m
      const codigo = String(m.getString('codigo') || '')
        .toLowerCase()
        .trim()
      const nome = String(m.getString('nome') || '')
        .toLowerCase()
        .trim()
      const tipo = String(m.getString('tipo') || '')
        .toLowerCase()
        .trim()

      const ehDebito =
        nome.includes('débito') || nome.includes('debito') || codigo.includes('debito')

      if (ehDebito) {
        metodosNaoCreditoSet.add(m.id)
        continue
      }

      if (
        codigo === 'credito' ||
        codigo === 'cartao_credito' ||
        codigo === 'cartao-credito' ||
        codigo === 'cartaocredito' ||
        nome.includes('crédito') ||
        nome.includes('credito') ||
        tipo === 'cartao' ||
        tipo === 'credito'
      ) {
        metodosCreditoSet.add(m.id)
      } else {
        metodosNaoCreditoSet.add(m.id)
      }
    }

    // 2. Mapear contas com fechamento cadastrado (aceitam crédito com ciclo de fatura)
    const todasContas = app.findRecordsByFilter('contas', 'id != ""', 'nome', 500, 0)
    const contasComCicloMap = {}

    for (let i = 0; i < todasContas.length; i++) {
      const c = todasContas[i]
      const diaFech = c.getInt('dia_fechamento') || 0
      const diaVenc = c.getInt('dia_vencimento') || 0
      const tipo = c.getString('tipo') || ''
      const tiposPagJson = c.getString('tipos_pagamento') || '[]'
      const aceitaCredito = tipo === 'cartao' || tiposPagJson.includes('credito')

      if (diaFech > 0 && aceitaCredito) {
        contasComCicloMap[c.id] = {
          id: c.id,
          nome: c.getString('nome') || '',
          dia_fechamento: diaFech,
          dia_vencimento: diaVenc,
        }
      }
    }

    // 3. Carregar todos os compromissos em memória para rápido acesso
    const todosCompromissos = app.findRecordsByFilter(
      'despesas_compromisso',
      'id != ""',
      'created',
      2000,
      0,
    )
    const compromissosMap = {}
    for (let i = 0; i < todosCompromissos.length; i++) {
      compromissosMap[todosCompromissos[i].id] = todosCompromissos[i]
    }

    // 4. Se houver compromisso não-crédito ainda em 'cartoes_credito', corrigir a seção
    let compromissosSecaoCorrigidos = 0
    for (let i = 0; i < todosCompromissos.length; i++) {
      const comp = todosCompromissos[i]
      const mpId = comp.getString('metodo_pagamento')
      const ehCredito = mpId && metodosCreditoSet.has(mpId)
      if (!ehCredito && comp.getString('secao') === 'cartoes_credito') {
        const regraRep = comp.getString('regra_repeticao')
        const novaSecao = regraRep === 'anual' ? 'assinaturas_anuais' : 'contas_mensais_pix_boleto'
        comp.set('secao', novaSecao)
        app.save(comp)
        compromissosSecaoCorrigidos++
      }
    }

    // 5. Varredura completa de TODAS as ocorrências de despesas
    const todasOcorrencias = app.findRecordsByFilter(
      'despesas_ocorrencias',
      'id != ""',
      'created',
      5000,
      0,
    )

    let ocorrenciasCorrigidas = 0
    const relatorioCorrigidas = []

    for (let i = 0; i < todasOcorrencias.length; i++) {
      const oc = todasOcorrencias[i]
      const compId = oc.getString('compromisso')
      const comp = compId ? compromissosMap[compId] : null

      // Identificar o método de pagamento efetivo:
      // se compromisso tem método, avaliamos; se não tem método, não é crédito.
      const mpId = comp ? comp.getString('metodo_pagamento') : ''
      const ehCredito = mpId ? metodosCreditoSet.has(mpId) : false

      // Se for método Crédito LEGÍTIMO, NÃO mexer!
      if (ehCredito) {
        continue
      }

      // Identificar a conta vinculada (ocorrência ou compromisso)
      const contaId = oc.getString('conta') || (comp ? comp.getString('conta_padrao') : '')
      const contaTemCiclo = contaId && !!contasComCicloMap[contaId]

      // Dados atuais da ocorrência
      const competenciaAtual = oc.getString('competencia') || ''
      const dataVencAtual = oc.getString('data_vencimento') || ''
      const dataPagAtual = oc.getString('data_pagamento') || ''
      const statusAtual = oc.getString('status') || ''

      // Se compromisso é avulso, parcelado ou mensal
      const regraRep = comp ? comp.getString('regra_repeticao') : 'avulso'
      const modalidade = comp ? comp.getString('modalidade_parcelamento') : 'a_vista'
      const isParcelado = modalidade === 'parcelado' || regraRep === 'parcelado'
      const numParcela = oc.getInt('numero_parcela') || 0
      const parcInicial = (comp ? comp.getInt('parcela_inicial') : 1) || 1

      // Determinar a data base de referência da despesa
      // Prioridade:
      // 1) data_pagamento (se paga, o mês real do pagamento)
      // 2) para compromisso avulso: comp.data_inicio (data informada da compra)
      // 3) para parcelado: comp.data_inicio + offset da parcela
      // 4) para mensal: comp.dia_vencimento ou data_vencimento informada
      let dataRef = ''
      let horaRef = '12:00:00'

      if (statusAtual === 'paga' && dataPagAtual) {
        dataRef = dataPagAtual.slice(0, 10)
        if (dataPagAtual.length >= 19) {
          horaRef = dataPagAtual.slice(11, 19)
        }
      } else if (regraRep === 'avulso') {
        const dInicio = comp ? comp.getString('data_inicio') : ''
        if (dInicio) {
          dataRef = dInicio.slice(0, 10)
          if (dInicio.length >= 19) {
            horaRef = dInicio.slice(11, 19)
          }
        } else if (dataVencAtual) {
          dataRef = dataVencAtual.slice(0, 10)
        }
      } else if (isParcelado) {
        const dInicio = comp ? comp.getString('data_inicio') : ''
        const partsInicio = parseDateParts(dInicio)
        if (partsInicio) {
          const offset = Math.max(0, (numParcela || 1) - parcInicial)
          const targetY = partsInicio.year
          const targetM = partsInicio.month + offset
          const dueDay = (comp ? comp.getInt('dia_vencimento') : 0) || partsInicio.day || 10
          const maxD = getDaysInMonth(targetY, targetM)
          const realD = Math.min(dueDay, maxD)
          const normD = new Date(Date.UTC(targetY, targetM, realD))
          dataRef =
            normD.getUTCFullYear() +
            '-' +
            String(normD.getUTCMonth() + 1).padStart(2, '0') +
            '-' +
            String(normD.getUTCDate()).padStart(2, '0')
        } else if (dataVencAtual) {
          dataRef = dataVencAtual.slice(0, 10)
        }
      } else {
        // Mensal / anual recorrente não-cartão
        // Se a competência atual estiver desalinhada do vencimento informado
        if (dataVencAtual) {
          dataRef = dataVencAtual.slice(0, 10)
        } else if (comp && comp.getString('data_inicio')) {
          dataRef = comp.getString('data_inicio').slice(0, 10)
        }
      }

      if (!dataRef || dataRef.length < 10) {
        continue
      }

      const pRef = parseDateParts(dataRef)
      if (!pRef) continue

      const competenciaEsperada = dataRef.slice(0, 7)

      // Determinar o vencimento correto esperado
      let dataVencEsperada = ''
      if (statusAtual === 'paga' && dataPagAtual && regraRep === 'avulso') {
        // Para avulso pago, vencimento = data informada da despesa / pagamento
        dataVencEsperada = `${dataRef} ${horaRef}`
      } else if (regraRep === 'avulso') {
        const dInicio = comp ? comp.getString('data_inicio') : ''
        if (dInicio && dInicio.slice(0, 10) === dataRef) {
          dataVencEsperada = dInicio
        } else {
          dataVencEsperada = `${dataRef} 12:00:00`
        }
      } else {
        // Mensal / parcelado: dia_vencimento do compromisso no mês da competência
        const diaVenc = (comp ? comp.getInt('dia_vencimento') : 0) || pRef.day || 10
        const partsComp = competenciaEsperada.split('-')
        const ano = parseInt(partsComp[0], 10)
        const mes = parseInt(partsComp[1], 10) - 1
        const maxDia = getDaysInMonth(ano, mes)
        const diaReal = Math.min(diaVenc, maxDia)
        const diaFmt = String(diaReal).padStart(2, '0')
        dataVencEsperada = `${partsComp[0]}-${partsComp[1]}-${diaFmt} 12:00:00`
      }

      // Verificar se a ocorrência foi de fato empurrada ou está com competência/vencimento incorretos
      const precisaAjustarCompetencia = competenciaAtual !== competenciaEsperada
      const dataVencAtualClean = dataVencAtual ? dataVencAtual.slice(0, 10) : ''
      const dataVencEsperadaClean = dataVencEsperada ? dataVencEsperada.slice(0, 10) : ''
      const precisaAjustarVencimento =
        precisaAjustarCompetencia ||
        (dataVencAtualClean && dataVencAtualClean !== dataVencEsperadaClean)

      // Também alinhar a seção da ocorrência se estiver em 'cartoes_credito'
      const secaoAtual = oc.getString('secao')
      const secaoComp = comp ? comp.getString('secao') : ''
      const novaSecao =
        secaoComp && secaoComp !== 'cartoes_credito'
          ? secaoComp
          : regraRep === 'anual'
            ? 'assinaturas_anuais'
            : 'contas_mensais_pix_boleto'
      const precisaAjustarSecao = secaoAtual === 'cartoes_credito'

      if (
        precisaAjustarCompetencia ||
        (precisaAjustarVencimento && contaTemCiclo) ||
        precisaAjustarSecao
      ) {
        const desc = comp ? comp.getString('descricao') : oc.getString('observacoes') || 'Despesa'
        const metodoNome =
          mpId && metodosMap[mpId] ? metodosMap[mpId].getString('nome') : 'Sem método'

        // Executar a atualização preservando tudo o mais
        if (precisaAjustarCompetencia) {
          oc.set('competencia', competenciaEsperada)
        }
        if (precisaAjustarVencimento) {
          oc.set('data_vencimento', dataVencEsperada)
        }
        if (precisaAjustarSecao) {
          oc.set('secao', novaSecao)
        }

        app.save(oc)
        ocorrenciasCorrigidas++

        relatorioCorrigidas.push({
          id: oc.id,
          descricao: desc,
          metodo: metodoNome,
          status: statusAtual,
          competenciaAntiga: competenciaAtual,
          competenciaNova: competenciaEsperada,
          vencimentoAntigo: dataVencAtualClean,
          vencimentoNovo: dataVencEsperadaClean,
        })
      }
    }

    console.log(
      'Migration 0062: Concluída com sucesso! Compromissos reclassificados: ' +
        compromissosSecaoCorrigidos +
        '. Ocorrências corrigidas: ' +
        ocorrenciasCorrigidas,
    )
    for (let k = 0; k < relatorioCorrigidas.length; k++) {
      const item = relatorioCorrigidas[k]
      console.log(
        '  - [' +
          item.id +
          '] "' +
          item.descricao +
          '" (' +
          item.metodo +
          ', status: ' +
          item.status +
          '): ' +
          item.competenciaAntiga +
          ' -> ' +
          item.competenciaNova +
          ' (venc: ' +
          item.vencimentoAntigo +
          ' -> ' +
          item.vencimentoNovo +
          ')',
      )
    }
  },
  (app) => {
    // Rollback não-destrutivo vazio
  },
)
