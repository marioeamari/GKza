/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0133: Unificação definitiva de insumos em produtos_base
 * - Adiciona campo 'categoria' (relation a insumos_categorias) em 'produtos_base' caso não exista
 * - Backfill idempotente de registros criados em 'insumos' após a migração 0132
 * - Identifica registros pelo par (origem_colecao = 'insumos' && origem_id = insumo.id) ou nome+fornecedor
 * - Garante que "Etiqueta Couro GKza" e outros insumos recentes entrem no catálogo de produtos_base
 */
migrate(
  (app) => {
    const colProdutosBase = app.findCollectionByNameOrId('produtos_base')
    let colInsumosCategorias = null
    try {
      colInsumosCategorias = app.findCollectionByNameOrId('insumos_categorias')
    } catch (_) {}

    // 1. Adicionar campo 'categoria' em produtos_base se ainda não existir
    if (colInsumosCategorias && !colProdutosBase.fields.getByName('categoria')) {
      colProdutosBase.fields.add(
        new RelationField({
          name: 'categoria',
          collectionId: colInsumosCategorias.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(colProdutosBase)
    }

    // 2. Localizar fornecedor padrão caso algum insumo esteja sem fornecedor
    let fallbackFornId = ''
    try {
      const primeiroForn = app.findRecordsByFilter('fornecedores', '', 'created', 1, 0)
      if (primeiroForn.length > 0) {
        fallbackFornId = primeiroForn[0].id
      }
    } catch (_) {}

    // 3. Backfill idempotente de 'insumos' para 'produtos_base'
    try {
      const insumos = app.findRecordsByFilter('insumos', '', 'created', 5000, 0)

      for (let i = 0; i < insumos.length; i++) {
        const ins = insumos[i]
        const insId = ins.id
        const fornId = ins.getString('fornecedor') || fallbackFornId
        const nome = ins.getString('nome') || 'Insumo'

        // 3.1. Verificar se já existe em produtos_base por origem_id
        let existe = null
        try {
          existe = app.findFirstRecordByFilter(
            'produtos_base',
            "origem_colecao = 'insumos' && origem_id = {:id}",
            { id: insId },
          )
        } catch (_) {}

        // 3.2. Se não achou por origem_id, verifica por nome e fornecedor para evitar duplicidade
        if (!existe && fornId) {
          try {
            existe = app.findFirstRecordByFilter(
              'produtos_base',
              'nome = {:nome} && fornecedor = {:fornId}',
              { nome, fornId },
            )
          } catch (_) {}
        }

        if (existe) {
          // Se já existe e não tem categoria gravada, atualiza com a categoria do insumo se houver
          const catId = ins.getString('categoria')
          if (
            catId &&
            !existe.getString('categoria') &&
            colProdutosBase.fields.getByName('categoria')
          ) {
            try {
              existe.set('categoria', catId)
              app.save(existe)
            } catch (_) {}
          }
          continue
        }

        if (!fornId) {
          console.warn(
            `[Migração 0133] Insumo "${nome}" (${insId}) ignorado pois não possui fornecedor.`,
          )
          continue
        }

        // Determinar tipo no catálogo de produtos_base:
        // Valores permitidos: 'revenda', 'insumo', 'servico', 'embalagem', 'etiqueta', 'tecido', 'pintura', 'costura', 'outro'
        const insTipo = ins.getString('tipo')
        const catId = ins.getString('categoria')
        let catNome = ''
        if (catId) {
          try {
            const catRec = app.findRecordById('insumos_categorias', catId)
            catNome = (catRec.getString('nome') || '').toLowerCase()
          } catch (_) {}
        }

        const nomeLower = nome.toLowerCase()
        let tipoFinal = 'insumo'
        if (insTipo === 'servico' || catNome.includes('servico') || catNome.includes('serviço')) {
          tipoFinal = 'servico'
        } else if (catNome.includes('etiqueta') || nomeLower.includes('etiqueta')) {
          tipoFinal = 'etiqueta'
        } else if (
          catNome.includes('embalagem') ||
          nomeLower.includes('embalagem') ||
          nomeLower.includes('caixa')
        ) {
          tipoFinal = 'embalagem'
        } else if (
          catNome.includes('tecido') ||
          nomeLower.includes('tecido') ||
          nomeLower.includes('malha')
        ) {
          tipoFinal = 'tecido'
        } else if (catNome.includes('pintura') || nomeLower.includes('pintura')) {
          tipoFinal = 'pintura'
        } else if (catNome.includes('costura') || nomeLower.includes('costura')) {
          tipoFinal = 'costura'
        }

        const pbRec = new Record(colProdutosBase)
        pbRec.set('nome', nome)
        pbRec.set('tipo', tipoFinal)
        pbRec.set('fornecedor', fornId)
        pbRec.set('unidade', ins.getString('unidade') || 'un')
        pbRec.set('custo_unitario', ins.getFloat('valor_unitario') || 0)
        pbRec.set('dimensao_tipo', ins.getString('dimensao_tipo') || 'nenhuma')
        pbRec.set('dimensao_comprimento_cm', ins.getFloat('dimensao_comprimento_cm') || 0)
        pbRec.set('dimensao_largura_cm', ins.getFloat('dimensao_largura_cm') || 0)
        pbRec.set('dimensao_altura_cm', ins.getFloat('dimensao_altura_cm') || 0)
        pbRec.set('origem_colecao', 'insumos')
        pbRec.set('origem_id', insId)
        pbRec.set('ativo', ins.getBool('ativo'))
        pbRec.set('observacoes', ins.getString('observacoes') || '')

        if (catId && colProdutosBase.fields.getByName('categoria')) {
          pbRec.set('categoria', catId)
        }

        app.save(pbRec)
        console.log(
          `[Migração 0133] Insumo "${nome}" (${insId}) migrado com sucesso para produtos_base (${pbRec.id}).`,
        )
      }
    } catch (err) {
      console.warn('[Migração 0133] Erro ao executar backfill de insumos para produtos_base:', err)
    }
  },
  (app) => {
    // Reversão
    try {
      const migrados = app.findRecordsByFilter(
        'produtos_base',
        "origem_colecao = 'insumos'",
        '',
        5000,
        0,
      )
      // Preservamos registros por segurança no down
    } catch (_) {}
  },
)
