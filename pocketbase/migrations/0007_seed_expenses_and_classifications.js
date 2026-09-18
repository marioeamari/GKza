migrate(
  (app) => {
    function find(collection, field, value) {
      try {
        return app.findFirstRecordByData(collection, field, value)
      } catch (_) {
        return null
      }
    }

    function create(collection, values) {
      const record = new Record(app.findCollectionByNameOrId(collection))
      const keys = Object.keys(values)
      for (let i = 0; i < keys.length; i++) record.set(keys[i], values[keys[i]])
      app.save(record)
      return record
    }

    function ensure(collection, field, value, values) {
      const existing = find(collection, field, value)
      return existing || create(collection, values)
    }

    // 1. Tags
    const tagEuCasa = ensure('tags', 'nome', 'Eu/Casa', { nome: 'Eu/Casa', cor: '#DF5830' })
    const tagEu = ensure('tags', 'nome', 'Eu', { nome: 'Eu', cor: '#2B5BA8' })
    const tagRafa = ensure('tags', 'nome', 'Rafa', { nome: 'Rafa', cor: '#A8556A' })
    const tagEmpresa = ensure('tags', 'nome', 'Empresa', { nome: 'Empresa', cor: '#1E6F5C' })
    ensure('tags', 'nome', 'Geral', { nome: 'Geral', cor: '#61737E' })

    // 2. Tipos de Despesa
    const tipoFixa = ensure('tipos_despesa', 'codigo', 'fixa', {
      nome: 'Fixa',
      codigo: 'fixa',
      descricao: 'Despesa com valor previsível e recorrente todo mês.',
    })
    const tipoFixaVar = ensure('tipos_despesa', 'codigo', 'fixa_variavel', {
      nome: 'Fixa / Variável',
      codigo: 'fixa_variavel',
      descricao: 'Despesa fixa que oscila conforme consumo (água, luz, telefone).',
    })
    ensure('tipos_despesa', 'codigo', 'variavel', {
      nome: 'Variável',
      codigo: 'variavel',
      descricao: 'Despesa pontual sem recorrência obrigatória.',
    })

    // 3. Tipos de Dízimo / Oferta
    const dizimoItem = ensure('tipos_dizimo', 'nome', 'Dízimo', {
      nome: 'Dízimo',
      descricao: 'Dízimo bíblico regular (10%)',
      soma_resumo: true,
      cor: '#DF5830',
    })
    const ofertaItem = ensure('tipos_dizimo', 'nome', 'Oferta', {
      nome: 'Oferta',
      descricao: 'Ofertas voluntárias',
      soma_resumo: true,
      cor: '#B7791F',
    })
    const primiciaItem = ensure('tipos_dizimo', 'nome', 'Primícia / Prêmica', {
      nome: 'Primícia / Prêmica',
      descricao: 'Primícias e primeiros frutos',
      soma_resumo: true,
      cor: '#1E6F5C',
    })

    // 4. Cartões de crédito adicionais: NuBank, Porto Seguro, Sicred
    const nubank = ensure('contas', 'nome', 'NuBank', {
      nome: 'NuBank',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#8A05BE',
      ativa: true,
      dia_fechamento: 3,
      dia_vencimento: 10,
      bandeira: 'Mastercard',
    })
    const portoSeguro = ensure('contas', 'nome', 'Porto Seguro', {
      nome: 'Porto Seguro',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#005CA9',
      ativa: true,
      dia_fechamento: 5,
      dia_vencimento: 12,
      bandeira: 'Visa',
    })
    const sicred = ensure('contas', 'nome', 'Sicred', {
      nome: 'Sicred',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#006633',
      ativa: true,
      dia_fechamento: 1,
      dia_vencimento: 8,
      bandeira: 'Mastercard',
    })

    // 5. Métodos de Pagamento
    const pixCpf = ensure('metodos_pagamento', 'codigo', 'pix_cpf', {
      nome: 'Pix - CPF',
      codigo: 'pix_cpf',
      tipo: 'pix',
      ativo: true,
    })
    const pixCnpj = ensure('metodos_pagamento', 'codigo', 'pix_cnpj', {
      nome: 'Pix - CNPJ',
      codigo: 'pix_cnpj',
      tipo: 'pix',
      ativo: true,
    })
    const credCpf = ensure('metodos_pagamento', 'codigo', 'cred_cpf', {
      nome: 'Cred - CPF',
      codigo: 'cred_cpf',
      tipo: 'cartao',
      conta_padrao: nubank.id,
      ativo: true,
    })
    ensure('metodos_pagamento', 'codigo', 'boleto', {
      nome: 'Boleto Bancário',
      codigo: 'boleto',
      tipo: 'boleto',
      ativo: true,
    })

    // Obter categoria para relacionar
    let catUtil = find('categorias', 'nome', 'Utilities')
    if (!catUtil) {
      catUtil = ensure('categorias', 'nome', 'Contas e Serviços', {
        nome: 'Contas e Serviços',
        tipo: 'despesa',
        cor: '#DF5830',
      })
    }
    const catAluguel = find('categorias', 'nome', 'Aluguel') || catUtil
    const catFornecedores = find('categorias', 'nome', 'Fornecedores') || catUtil

    // 6. Criar compromissos reais da planilha para demonstração do usuário
    const c1 = ensure('despesas_compromisso', 'descricao', 'Guarda Rua', {
      contexto_tipo: 'pessoal',
      descricao: 'Guarda Rua',
      fornecedor: 'Neuris',
      categoria: catUtil.id,
      tag: tagEuCasa.id,
      tipo_despesa: tipoFixa.id,
      metodo_pagamento: pixCpf.id,
      secao: 'contas_mensais_pix_boleto',
      regra_repeticao: 'mensal',
      dia_vencimento: 10,
      regra_vencimento_texto: '10/m',
      data_inicio: '2026-01-01 00:00:00.000Z',
      valor_estimado: 30,
      dizimo: true,
      tipo_dizimo: dizimoItem.id,
      ativo: true,
      observacoes: 'Segurança da rua',
    })

    const c2 = ensure('despesas_compromisso', 'descricao', 'Internet Fibra', {
      contexto_tipo: 'pessoal',
      descricao: 'Internet Fibra',
      fornecedor: 'ConectPlus',
      categoria: catUtil.id,
      tag: tagEuCasa.id,
      tipo_despesa: tipoFixa.id,
      metodo_pagamento: pixCnpj.id,
      secao: 'contas_mensais_pix_boleto',
      regra_repeticao: 'mensal',
      dia_vencimento: 12,
      regra_vencimento_texto: '12/m',
      data_inicio: '2026-01-01 00:00:00.000Z',
      valor_estimado: 99.9,
      dizimo: true,
      tipo_dizimo: dizimoItem.id,
      ativo: true,
      observacoes: 'Fibra óptica residencial',
    })

    const c3 = ensure('despesas_compromisso', 'descricao', 'Escola', {
      contexto_tipo: 'pessoal',
      descricao: 'Escola',
      fornecedor: 'Sesi',
      categoria: catUtil.id,
      tag: tagRafa.id,
      tipo_despesa: tipoFixaVar.id,
      metodo_pagamento: pixCpf.id,
      secao: 'contas_mensais_pix_boleto',
      regra_repeticao: 'mensal',
      dia_vencimento: 15,
      regra_vencimento_texto: '15/m',
      data_inicio: '2026-01-01 00:00:00.000Z',
      valor_estimado: 545.66,
      link_pagamento: 'https://sesi.org.br',
      dizimo: true,
      tipo_dizimo: dizimoItem.id,
      ativo: true,
      observacoes: 'Mensalidade escolar',
    })

    const c4 = ensure('despesas_compromisso', 'descricao', 'Dízimo CAPP', {
      contexto_tipo: 'pessoal',
      descricao: 'Dízimo CAPP',
      fornecedor: 'CAPP',
      categoria: catUtil.id,
      tipo_despesa: tipoFixaVar.id,
      metodo_pagamento: pixCpf.id,
      secao: 'contas_mensais_pix_boleto',
      regra_repeticao: 'mensal',
      dia_vencimento: 1,
      regra_vencimento_texto: '1/m',
      data_inicio: '2026-01-01 00:00:00.000Z',
      valor_estimado: 782.02,
      dizimo: true,
      tipo_dizimo: dizimoItem.id,
      ativo: true,
      observacoes: 'Dízimo mensal',
    })

    const c5 = ensure('despesas_compromisso', 'descricao', 'Oferta Ministerial', {
      contexto_tipo: 'pessoal',
      descricao: 'Oferta Ministerial',
      fornecedor: 'Ministério',
      categoria: catUtil.id,
      tipo_despesa: tipoFixaVar.id,
      metodo_pagamento: pixCpf.id,
      secao: 'contas_mensais_pix_boleto',
      regra_repeticao: 'mensal',
      dia_vencimento: 1,
      regra_vencimento_texto: '1/m',
      data_inicio: '2026-01-01 00:00:00.000Z',
      valor_estimado: 391.01,
      dizimo: true,
      tipo_dizimo: ofertaItem.id,
      ativo: true,
      observacoes: 'Oferta de gratidão',
    })

    const c6 = ensure('despesas_compromisso', 'descricao', 'Compra Parcelada Terreno Botânico', {
      contexto_tipo: 'pessoal',
      descricao: 'Compra Parcelada Terreno Botânico',
      fornecedor: 'Botânico Empreendimentos',
      categoria: catAluguel.id,
      tag: tagEuCasa.id,
      tipo_despesa: tipoFixaVar.id,
      metodo_pagamento: credCpf.id,
      conta_padrao: nubank.id,
      secao: 'cartoes_credito',
      regra_repeticao: 'parcelado',
      total_parcelas: 4,
      parcela_inicial: 1,
      dia_vencimento: 10,
      regra_vencimento_texto: '10/m',
      data_inicio: '2026-06-01 00:00:00.000Z',
      valor_estimado: 2238.58,
      ativo: true,
      observacoes: 'Parcelamento terreno 4x',
    })

    // 7. Gerar ocorrências para o mês atual e meses vizinhos
    const now = new Date()
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth() // 0-indexed

    function formatCompetencia(y, m) {
      const monthStr = (m + 1).toString().padStart(2, '0')
      return `${y}-${monthStr}`
    }

    function generateOccurrencesForCompromisso(comp, countMonths) {
      for (let i = -1; i <= countMonths; i++) {
        const d = new Date(Date.UTC(currentYear, currentMonth + i, 1))
        const compStr = formatCompetencia(d.getUTCFullYear(), d.getUTCMonth())
        const day = comp.getInt('dia_vencimento') || 10
        const dueDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day, 12, 0, 0))

        const existingFilter = `compromisso = '${comp.id}' && competencia = '${compStr}'`
        const existing = app.findRecordsByFilter('despesas_ocorrencias', existingFilter, '', 1, 0)
        if (existing.length === 0) {
          const occ = new Record(app.findCollectionByNameOrId('despesas_ocorrencias'))
          occ.set('compromisso', comp.id)
          occ.set('contexto_tipo', comp.getString('contexto_tipo'))
          occ.set('secao', comp.getString('secao'))
          occ.set('conta', comp.getString('conta_padrao'))
          occ.set('competencia', compStr)
          occ.set('data_vencimento', dueDate.toISOString())
          occ.set('valor_previsto', comp.getFloat('valor_estimado'))
          occ.set('status', i < 0 ? 'paga' : 'prevista')
          if (i < 0) {
            occ.set('data_pagamento', dueDate.toISOString())
            occ.set('valor_pago', comp.getFloat('valor_estimado'))
          }
          occ.set('dizimo', comp.getBool('dizimo'))
          occ.set('tipo_dizimo', comp.getString('tipo_dizimo'))
          occ.set('link_pagamento', comp.getString('link_pagamento'))
          occ.set('observacoes', comp.getString('observacoes'))
          app.save(occ)
        }
      }
    }

    generateOccurrencesForCompromisso(c1, 2)
    generateOccurrencesForCompromisso(c2, 2)
    generateOccurrencesForCompromisso(c3, 2)
    generateOccurrencesForCompromisso(c4, 2)
    generateOccurrencesForCompromisso(c5, 2)

    // Ocorrências da compra parcelada (4 parcelas)
    for (let p = 1; p <= 4; p++) {
      const monthOffset = p - 1
      const d = new Date(Date.UTC(currentYear, currentMonth + monthOffset, 1))
      const compStr = formatCompetencia(d.getUTCFullYear(), d.getUTCMonth())
      const dueDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 10, 12, 0, 0))

      const existingFilter = `compromisso = '${c6.id}' && numero_parcela = ${p}`
      const existing = app.findRecordsByFilter('despesas_ocorrencias', existingFilter, '', 1, 0)
      if (existing.length === 0) {
        const occ = new Record(app.findCollectionByNameOrId('despesas_ocorrencias'))
        occ.set('compromisso', c6.id)
        occ.set('contexto_tipo', 'pessoal')
        occ.set('secao', 'cartoes_credito')
        occ.set('conta', nubank.id)
        occ.set('competencia', compStr)
        occ.set('numero_parcela', p)
        occ.set('total_parcelas', 4)
        occ.set('data_vencimento', dueDate.toISOString())
        occ.set('valor_previsto', 2238.58)
        occ.set('status', p === 1 ? 'paga' : 'prevista')
        if (p === 1) {
          occ.set('data_pagamento', dueDate.toISOString())
          occ.set('valor_pago', 2238.58)
        }
        occ.set('dizimo', false)
        occ.set('observacoes', 'Parcela ' + p + '/4')
        app.save(occ)
      }
    }
  },
  (app) => {
    // Reverter seeds não é estritamente necessário ou pode truncar despesas
  },
)
