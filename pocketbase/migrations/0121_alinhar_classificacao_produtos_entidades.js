/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0121: Alinhar classificação de produtos às 3 entidades:
 * - Empresa (/empresas): detém com exclusividade produtos de fabricação própria (tipo='fabricacao_propria')
 * - Fornecedor (/fornecedores): detém com exclusividade produtos de revenda (tipo='revenda')
 * - Catálogo/Kits (/precificacao/produtos): reino exclusivo de kits e combos (tipo IN ('kit','combo')), sem empresa/fornecedor
 *
 * Ações:
 * 1. UPDATE prec_produtos SET empresa='' WHERE tipo IN ('kit','combo') AND empresa != '';
 * 2. UPDATE prec_produtos SET empresa='' WHERE tipo='revenda' AND fornecedor != '' AND empresa != '';
 * 3. Varrer fornecedores_produtos sem espelho em prec_produtos e criar o espelho tipo='revenda' com fornecedor e fornecedor_produto, sem empresa.
 */
migrate(
  (app) => {
    // 1. Limpar empresa de kits e combos
    app
      .db()
      .newQuery(
        "UPDATE prec_produtos SET empresa='' WHERE tipo IN ('kit','combo') AND empresa != ''",
      )
      .execute()

    // 2. Limpar empresa de produtos de revenda
    app
      .db()
      .newQuery("UPDATE prec_produtos SET empresa='' WHERE tipo='revenda' AND empresa != ''")
      .execute()

    // 3. Varrer fornecedores_produtos sem espelho em prec_produtos e criar espelho tipo='revenda'
    const precCol = app.findCollectionByNameOrId('prec_produtos')
    let existingPrec = []
    try {
      existingPrec = app.findRecordsByFilter('prec_produtos', '', '', 2000, 0)
    } catch (e) {
      console.warn('Erro ao carregar prec_produtos na migracao 0121:', e)
    }

    const mirrorByFpId = new Map()
    const usedSkus = new Set()

    for (const p of existingPrec) {
      const fpId = p.get('fornecedor_produto')
      if (fpId) {
        mirrorByFpId.set(fpId, p)
      }
      const s = (p.get('sku') || '').trim().toLowerCase()
      if (s) {
        usedSkus.add(s)
      }
    }

    let fpRecords = []
    try {
      fpRecords = app.findRecordsByFilter('fornecedores_produtos', '', '', 2000, 0)
    } catch (e) {
      console.warn('Erro ao carregar fornecedores_produtos na migracao 0121:', e)
    }

    const gerarSkuUnico = (baseSku, fpId) => {
      let candidate = (baseSku || '').trim()
      if (!candidate) {
        candidate = 'REV-' + (fpId || '').toUpperCase().slice(0, 10)
      }
      if (!candidate) {
        candidate = 'REV-' + Date.now().toString(36).toUpperCase()
      }
      if (!usedSkus.has(candidate.toLowerCase())) {
        usedSkus.add(candidate.toLowerCase())
        return candidate
      }
      let counter = 2
      while (usedSkus.has((candidate + '-' + counter).toLowerCase())) {
        counter++
      }
      const finalSku = candidate + '-' + counter
      usedSkus.add(finalSku.toLowerCase())
      return finalSku
    }

    for (const fp of fpRecords) {
      const fpId = fp.id
      if (mirrorByFpId.has(fpId)) {
        continue
      }

      try {
        const skuForn = (fp.get('sku_fornecedor') || '').trim()
        const skuFinal = gerarSkuUnico(skuForn, fpId)

        const precoCusto =
          Number(fp.get('preco_custo_unitario')) || Number(fp.get('preco_ultima_compra')) || 0
        const nomeProd = (fp.get('descricao') || '').trim() || 'Produto ' + skuFinal

        const novoMirror = new Record(precCol)
        novoMirror.set('tipo', 'revenda')
        novoMirror.set('status', fp.get('ativo') === false ? 'inativo' : 'ativo')
        novoMirror.set('sku', skuFinal)
        novoMirror.set('nome', nomeProd)
        novoMirror.set('marca', fp.get('marca') || '')
        novoMirror.set('categoria', fp.get('categoria') || '')
        novoMirror.set('unidade', fp.get('unidade') || 'un')
        novoMirror.set('fornecedor', fp.get('fornecedor') || '')
        novoMirror.set('fornecedor_produto', fpId)
        novoMirror.set('empresa', '') // estritamente sem empresa
        novoMirror.set('codigo_barras', fp.get('codigo_barras') || '')
        novoMirror.set('embalagem', fp.get('embalagem') || '')
        novoMirror.set('custo_aquisicao_unitario', precoCusto)
        novoMirror.set('peso_g', Number(fp.get('peso_g')) || 0)
        novoMirror.set('dimensao_comprimento_cm', Number(fp.get('comprimento_cm')) || 0)
        novoMirror.set('dimensao_largura_cm', Number(fp.get('largura_cm')) || 0)
        novoMirror.set('dimensao_altura_cm', Number(fp.get('altura_cm')) || 0)

        const img = fp.get('imagem')
        if (img) {
          novoMirror.set('imagem', img)
        }

        app.save(novoMirror)
        mirrorByFpId.set(fpId, novoMirror)
      } catch (err) {
        console.warn(
          'Erro ao criar espelho prec_produtos na migracao 0121 para fp ' + fpId + ':',
          err,
        )
      }
    }
  },
  (app) => {
    // Reversão não é necessária pois limpa dados inconsistentes
  },
)
