/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0127: Criação do Catálogo de Insumos e Serviços Terceirizados
 * com Rastreabilidade de Origem e Dimensões (2D / 3D).
 */
migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const fornecedoresCol = app.findCollectionByNameOrId('fornecedores')

    // 1. Coleção 'insumos_categorias'
    let colCategorias
    try {
      colCategorias = app.findCollectionByNameOrId('insumos_categorias')
    } catch {
      colCategorias = null
    }

    if (!colCategorias) {
      colCategorias = new Collection({
        name: 'insumos_categorias',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: authenticated,
        updateRule: authenticated,
        deleteRule: authenticated,
        fields: [
          { name: 'nome', type: 'text', required: true, max: 120 },
          { name: 'cor', type: 'text', required: false, max: 30 },
          { name: 'ordem', type: 'number', required: false },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_insumos_cat_nome ON insumos_categorias (nome)',
          'CREATE INDEX idx_insumos_cat_ordem ON insumos_categorias (ordem)',
        ],
      })
      app.save(colCategorias)
    }

    // Registros-semente de categorias de insumos
    const sementesCategorias = [
      { nome: 'Embalagem', cor: '#DF5830', ordem: 10 },
      { nome: 'Tecido', cor: '#0284C7', ordem: 20 },
      { nome: 'Etiqueta', cor: '#D97706', ordem: 30 },
      { nome: 'Aviamento', cor: '#7C3AED', ordem: 40 },
      { nome: 'Serviço de Costura', cor: '#10B981', ordem: 50 },
      { nome: 'Impressão', cor: '#EC4899', ordem: 60 },
    ]

    for (const cat of sementesCategorias) {
      try {
        const existe = app.findFirstRecordByFilter('insumos_categorias', 'nome = {:nome}', {
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

    // 2. Coleção 'insumos'
    let colInsumos
    try {
      colInsumos = app.findCollectionByNameOrId('insumos')
    } catch {
      colInsumos = null
    }

    if (!colInsumos) {
      colInsumos = new Collection({
        name: 'insumos',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: authenticated,
        updateRule: authenticated,
        deleteRule: authenticated,
        fields: [
          { name: 'nome', type: 'text', required: true, max: 200 },
          {
            name: 'categoria',
            type: 'relation',
            required: false,
            collectionId: colCategorias.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['insumo', 'servico'],
            maxSelect: 1,
          },
          {
            name: 'dimensao_tipo',
            type: 'select',
            required: false,
            values: ['nenhuma', '2d', '3d'],
            maxSelect: 1,
          },
          { name: 'dimensao_largura_cm', type: 'number', required: false, min: 0 },
          { name: 'dimensao_altura_cm', type: 'number', required: false, min: 0 },
          { name: 'dimensao_comprimento_cm', type: 'number', required: false, min: 0 },
          { name: 'unidade', type: 'text', required: false, max: 20 },
          { name: 'valor_unitario', type: 'number', required: false, min: 0 },
          {
            name: 'fornecedor',
            type: 'relation',
            required: false,
            collectionId: fornecedoresCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'observacoes', type: 'text', required: false, max: 500 },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_insumos_nome ON insumos (nome)',
          'CREATE INDEX idx_insumos_categoria ON insumos (categoria)',
          'CREATE INDEX idx_insumos_tipo ON insumos (tipo)',
          'CREATE INDEX idx_insumos_fornecedor ON insumos (fornecedor)',
          'CREATE INDEX idx_insumos_ativo ON insumos (ativo)',
        ],
      })
      app.save(colInsumos)
    }
  },
  (app) => {
    const list = ['insumos', 'insumos_categorias']
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
