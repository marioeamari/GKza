/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    // 1. Criar coleção estabelecimentos
    const estabelecimentos = new Collection({
      name: 'estabelecimentos',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 200 },
        { name: 'apelido', type: 'text', required: false, max: 200 },
        { name: 'categoria', type: 'text', required: false, max: 100 },
        { name: 'ativa', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_estabelecimentos_nome ON estabelecimentos (nome)'],
    })
    app.save(estabelecimentos)

    // 2. Classificação e migração de dados de fornecedores -> estabelecimentos
    // Regra genérica:
    // - Fornecedores com produtos vinculados em fornecedores_produtos ficam em fornecedores.
    // - Fornecedores sem produtos vinculados migram para estabelecimentos (copia e remove de fornecedores).
    // - Se um fornecedor tiver produtos mas também constar em despesas/consumo (dois contextos), duplica:
    //   cria em estabelecimentos e mantém em fornecedores.

    let prods = []
    try {
      prods = app.findRecordsByFilter('fornecedores_produtos', '', '', 1000, 0)
    } catch (_) {}

    const fornecedorIdsComProdutos = new Set()
    for (let i = 0; i < prods.length; i++) {
      const fId = prods[i].getString('fornecedor')
      if (fId) fornecedorIdsComProdutos.add(fId)
    }

    let comps = []
    try {
      comps = app.findRecordsByFilter('despesas_compromisso', "fornecedor != ''", '', 1000, 0)
    } catch (_) {}

    const nomesCitadosEmDespesas = new Set()
    for (let i = 0; i < comps.length; i++) {
      const fNome = comps[i].getString('fornecedor')
      if (fNome) nomesCitadosEmDespesas.add(fNome.trim().toLowerCase())
    }

    let allFornecedores = []
    try {
      allFornecedores = app.findRecordsByFilter('fornecedores', '', '', 1000, 0)
    } catch (_) {}

    for (let i = 0; i < allFornecedores.length; i++) {
      const f = allFornecedores[i]
      const fId = f.id
      const nomeFantasia = (
        f.getString('nome_fantasia') ||
        f.getString('razao_social') ||
        ''
      ).trim()
      const razaoSocial = (f.getString('razao_social') || '').trim()
      const temProdutos = fornecedorIdsComProdutos.has(fId)

      const citadoEmDespesa =
        nomesCitadosEmDespesas.has(nomeFantasia.toLowerCase()) ||
        nomesCitadosEmDespesas.has(razaoSocial.toLowerCase())

      // Se não tem produtos de revenda OU (tem produtos E está citado em despesas -> duplica)
      if (!temProdutos || citadoEmDespesa) {
        // Criar registro em estabelecimentos
        const estRec = new Record(estabelecimentos)
        estRec.set('id', fId)
        estRec.set('nome', nomeFantasia || razaoSocial || 'Estabelecimento')
        estRec.set('apelido', razaoSocial && razaoSocial !== nomeFantasia ? razaoSocial : '')
        estRec.set('categoria', '')
        estRec.set('ativa', true)
        try {
          app.save(estRec)
        } catch (_) {
          const estFallback = new Record(estabelecimentos)
          estFallback.set('nome', nomeFantasia || razaoSocial || 'Estabelecimento')
          estFallback.set('apelido', razaoSocial && razaoSocial !== nomeFantasia ? razaoSocial : '')
          estFallback.set('categoria', '')
          estFallback.set('ativa', true)
          app.save(estFallback)
        }

        // Se NÃO tem produtos, remove de fornecedores (migração completa).
        // Se tem produtos (dois contextos), NÃO remove de fornecedores (duplicação preservada).
        if (!temProdutos) {
          app.delete(f)
        }
      }
    }
  },
  (app) => {
    try {
      const estabelecimentos = app.findCollectionByNameOrId('estabelecimentos')
      app.delete(estabelecimentos)
    } catch (_) {}
  },
)
