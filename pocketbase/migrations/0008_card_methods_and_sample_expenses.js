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

    // 1. Obter ou criar cartões
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

    // 2. Garantir métodos de pagamento para cada cartão
    ensure('metodos_pagamento', 'codigo', 'cred_nubank', {
      nome: 'Crédito NuBank',
      codigo: 'cred_nubank',
      tipo: 'cartao',
      conta_padrao: nubank.id,
      ativo: true,
    })

    ensure('metodos_pagamento', 'codigo', 'cred_portoseguro', {
      nome: 'Crédito Porto Seguro',
      codigo: 'cred_portoseguro',
      tipo: 'cartao',
      conta_padrao: portoSeguro.id,
      ativo: true,
    })

    ensure('metodos_pagamento', 'codigo', 'cred_sicred', {
      nome: 'Crédito Sicred',
      codigo: 'cred_sicred',
      tipo: 'cartao',
      conta_padrao: sicred.id,
      ativo: true,
    })

    // 3. Obter dados auxiliares para seed de exemplo nos cartões
    const tagEuCasa = find('tags', 'nome', 'Eu/Casa')
    const tagEu = find('tags', 'nome', 'Eu')
    const tipoFixa = find('tipos_despesa', 'codigo', 'fixa')
    const tipoFixaVar = find('tipos_despesa', 'codigo', 'fixa_variavel')
    const catAluguel =
      find('categorias', 'nome', 'Aluguel') || find('categorias', 'nome', 'Utilities')
    const catUtil = find('categorias', 'nome', 'Utilities')

    // 4. Criar exemplo no NuBank se não houver compromisso de cartão
    const existingCardComp = find('despesas_compromisso', 'secao', 'cartoes_credito')
    if (!existingCardComp && tagEuCasa && tipoFixaVar && catAluguel) {
      const cNubank = ensure(
        'despesas_compromisso',
        'descricao',
        'Compra Parcelada Terreno Botânico',
        {
          contexto_tipo: 'pessoal',
          descricao: 'Compra Parcelada Terreno Botânico',
          fornecedor: 'Botânico Empreendimentos',
          categoria: catAluguel.id,
          tag: tagEuCasa.id,
          tipo_despesa: tipoFixaVar.id,
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
        },
      )

      // Gerar as 4 ocorrências
      const now = new Date()
      const currentYear = now.getUTCFullYear()
      const currentMonth = now.getUTCMonth()

      for (let p = 1; p <= 4; p++) {
        const offset = p - 1
        const d = new Date(Date.UTC(currentYear, currentMonth + offset, 1))
        const monthStr = (d.getUTCMonth() + 1).toString().padStart(2, '0')
        const compStr = `${d.getUTCFullYear()}-${monthStr}`
        const dueDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 10, 12, 0, 0))

        const occ = new Record(app.findCollectionByNameOrId('despesas_ocorrencias'))
        occ.set('compromisso', cNubank.id)
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

      // Adicionar também um compromisso no Porto Seguro
      const cPorto = ensure('despesas_compromisso', 'descricao', 'Seguro Auto Parcelado', {
        contexto_tipo: 'pessoal',
        descricao: 'Seguro Auto Parcelado',
        fornecedor: 'Porto Seguro Auto',
        categoria: catUtil?.id || catAluguel.id,
        tag: tagEu?.id || tagEuCasa.id,
        tipo_despesa: tipoFixa?.id || tipoFixaVar.id,
        conta_padrao: portoSeguro.id,
        secao: 'cartoes_credito',
        regra_repeticao: 'parcelado',
        total_parcelas: 6,
        parcela_inicial: 1,
        dia_vencimento: 12,
        regra_vencimento_texto: '12/m',
        data_inicio: '2026-08-01 00:00:00.000Z',
        valor_estimado: 345.5,
        ativo: true,
        observacoes: 'Seguro do carro',
      })

      for (let p = 1; p <= 6; p++) {
        const offset = p - 2
        const d = new Date(Date.UTC(currentYear, currentMonth + offset, 1))
        const monthStr = (d.getUTCMonth() + 1).toString().padStart(2, '0')
        const compStr = `${d.getUTCFullYear()}-${monthStr}`
        const dueDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 12, 12, 0, 0))

        const occ = new Record(app.findCollectionByNameOrId('despesas_ocorrencias'))
        occ.set('compromisso', cPorto.id)
        occ.set('contexto_tipo', 'pessoal')
        occ.set('secao', 'cartoes_credito')
        occ.set('conta', portoSeguro.id)
        occ.set('competencia', compStr)
        occ.set('numero_parcela', p)
        occ.set('total_parcelas', 6)
        occ.set('data_vencimento', dueDate.toISOString())
        occ.set('valor_previsto', 345.5)
        occ.set('status', p <= 2 ? 'paga' : 'prevista')
        if (p <= 2) {
          occ.set('data_pagamento', dueDate.toISOString())
          occ.set('valor_pago', 345.5)
        }
        occ.set('dizimo', false)
        occ.set('observacoes', 'Parcela ' + p + '/6')
        app.save(occ)
      }
    }
  },
  (app) => {},
)
