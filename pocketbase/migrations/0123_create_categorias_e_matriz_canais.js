/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0123: Suporte à Matriz de Presença por Canal e Categorias de Produtos:
 * (A) prec_categorias_produto: categorias de produtos gerenciadas pelo usuário
 *     Sementes: Toalha de Banho, Toalha de Rosto, Guardanapo, Porta-Tempero, Pet
 *     Backfill nos produtos existentes em prec_produtos quando identificável pelo nome
 *     (Toalha de Banho / Banho -> Toalha de Banho; Rosto -> Toalha de Rosto; etc.)
 * (B) prec_matriz_legendas: itens de legenda gerenciados pelo usuário (nome, cor, ordem, ativo)
 *     Sementes: 'Ativo' (#10B981 / verde), 'Rejeitado' (#EF4444 / vermelho), 'Em análise' (#F59E0B / amarelo)
 * (C) prec_matriz_classificacoes: classificação por produto + canal apontando para item_legenda
 */
migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    const precProdutos = app.findCollectionByNameOrId('prec_produtos')
    const precCanais = app.findCollectionByNameOrId('prec_canais')

    // 1. prec_categorias_produto
    let colCategorias
    try {
      colCategorias = app.findCollectionByNameOrId('prec_categorias_produto')
    } catch {
      colCategorias = null
    }

    if (!colCategorias) {
      colCategorias = new Collection({
        name: 'prec_categorias_produto',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: authenticated,
        updateRule: authenticated,
        deleteRule: adminOrManager,
        fields: [
          { name: 'nome', type: 'text', required: true, max: 120 },
          { name: 'descricao', type: 'text', required: false, max: 300 },
          { name: 'cor', type: 'text', required: false, max: 30 },
          { name: 'ordem', type: 'number', required: false },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_prec_cat_prod_nome ON prec_categorias_produto (nome)',
          'CREATE INDEX idx_prec_cat_prod_ordem ON prec_categorias_produto (ordem)',
        ],
      })
      app.save(colCategorias)
    }

    // Sementes de Categorias
    const sementesCategorias = [
      { nome: 'Toalha de Banho', cor: '#0284C7', ordem: 10 },
      { nome: 'Toalha de Rosto', cor: '#0D9488', ordem: 20 },
      { nome: 'Guardanapo', cor: '#E11D48', ordem: 30 },
      { nome: 'Porta-Tempero', cor: '#D97706', ordem: 40 },
      { nome: 'Pet', cor: '#7C3AED', ordem: 50 },
    ]

    for (const cat of sementesCategorias) {
      try {
        const existe = app.findFirstRecordByFilter('prec_categorias_produto', 'nome = {:nome}', {
          nome: cat.nome,
        })
        if (!existe) {
          const r = new Record(colCategorias)
          r.set('nome', cat.nome)
          r.set('cor', cat.cor)
          r.set('ordem', cat.ordem)
          r.set('ativo', true)
          app.save(r)
        }
      } catch {
        const r = new Record(colCategorias)
        r.set('nome', cat.nome)
        r.set('cor', cat.cor)
        r.set('ordem', cat.ordem)
        r.set('ativo', true)
        app.save(r)
      }
    }

    // 2. prec_matriz_legendas
    let colLegendas
    try {
      colLegendas = app.findCollectionByNameOrId('prec_matriz_legendas')
    } catch {
      colLegendas = null
    }

    if (!colLegendas) {
      colLegendas = new Collection({
        name: 'prec_matriz_legendas',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: authenticated,
        updateRule: authenticated,
        deleteRule: adminOrManager,
        fields: [
          { name: 'nome', type: 'text', required: true, max: 100 },
          { name: 'cor', type: 'text', required: true, max: 30 },
          { name: 'cor_texto', type: 'text', required: false, max: 30 },
          { name: 'ordem', type: 'number', required: false },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'descricao', type: 'text', required: false, max: 200 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_prec_matriz_leg_nome ON prec_matriz_legendas (nome)',
          'CREATE INDEX idx_prec_matriz_leg_ordem ON prec_matriz_legendas (ordem)',
        ],
      })
      app.save(colLegendas)
    }

    // Sementes de Legendas
    const sementesLegendas = [
      {
        nome: 'Ativo',
        cor: '#10B981',
        cor_texto: '#FFFFFF',
        ordem: 10,
        descricao: 'Produto cadastrado e ativo no canal',
      },
      {
        nome: 'Rejeitado',
        cor: '#EF4444',
        cor_texto: '#FFFFFF',
        ordem: 20,
        descricao: 'Produto recusado/rejeitado no canal',
      },
      {
        nome: 'Em análise',
        cor: '#F59E0B',
        cor_texto: '#FFFFFF',
        ordem: 30,
        descricao: 'Produto em processo de aprovação ou conferência',
      },
    ]

    for (const leg of sementesLegendas) {
      try {
        const existe = app.findFirstRecordByFilter('prec_matriz_legendas', 'nome = {:nome}', {
          nome: leg.nome,
        })
        if (!existe) {
          const r = new Record(colLegendas)
          r.set('nome', leg.nome)
          r.set('cor', leg.cor)
          r.set('cor_texto', leg.cor_texto)
          r.set('ordem', leg.ordem)
          r.set('ativo', true)
          r.set('descricao', leg.descricao)
          app.save(r)
        }
      } catch {
        const r = new Record(colLegendas)
        r.set('nome', leg.nome)
        r.set('cor', leg.cor)
        r.set('cor_texto', leg.cor_texto)
        r.set('ordem', leg.ordem)
        r.set('ativo', true)
        r.set('descricao', leg.descricao)
        app.save(r)
      }
    }

    // 3. prec_matriz_classificacoes (produto + canal -> item_legenda)
    let colClassificacoes
    try {
      colClassificacoes = app.findCollectionByNameOrId('prec_matriz_classificacoes')
    } catch {
      colClassificacoes = null
    }

    if (!colClassificacoes) {
      colClassificacoes = new Collection({
        name: 'prec_matriz_classificacoes',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: authenticated,
        updateRule: authenticated,
        deleteRule: adminOrManager,
        fields: [
          {
            name: 'produto',
            type: 'relation',
            required: true,
            collectionId: precProdutos.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'canal',
            type: 'relation',
            required: true,
            collectionId: precCanais.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'legenda',
            type: 'relation',
            required: true,
            collectionId: colLegendas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'observacao', type: 'text', required: false, max: 300 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_prec_matriz_prod_canal ON prec_matriz_classificacoes (produto, canal)',
          'CREATE INDEX idx_prec_matriz_leg ON prec_matriz_classificacoes (legenda)',
        ],
      })
      app.save(colClassificacoes)
    }

    // 4. Backfill de categoria em prec_produtos quando identificável pelo nome
    // Regra acordada: preencher quando identificável pelo nome; sem adivinhar (deixar sem categoria quando duvidoso).
    // Exemplos identificáveis:
    // - "Banho" (ex: "Banho Folha", "Banho Allure", "Kit 3 Banho Isa", "Toalha Banhão") -> "Toalha de Banho"
    // - "Rosto" (ex: "Rosto Folha", "Rosto Esmeralda", "Kit com 7 Rosto") -> "Toalha de Rosto"
    // - "Guardanapo" / "Pano Atoalhado" / "Pano de Prato" / "Pano Baiana" -> não adivinhar exceto se for Guardanapo explícito
    // - "Tempero" / "Porta Tempero" -> "Porta-Tempero"
    // - "Pet" / "Cachorro" / "Gato" -> "Pet"
    try {
      const produtos = app.findRecordsByFilter('prec_produtos', '', '', 5000, 0)
      for (const p of produtos) {
        const catAtual = (p.get('categoria') || '').trim()
        const nome = (p.get('nome') || '').trim()
        const lower = nome.toLowerCase()

        let novaCategoria = ''

        // Se já tem categoria 'Banho' ou 'Banho Banhão', normalizar para a semente oficial 'Toalha de Banho'
        if (catAtual === 'Banho' || catAtual === 'Banho Banhão') {
          novaCategoria = 'Toalha de Banho'
        } else if (catAtual === 'Rosto') {
          novaCategoria = 'Toalha de Rosto'
        } else if (!catAtual) {
          // Só deduz se estiver sem categoria
          if (lower.includes('banho') || lower.includes('banhão') || lower.includes('banhao')) {
            novaCategoria = 'Toalha de Banho'
          } else if (lower.includes('rosto')) {
            novaCategoria = 'Toalha de Rosto'
          } else if (lower.includes('guardanapo')) {
            novaCategoria = 'Guardanapo'
          } else if (
            lower.includes('tempero') ||
            lower.includes('porta-tempero') ||
            lower.includes('porta tempero')
          ) {
            novaCategoria = 'Porta-Tempero'
          } else if (
            /\bpet\b/i.test(nome) ||
            lower.includes('cachorro') ||
            lower.includes('gato')
          ) {
            novaCategoria = 'Pet'
          }
        }

        if (novaCategoria && novaCategoria !== catAtual) {
          p.set('categoria', novaCategoria)
          app.save(p)
        }
      }
    } catch (err) {
      console.warn('Aviso no backfill de categorias da migração 0123:', err)
    }
  },
  (app) => {
    const list = ['prec_matriz_classificacoes', 'prec_matriz_legendas', 'prec_categorias_produto']
    for (const name of list) {
      try {
        const col = app.findCollectionByNameOrId(name)
        if (col) app.delete(col)
      } catch {
        // ignore
      }
    }
  },
)
