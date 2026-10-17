/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0129: Adicionar campo 'tipos' (multi-seleção: revenda | insumos | servicos)
 * na coleção 'fornecedores'.
 */
migrate(
  (app) => {
    const fornecedoresCol = app.findCollectionByNameOrId('fornecedores')

    if (!fornecedoresCol.fields.getByName('tipos')) {
      fornecedoresCol.fields.add(
        new SelectField({
          name: 'tipos',
          required: false,
          maxSelect: 3,
          values: ['revenda', 'insumos', 'servicos'],
        }),
      )
      app.save(fornecedoresCol)
    }

    // Backfill inteligente de fornecedores existentes
    const records = app.findRecordsByFilter('fornecedores', '', 'created', 500, 0)
    for (let i = 0; i < records.length; i++) {
      const forn = records[i]
      const currentTipos = forn.get('tipos')
      if (Array.isArray(currentTipos) && currentTipos.length > 0) {
        continue
      }

      const tiposSet = new Set()

      // Verificar se possui produtos em fornecedores_produtos
      try {
        const prods = app.findRecordsByFilter(
          'fornecedores_produtos',
          `fornecedor = '${forn.id}'`,
          'created',
          1,
          0,
        )
        if (prods.length > 0) {
          tiposSet.add('revenda')
        }
      } catch (_) {}

      // Verificar se possui insumos
      try {
        const ins = app.findRecordsByFilter(
          'insumos',
          `fornecedor = '${forn.id}'`,
          'created',
          10,
          0,
        )
        for (let j = 0; j < ins.length; j++) {
          const t = ins[j].getString('tipo')
          if (t === 'servico') {
            tiposSet.add('servicos')
          } else {
            tiposSet.add('insumos')
          }
        }
      } catch (_) {}

      // Se não tem nada associado ainda, atribui padrão 'revenda'
      if (tiposSet.size === 0) {
        tiposSet.add('revenda')
      }

      forn.set('tipos', Array.from(tiposSet))
      app.save(forn)
    }
  },
  (app) => {
    const fornecedoresCol = app.findCollectionByNameOrId('fornecedores')
    if (fornecedoresCol.fields.getByName('tipos')) {
      fornecedoresCol.fields.removeByName('tipos')
      app.save(fornecedoresCol)
    }
  },
)
