/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0132: Backfill rigoroso de fornecedores_produtos -> produtos_base e produtos
 */
migrate(
  (app) => {
    const colProdutosBase = app.findCollectionByNameOrId('produtos_base')
    const colProdutos = app.findCollectionByNameOrId('produtos')
    const fornecedoresCol = app.findCollectionByNameOrId('fornecedores')

    // 1. Migrar fornecedores_produtos para produtos_base
    try {
      const fornProds = app.findRecordsByFilter('fornecedores_produtos', '', '', 2000, 0)
      console.log('Total de fornecedores_produtos para migrar:', fornProds.length)

      for (let i = 0; i < fornProds.length; i++) {
        const fp = fornProds[i]
        let fornId = fp.getString('fornecedor')

        // Se o fornecedor estiver vazio ou inválido, busca o primeiro existente
        if (!fornId) {
          const primeiroForn = app.findRecordsByFilter('fornecedores', '', 'created', 1, 0)
          if (primeiroForn.length > 0) {
            fornId = primeiroForn[0].id
          }
        }
        if (!fornId) continue

        let existe = null
        try {
          existe = app.findFirstRecordByFilter(
            'produtos_base',
            "origem_colecao = 'fornecedores_produtos' && origem_id = {:id}",
            { id: fp.id },
          )
        } catch (_) {}

        if (!existe) {
          const pbRec = new Record(colProdutosBase)
          pbRec.set('nome', fp.getString('descricao') || 'Produto Base Revenda')
          pbRec.set('tipo', 'revenda')
          pbRec.set('fornecedor', fornId)
          pbRec.set('sku', fp.getString('sku_fornecedor') || '')
          pbRec.set('ncm', fp.getString('ncm') || '')
          pbRec.set('codigo_barras', fp.getString('codigo_barras') || '')
          pbRec.set('unidade', fp.getString('unidade') || 'un')
          const custo =
            fp.getFloat('preco_custo_unitario') || fp.getFloat('preco_ultima_compra') || 0
          pbRec.set('custo_unitario', custo)
          pbRec.set('dimensao_tipo', '3d')
          pbRec.set('dimensao_comprimento_cm', fp.getFloat('comprimento_cm') || 0)
          pbRec.set('dimensao_largura_cm', fp.getFloat('largura_cm') || 0)
          pbRec.set('dimensao_altura_cm', fp.getFloat('altura_cm') || 0)
          pbRec.set('peso_g', fp.getFloat('peso_g') || 0)
          pbRec.set('origem_colecao', 'fornecedores_produtos')
          pbRec.set('origem_id', fp.id)
          pbRec.set('ativo', fp.getBool('ativo'))
          pbRec.set('observacoes', fp.getString('observacoes') || '')

          app.save(pbRec)
        }
      }
    } catch (err) {
      console.warn('Erro ao migrar fornecedores_produtos para produtos_base em 0132:', err)
    }

    // 2. Criar ou sincronizar Produtos compostos para cada base de revenda
    try {
      const basesRevenda = app.findRecordsByFilter(
        'produtos_base',
        "tipo = 'revenda' && origem_colecao = 'fornecedores_produtos'",
        '',
        2000,
        0,
      )
      console.log('Total de produtos_base revenda:', basesRevenda.length)

      for (let i = 0; i < basesRevenda.length; i++) {
        const base = basesRevenda[i]
        let existeProd = null
        try {
          existeProd = app.findFirstRecordByFilter('produtos', 'base_origem = {:baseId}', {
            baseId: base.id,
          })
        } catch (_) {}

        if (!existeProd) {
          const p = new Record(colProdutos)
          p.set('nome', base.getString('nome'))
          p.set('classificacao', 'revenda')
          p.set('base_origem', base.id)
          const custoAquisicao = base.getFloat('custo_unitario') || 0
          p.set('custo_aquisicao', custoAquisicao)

          let custoEmbalagem = 0
          let custoEtiqueta = 0
          let compJson = null

          const origId = base.getString('origem_id')
          if (origId) {
            try {
              const fpOrig = app.findRecordById('fornecedores_produtos', origId)
              compJson = fpOrig.get('composicao')
              custoEmbalagem = fpOrig.getFloat('custo_adicional_embalagem') || 0
              custoEtiqueta = fpOrig.getFloat('custo_etiqueta') || 0
            } catch (_) {}
          }

          let custoComposicao = 0
          if (compJson && Array.isArray(compJson)) {
            p.set('composicao', compJson)
            for (let j = 0; j < compJson.length; j++) {
              const it = compJson[j]
              const q = Number(it.qtd) || 1
              const u = Number(it.custo_unitario) || 0
              custoComposicao += q * u
            }
          }

          p.set('custo_composicao', custoComposicao)
          p.set('custo_embalagem', custoEmbalagem)
          p.set('custo_etiqueta', custoEtiqueta)
          p.set('custo_total', custoAquisicao + custoComposicao + custoEmbalagem + custoEtiqueta)
          p.set('sku', base.getString('sku') || '')
          p.set('unidade', base.getString('unidade') || 'un')
          p.set('dimensao_comprimento_cm', base.getFloat('dimensao_comprimento_cm') || 0)
          p.set('dimensao_largura_cm', base.getFloat('dimensao_largura_cm') || 0)
          p.set('dimensao_altura_cm', base.getFloat('dimensao_altura_cm') || 0)
          p.set('peso_g', base.getFloat('peso_g') || 0)
          p.set('status', base.getBool('ativo') ? 'ativo' : 'inativo')

          app.save(p)
        }
      }
    } catch (err) {
      console.warn('Erro ao criar produtos a partir de produtos_base em 0132:', err)
    }
  },
  (app) => {
    // Reversão limpa
  },
)
