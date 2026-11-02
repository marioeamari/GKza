/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0145: Coleção 'insumos_tipos' (Tipos de Custo / Insumo) e vínculo em 'produtos_base'
 * - Criação da coleção 'insumos_tipos' com nome, codigo, cor, ordem, ativo
 * - Seed idempotente com os tipos originais:
 *   - 'insumo' -> Insumo Geral (#DF5830)
 *   - 'embalagem' -> Embalagem (#0284C7)
 *   - 'etiqueta' -> Etiqueta (#D97706)
 *   - 'tecido' -> Tecido / Malha (#7C3AED)
 *   - 'servico' -> Serviço Terceirizado (#10B981)
 *   - 'costura' -> Costura (#0D9488)
 *   - 'pintura' -> Pintura (#E11D48)
 *   - 'revenda' -> Produto de Revenda (#6366F1)
 *   - 'outro' -> Outro (#64748B)
 * - Adiciona campo 'tipo_ref' (relation a insumos_tipos) em 'produtos_base'
 * - Backfill idempotente: associa tipo_ref nos registros existentes de produtos_base baseado no campo 'tipo'
 */
migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"

    // 1. Coleção 'insumos_tipos'
    let colTipos
    try {
      colTipos = app.findCollectionByNameOrId('insumos_tipos')
    } catch {
      colTipos = null
    }

    if (!colTipos) {
      colTipos = new Collection({
        name: 'insumos_tipos',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: authenticated,
        updateRule: authenticated,
        deleteRule: authenticated,
        fields: [
          { name: 'nome', type: 'text', required: true, max: 120 },
          { name: 'codigo', type: 'text', required: false, max: 60 },
          { name: 'cor', type: 'text', required: false, max: 30 },
          { name: 'ordem', type: 'number', required: false },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_insumos_tipos_nome ON insumos_tipos (nome)',
          'CREATE INDEX idx_insumos_tipos_codigo ON insumos_tipos (codigo)',
          'CREATE INDEX idx_insumos_tipos_ordem ON insumos_tipos (ordem)',
        ],
      })
      app.save(colTipos)
    }

    // 2. Sementes idempotentes
    const sementes = [
      { nome: 'Insumo Geral', codigo: 'insumo', cor: '#DF5830', ordem: 10 },
      { nome: 'Embalagem', codigo: 'embalagem', cor: '#0284C7', ordem: 20 },
      { nome: 'Etiqueta', codigo: 'etiqueta', cor: '#D97706', ordem: 30 },
      { nome: 'Tecido / Malha', codigo: 'tecido', cor: '#7C3AED', ordem: 40 },
      { nome: 'Serviço Terceirizado', codigo: 'servico', cor: '#10B981', ordem: 50 },
      { nome: 'Costura', codigo: 'costura', cor: '#0D9488', ordem: 60 },
      { nome: 'Pintura', codigo: 'pintura', cor: '#E11D48', ordem: 70 },
      { nome: 'Produto de Revenda', codigo: 'revenda', cor: '#6366F1', ordem: 80 },
      { nome: 'Outro', codigo: 'outro', cor: '#64748B', ordem: 90 },
    ]

    const tipoIdByCodigo = {}
    for (const sem of sementes) {
      let rec = null
      try {
        rec = app.findFirstRecordByFilter('insumos_tipos', 'nome = {:nome} || codigo = {:codigo}', {
          nome: sem.nome,
          codigo: sem.codigo,
        })
      } catch {
        rec = null
      }

      if (!rec) {
        rec = new Record(colTipos)
        rec.set('nome', sem.nome)
        rec.set('codigo', sem.codigo)
        rec.set('cor', sem.cor)
        rec.set('ordem', sem.ordem)
        rec.set('ativo', true)
        app.save(rec)
      } else {
        if (!rec.getString('codigo')) {
          rec.set('codigo', sem.codigo)
          app.save(rec)
        }
      }
      tipoIdByCodigo[sem.codigo] = rec.id
    }

    // 3. Adicionar campo 'tipo_ref' em 'produtos_base' caso não exista
    const colProdutosBase = app.findCollectionByNameOrId('produtos_base')
    if (!colProdutosBase.fields.getByName('tipo_ref')) {
      colProdutosBase.fields.add(
        new RelationField({
          name: 'tipo_ref',
          collectionId: colTipos.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(colProdutosBase)
    }

    // 4. Backfill em produtos_base: preencher tipo_ref onde estiver vazio
    try {
      const bases = app.findRecordsByFilter('produtos_base', '', '', 2000, 0)
      for (let i = 0; i < bases.length; i++) {
        const b = bases[i]
        const tipoAtualRef = b.getString('tipo_ref')
        if (tipoAtualRef) continue

        const tipoSelect = b.getString('tipo')
        const targetId = tipoIdByCodigo[tipoSelect] || tipoIdByCodigo['insumo']
        if (targetId) {
          b.set('tipo_ref', targetId)
          app.save(b)
        }
      }
    } catch (err) {
      console.warn('[Migração 0145] Erro durante backfill de tipo_ref em produtos_base:', err)
    }
  },
  (app) => {
    try {
      const colPb = app.findCollectionByNameOrId('produtos_base')
      if (colPb.fields.getByName('tipo_ref')) {
        colPb.fields.removeByName('tipo_ref')
        app.save(colPb)
      }
    } catch {}

    try {
      const col = app.findCollectionByNameOrId('insumos_tipos')
      if (col) app.delete(col)
    } catch {}
  },
)
