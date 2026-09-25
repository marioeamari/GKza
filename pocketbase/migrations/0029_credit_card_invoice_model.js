migrate(
  (app) => {
    const lancamentos = app.findCollectionByNameOrId('lancamentos')
    const contas = app.findCollectionByNameOrId('contas')

    // 1. Adicionar campos em lancamentos para controle de competência e faturas
    if (!lancamentos.fields.getByName('competencia')) {
      lancamentos.fields.add(
        new TextField({
          name: 'competencia',
          required: false,
          max: 10,
        }),
      )
    }

    if (!lancamentos.fields.getByName('fatura_paga')) {
      lancamentos.fields.add(
        new BoolField({
          name: 'fatura_paga',
          required: false,
        }),
      )
    }

    if (!lancamentos.fields.getByName('fatura_pagamento_id')) {
      lancamentos.fields.add(
        new TextField({
          name: 'fatura_pagamento_id',
          required: false,
          max: 64,
        }),
      )
    }

    if (!lancamentos.fields.getByName('is_pagamento_fatura')) {
      lancamentos.fields.add(
        new BoolField({
          name: 'is_pagamento_fatura',
          required: false,
        }),
      )
    }

    if (!lancamentos.fields.getByName('cartao_fatura_conta')) {
      lancamentos.fields.add(
        new RelationField({
          name: 'cartao_fatura_conta',
          required: false,
          collectionId: contas.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    app.save(lancamentos)

    // 2. Ajustar conta NuBank para cartão com dia_fechamento 13 e dia_vencimento 20
    let nubankAccount = null
    try {
      nubankAccount = app.findRecordById('contas', '40iihpvg0n66ezh')
    } catch (_) {
      try {
        const byName = app.findRecordsByFilter('contas', "nome = 'NuBank'", '', 1, 0)
        if (byName.length > 0) nubankAccount = byName[0]
      } catch (_) {}
    }

    if (nubankAccount) {
      nubankAccount.set('tipo', 'cartao')
      nubankAccount.set('dia_fechamento', 13)
      nubankAccount.set('dia_vencimento', 20)
      nubankAccount.set('ativa', true)
      app.save(nubankAccount)
    }

    // Vincular cartão NuBank ao grupo Pessoal (CPF) se ainda não estiver
    try {
      const grupoPessoal = app.findFirstRecordByData('contexto_grupos', 'nome', 'Pessoal (CPF)')
      if (grupoPessoal && nubankAccount) {
        const existing = app.findRecordsByFilter(
          'contexto_grupo_membros',
          `grupo = '${grupoPessoal.id}' && conta = '${nubankAccount.id}'`,
          '',
          1,
          0,
        )
        if (existing.length === 0) {
          const membrosCol = app.findCollectionByNameOrId('contexto_grupo_membros')
          const m = new Record(membrosCol)
          m.set('grupo', grupoPessoal.id)
          m.set('tipo', 'conta')
          m.set('conta', nubankAccount.id)
          app.save(m)
        }
      }
    } catch (_) {}

    // 3. Excluir lançamentos de cartão anteriores (autorizado pelo usuário no período de testes)
    try {
      const cardAccounts = app.findRecordsByFilter('contas', "tipo = 'cartao'", '', 50, 0)
      for (let i = 0; i < cardAccounts.length; i++) {
        const cardId = cardAccounts[i].id
        const existingLanc = app.findRecordsByFilter(
          'lancamentos',
          `conta = '${cardId}'`,
          '',
          200,
          0,
        )
        for (let j = 0; j < existingLanc.length; j++) {
          app.delete(existingLanc[j])
        }
      }
    } catch (err) {
      console.log('Aviso ao limpar lançamentos antigos de cartão:', err)
    }

    // Limpar despesa teste "Amendoim" no cartão se existir
    try {
      const amendoimComp = app.findRecordsByFilter(
        'despesas_compromisso',
        "descricao = 'Amendoim'",
        '',
        10,
        0,
      )
      for (let i = 0; i < amendoimComp.length; i++) {
        const ocs = app.findRecordsByFilter(
          'despesas_ocorrencias',
          `compromisso = '${amendoimComp[i].id}'`,
          '',
          50,
          0,
        )
        for (let j = 0; j < ocs.length; j++) {
          app.delete(ocs[j])
        }
        app.delete(amendoimComp[i])
      }
    } catch (_) {}

    // 4. Criar compras retroativas de teste para a fatura fechada em 13/09/2026 somando R$ 3.054,43
    if (nubankAccount) {
      let pessoaId = ''
      try {
        const p = app.findRecordsByFilter('pessoas', '', '-created', 1, 0)
        if (p.length > 0) pessoaId = p[0].id
      } catch (_) {}

      const getCat = (nome) => {
        try {
          const c = app.findFirstRecordByData('categorias', 'nome', nome)
          return c.id
        } catch (_) {
          return ''
        }
      }
      const catAlimentacao = getCat('Alimentação')
      const catUtilitarios = getCat('Utilitários')
      const catSaude = getCat('Saúde')
      const catDevPessoal = getCat('Desenvolvimento Pessoal')

      const testPurchases = [
        {
          descricao: 'Supermercado Pão de Açúcar',
          valor: 684.2,
          data: '2026-08-16 14:22:00.000Z',
          categoria: catAlimentacao,
          observacoes: 'Compras da quinzena (Alimentação)',
        },
        {
          descricao: 'Posto Ipiranga Combustível',
          valor: 320.0,
          data: '2026-08-20 18:45:00.000Z',
          categoria: catUtilitarios,
          observacoes: 'Abastecimento etanol/gasolina',
        },
        {
          descricao: 'Drogaria São Paulo Medicamentos',
          valor: 185.5,
          data: '2026-08-25 11:10:00.000Z',
          categoria: catSaude,
          observacoes: 'Medicamentos e farmácia',
        },
        {
          descricao: 'Restaurante e Churrascaria',
          valor: 142.3,
          data: '2026-08-28 20:30:00.000Z',
          categoria: catAlimentacao,
          observacoes: 'Jantar em família',
        },
        {
          descricao: 'Amazon Brasil - Livros e Suprimentos',
          valor: 849.9,
          data: '2026-09-02 16:15:00.000Z',
          categoria: catDevPessoal || catUtilitarios,
          observacoes: 'Livros técnicos e periféricos',
        },
        {
          descricao: 'Assinatura Adobe Creative Cloud',
          valor: 258.0,
          data: '2026-09-05 09:00:00.000Z',
          categoria: catUtilitarios,
          observacoes: 'Assinatura mensal de ferramentas de design',
        },
        {
          descricao: 'Almoço Executivo',
          valor: 94.53,
          data: '2026-09-09 12:40:00.000Z',
          categoria: catAlimentacao,
          observacoes: 'Almoço comercial durante a semana',
        },
        {
          descricao: 'Compras Empório e Padaria',
          valor: 520.0,
          data: '2026-09-12 15:50:00.000Z',
          categoria: catAlimentacao,
          observacoes: 'Queijos, lanches e suprimentos para o fim de semana',
        },
      ]

      const lancamentosCol = app.findCollectionByNameOrId('lancamentos')
      for (let k = 0; k < testPurchases.length; k++) {
        const item = testPurchases[k]
        const rec = new Record(lancamentosCol)
        rec.set('descricao', item.descricao)
        rec.set('valor', item.valor)
        rec.set('tipo', 'despesa')
        rec.set('data', item.data)
        rec.set('status', 'pendente')
        rec.set('conta', nubankAccount.id)
        if (item.categoria) rec.set('categoria', item.categoria)
        if (pessoaId) rec.set('pessoa', pessoaId)
        rec.set('competencia', '2026-09')
        rec.set('fatura_paga', false)
        rec.set('observacoes', item.observacoes)
        app.save(rec)
      }
    }
  },
  (app) => {
    const lancamentos = app.findCollectionByNameOrId('lancamentos')
    const fieldsToDrop = [
      'competencia',
      'fatura_paga',
      'fatura_pagamento_id',
      'is_pagamento_fatura',
      'cartao_fatura_conta',
    ]
    for (let i = 0; i < fieldsToDrop.length; i++) {
      try {
        lancamentos.fields.removeByName(fieldsToDrop[i])
      } catch (_) {}
    }
    app.save(lancamentos)
  },
)
