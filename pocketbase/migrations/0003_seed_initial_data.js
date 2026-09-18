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

    function monthDate(offset, day) {
      const now = new Date()
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day, 12, 0, 0),
      ).toISOString()
    }

    function dayDate(offset) {
      const now = new Date()
      now.setUTCDate(now.getUTCDate() + offset)
      now.setUTCHours(12, 0, 0, 0)
      return now.toISOString()
    }

    try {
      app.findAuthRecordByEmail('users', 'marioeduardomari@gmail.com')
    } catch (_) {
      const admin = new Record(app.findCollectionByNameOrId('users'))
      admin.setEmail('marioeduardomari@gmail.com')
      admin.setPassword('Skip@Pass')
      admin.setVerified(true)
      admin.set('name', 'Mario Eduardo')
      admin.set('role', 'admin')
      admin.set('avatar', '')
      app.save(admin)
    }

    const mercadoLivre = ensure('marketplaces', 'slug', 'mercado-livre', {
      nome: 'Mercado Livre',
      slug: 'mercado-livre',
      cor: '#FFE600',
    })
    const shopee = ensure('marketplaces', 'slug', 'shopee', {
      nome: 'Shopee',
      slug: 'shopee',
      cor: '#EE4D2D',
    })
    const amazon = ensure('marketplaces', 'slug', 'amazon', {
      nome: 'Amazon',
      slug: 'amazon',
      cor: '#FF9900',
    })
    ensure('marketplaces', 'slug', 'magalu', {
      nome: 'Magazine Luiza',
      slug: 'magalu',
      cor: '#0086FF',
    })

    const vendasMarketplace = ensure('categorias', 'nome', 'Vendas Marketplace', {
      nome: 'Vendas Marketplace',
      tipo: 'receita',
      cor: '#1E6F5C',
    })
    const vendasDiretas = ensure('categorias', 'nome', 'Vendas Diretas', {
      nome: 'Vendas Diretas',
      tipo: 'receita',
      cor: '#3F8F78',
    })
    ensure('categorias', 'nome', 'Serviços', { nome: 'Serviços', tipo: 'receita', cor: '#2B5BA8' })
    const comissoes = ensure('categorias', 'nome', 'Comissões', {
      nome: 'Comissões',
      tipo: 'despesa',
      cor: '#DF5830',
    })
    const frete = ensure('categorias', 'nome', 'Frete', {
      nome: 'Frete',
      tipo: 'despesa',
      cor: '#B7791F',
    })
    const fornecedores = ensure('categorias', 'nome', 'Fornecedores', {
      nome: 'Fornecedores',
      tipo: 'despesa',
      cor: '#8A5A44',
    })
    const impostos = ensure('categorias', 'nome', 'Impostos', {
      nome: 'Impostos',
      tipo: 'despesa',
      cor: '#C0392B',
    })
    const marketing = ensure('categorias', 'nome', 'Marketing', {
      nome: 'Marketing',
      tipo: 'despesa',
      cor: '#A8556A',
    })
    const aluguel = ensure('categorias', 'nome', 'Aluguel', {
      nome: 'Aluguel',
      tipo: 'despesa',
      cor: '#4C3A8C',
    })
    ensure('categorias', 'nome', 'Utilities', {
      nome: 'Utilities',
      tipo: 'despesa',
      cor: '#61737E',
    })

    const caixa = ensure('contas', 'nome', 'Caixa Principal', {
      nome: 'Caixa Principal',
      tipo: 'caixa',
      saldo_inicial: 1500,
      cor: '#DF5830',
      ativa: true,
    })
    const banco = ensure('contas', 'nome', 'Banco PJ', {
      nome: 'Banco PJ',
      tipo: 'bancaria',
      saldo_inicial: 8200,
      cor: '#1E6F5C',
      ativa: true,
    })
    const cartao = ensure('contas', 'nome', 'Cartão Corporativo', {
      nome: 'Cartão Corporativo',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#4C3A8C',
      ativa: true,
    })

    const contaML = ensure('marketplace_contas', 'apelido', 'Loja Mercado Livre', {
      apelido: 'Loja Mercado Livre',
      marketplace: mercadoLivre.id,
      conta: banco.id,
      comissao_percentual: 12.5,
      ativa: true,
    })
    const contaShopee = ensure('marketplace_contas', 'apelido', 'Loja Shopee', {
      apelido: 'Loja Shopee',
      marketplace: shopee.id,
      conta: banco.id,
      comissao_percentual: 14,
      ativa: true,
    })
    const contaAmazon = ensure('marketplace_contas', 'apelido', 'Loja Amazon', {
      apelido: 'Loja Amazon',
      marketplace: amazon.id,
      conta: banco.id,
      comissao_percentual: 15,
      ativa: true,
    })

    const empresaA = ensure('empresas', 'cnpj', '12.345.678/0001-95', {
      nome_fantasia: 'Estrela Dourada',
      razao_social: 'Padaria Estrela Dourada LTDA',
      cnpj: '12.345.678/0001-95',
      email: 'financeiro@estreladourada.com.br',
      telefone: '(11) 3456-7890',
      endereco: 'Rua das Flores, 245 - São Paulo/SP',
      observacoes: 'Cliente recorrente',
    })
    const empresaB = ensure('empresas', 'cnpj', '11.222.333/0001-81', {
      nome_fantasia: 'Bela Vista Suprimentos',
      razao_social: 'Fornecedor Bela Vista Comércio LTDA',
      cnpj: '11.222.333/0001-81',
      email: 'contato@belavistasuprimentos.com.br',
      telefone: '(11) 3022-1144',
      endereco: 'Av. Central, 890 - Campinas/SP',
      observacoes: 'Fornecedor homologado',
    })
    const pessoaA = ensure('pessoas', 'cpf', '529.982.247-25', {
      nome: 'Carolina Mendes',
      cpf: '529.982.247-25',
      email: 'carolina.mendes@email.com',
      telefone: '(11) 98845-2210',
      observacoes: 'Contato comercial',
    })
    const pessoaB = ensure('pessoas', 'cpf', '168.995.350-09', {
      nome: 'Rafael Nogueira',
      cpf: '168.995.350-09',
      email: 'rafael.nogueira@email.com',
      telefone: '(19) 99710-4432',
      observacoes: 'Prestador de serviços',
    })

    const launches = [
      [
        'seed-venda-direta-01',
        'Venda balcão — pedido 1048',
        1280,
        'receita',
        monthDate(0, 3),
        'pago',
        caixa.id,
        vendasDiretas.id,
        empresaA.id,
        '',
      ],
      [
        'seed-estoque-01',
        'Reposição de estoque',
        845.9,
        'despesa',
        monthDate(0, 5),
        'pago',
        banco.id,
        fornecedores.id,
        empresaB.id,
        '',
      ],
      [
        'seed-frete-01',
        'Fretes da primeira quinzena',
        286.4,
        'despesa',
        monthDate(0, 8),
        'pago',
        banco.id,
        frete.id,
        '',
        '',
      ],
      [
        'seed-venda-market-01',
        'Recebimentos marketplaces',
        3640.75,
        'receita',
        monthDate(0, 10),
        'pago',
        banco.id,
        vendasMarketplace.id,
        '',
        '',
      ],
      [
        'seed-marketing-01',
        'Campanha de produtos patrocinados',
        520,
        'despesa',
        monthDate(0, 12),
        'pendente',
        cartao.id,
        marketing.id,
        '',
        pessoaA.id,
      ],
      [
        'seed-impostos-01',
        'DAS do mês',
        742.18,
        'despesa',
        monthDate(0, 15),
        'pendente',
        banco.id,
        impostos.id,
        '',
        '',
      ],
      [
        'seed-aluguel-anterior',
        'Aluguel do ponto comercial',
        2100,
        'despesa',
        monthDate(-1, 6),
        'pago',
        banco.id,
        aluguel.id,
        '',
        '',
      ],
      [
        'seed-comissoes-anterior',
        'Comissões de marketplaces',
        918.25,
        'despesa',
        monthDate(-1, 14),
        'pago',
        banco.id,
        comissoes.id,
        '',
        '',
      ],
      [
        'seed-vendas-anterior',
        'Vendas do fechamento mensal',
        6875.3,
        'receita',
        monthDate(-1, 20),
        'pago',
        banco.id,
        vendasMarketplace.id,
        '',
        '',
      ],
    ]
    for (let i = 0; i < launches.length; i++) {
      const item = launches[i]
      if (!find('lancamentos', 'observacoes', item[0])) {
        create('lancamentos', {
          descricao: item[1],
          valor: item[2],
          tipo: item[3],
          data: item[4],
          status: item[5],
          conta: item[6],
          categoria: item[7],
          empresa: item[8],
          pessoa: item[9],
          observacoes: item[0],
        })
      }
    }

    const sales = [
      ['MLB-250381', contaML, monthDate(0, 2), 459.9, 18.5, 'paga'],
      ['SHP-884102', contaShopee, monthDate(0, 4), 219.8, 9.9, 'pendente'],
      ['AMZ-771209', contaAmazon, monthDate(0, 6), 734.5, 24.8, 'paga'],
      ['MLB-250947', contaML, monthDate(0, 9), 1289, 36.2, 'pendente'],
      ['SHP-885633', contaShopee, monthDate(0, 11), 389.7, 12.5, 'paga'],
      ['AMZ-773845', contaAmazon, monthDate(0, 13), 569.9, 16.9, 'pendente'],
      ['MLB-252110', contaML, monthDate(0, 16), 899, 27.4, 'paga'],
    ]
    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i]
      if (!find('vendas', 'pedido_id', sale[0])) {
        const commission =
          Math.round(sale[3] * sale[1].getFloat('comissao_percentual') * 100) / 10000
        create('vendas', {
          pedido_id: sale[0],
          marketplace_conta: sale[1].id,
          data: sale[2],
          valor_bruto: sale[3],
          comissao: commission,
          taxas: sale[4],
          valor_liquido: Math.round((sale[3] - commission - sale[4]) * 100) / 100,
          status: sale[5],
        })
      }
    }

    if (!find('repasses', 'valor', 2475.8)) {
      create('repasses', {
        marketplace_conta: contaML.id,
        periodo_inicio: monthDate(0, 1),
        periodo_fim: monthDate(0, 15),
        valor: 2475.8,
        data_prevista: dayDate(7),
        status: 'previsto',
      })
    }
    if (!find('repasses', 'valor', 1832.45)) {
      create('repasses', {
        marketplace_conta: contaShopee.id,
        periodo_inicio: monthDate(-1, 16),
        periodo_fim: monthDate(-1, 28),
        valor: 1832.45,
        data_prevista: dayDate(-8),
        data_realizada: dayDate(-7),
        status: 'realizado',
      })
    }
  },
  (app) => {
    const collections = [
      'repasses',
      'vendas',
      'lancamentos',
      'marketplace_contas',
      'pessoas',
      'empresas',
      'contas',
      'categorias',
      'marketplaces',
    ]
    for (let i = 0; i < collections.length; i++) {
      try {
        app.truncateCollection(app.findCollectionByNameOrId(collections[i]))
      } catch (_) {}
    }
    try {
      const admin = app.findAuthRecordByEmail('users', 'marioeduardomari@gmail.com')
      app.delete(admin)
    } catch (_) {}
  },
)
