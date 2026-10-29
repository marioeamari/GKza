/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // =========================================================================
    // 0142: Fix Precificação Revenda, BLeve, Taxas e SKU por Canal
    // =========================================================================

    // (b) Atualizar coleções de taxas de canal: responsavel 'marketplace' -> 'vendedor'
    // nas taxas de comissão, taxa por item / tarifa_fixa / transação e recarga ADS
    try {
      app
        .db()
        .newQuery(
          "UPDATE prec_taxas SET responsavel = 'vendedor' WHERE responsavel = 'marketplace' AND (tipo_regra IN ('comissao', 'tarifa_fixa', 'transacao', 'campanha') OR nome LIKE '%Comissão%' OR nome LIKE '%Taxa%' OR nome LIKE '%Tarifa%' OR nome LIKE '%ADS%' OR nome LIKE '%Transação%')",
        )
        .execute()
    } catch (e) {
      console.warn('Erro ao atualizar responsavel em prec_taxas:', e)
    }

    // (c) sku_por_canal do BLeve: manter apenas a entrada mais recente de cada canal
    // Produto BLeve possui id 'lsilkiq8w2apfre' em prec_produtos (e 'fntg3yyh3s8t8qg' em produtos)
    const bleveIds = ['lsilkiq8w2apfre', 'fntg3yyh3s8t8qg']
    for (let b = 0; b < bleveIds.length; b++) {
      const bId = bleveIds[b]
      try {
        const prodRec = app.findRecordById('prec_produtos', bId)
        if (prodRec) {
          const rawSkuCanal = prodRec.get('sku_por_canal')
          let list = []
          if (Array.isArray(rawSkuCanal)) {
            list = rawSkuCanal
          } else if (typeof rawSkuCanal === 'string' && rawSkuCanal.trim()) {
            try {
              list = JSON.parse(rawSkuCanal)
            } catch (_) {}
          }

          if (Array.isArray(list) && list.length > 0) {
            // Manter apenas a última ocorrência de cada canal (mais recente na lista)
            const mapCanal = {}
            for (let i = 0; i < list.length; i++) {
              const item = list[i]
              if (item && item.canal) {
                mapCanal[item.canal] = item
              }
            }
            const deduplicado = Object.values(mapCanal)
            prodRec.set('sku_por_canal', deduplicado)
            app.save(prodRec)
          }
        }
      } catch (_) {}
    }

    // (a) Para cada produto tipo 'revenda' com composição contendo linha espelho da compra:
    // recalcular custo_composicao / custo_total do produto e custo_snapshot das precificações afetadas
    function calcularCustoRevenda(prodData) {
      const custoAquisicao = Number(prodData.custo_aquisicao_unitario) || 0
      let composicao = []
      const rawComp = prodData.composicao
      if (Array.isArray(rawComp)) {
        composicao = rawComp
      } else if (typeof rawComp === 'string' && rawComp.trim()) {
        try {
          composicao = JSON.parse(rawComp)
        } catch (_) {}
      }

      // Detecção de linha espelho
      let temLinhaEspelho = false
      if (Array.isArray(composicao)) {
        for (let i = 0; i < composicao.length; i++) {
          const item = composicao[i] || {}
          const desc = String(item.descricao || '').toLowerCase()
          const catCusto = String(item.categoria_custo || '').toLowerCase()
          const catNome = String(item.categoria_nome || '').toLowerCase()
          const perdaLinha = (Number(item.perda_pct) || 0) / 100
          const qtdAjustada = (Number(item.qtd) || 0) * (1 + perdaLinha)
          const custoUn = Number(item.custo_unitario) || 0

          const matchQtdValor =
            custoAquisicao > 0 &&
            Math.abs(custoUn - custoAquisicao) < 0.001 &&
            Math.abs(qtdAjustada - 1) < 0.001

          const matchTexto =
            desc.indexOf('aquisi') !== -1 ||
            desc.indexOf('matéria-prima') !== -1 ||
            desc.indexOf('materia-prima') !== -1 ||
            desc.indexOf('compra do produto') !== -1 ||
            catCusto.indexOf('aquisi') !== -1 ||
            catCusto.indexOf('matéria-prima') !== -1 ||
            catCusto.indexOf('materia-prima') !== -1 ||
            catNome.indexOf('aquisi') !== -1 ||
            catNome.indexOf('matéria-prima') !== -1 ||
            catNome.indexOf('materia-prima') !== -1

          if (matchQtdValor || matchTexto) {
            temLinhaEspelho = true
            break
          }
        }
      }

      let custo_direto = 0
      if (!temLinhaEspelho) {
        custo_direto = custoAquisicao
      }

      let temPerdaNaLinha = false
      if (Array.isArray(composicao)) {
        for (let i = 0; i < composicao.length; i++) {
          const item = composicao[i] || {}
          const perdaItemPct = Number(item.perda_pct) || 0
          if (perdaItemPct > 0) {
            temPerdaNaLinha = true
          }
          const perda = perdaItemPct / 100
          const qtdAjustada = (Number(item.qtd) || 0) * (1 + perda)
          const subtotal = qtdAjustada * (Number(item.custo_unitario) || 0)
          custo_direto += subtotal
        }
      }

      let despesas = []
      const rawDesp = prodData.despesas_compra
      if (Array.isArray(rawDesp)) {
        despesas = rawDesp
      } else if (typeof rawDesp === 'string' && rawDesp.trim()) {
        try {
          despesas = JSON.parse(rawDesp)
        } catch (_) {}
      }
      if (Array.isArray(despesas)) {
        for (let i = 0; i < despesas.length; i++) {
          custo_direto += Number(despesas[i]?.valor) || 0
        }
      }

      const perdaGlobal = Number(prodData.perda_pct) || 0
      if (!temPerdaNaLinha && perdaGlobal > 0) {
        custo_direto = custo_direto * (1 + perdaGlobal / 100)
      }

      const custo_embalagem = Number(prodData.custo_adicional_embalagem) || 0
      const custo_etiqueta = Number(prodData.custo_etiqueta) || 0
      const custo_total = Math.round((custo_direto + custo_embalagem + custo_etiqueta) * 100) / 100

      return {
        temLinhaEspelho,
        custo_direto: Math.round(custo_direto * 100) / 100,
        custo_total,
      }
    }

    // 1. Recalcular em produtos (coleção de produtos cadastrados)
    try {
      const prodsRevenda = app.findRecordsByFilter('produtos', "tipo = 'revenda'", '', 5000, 0)
      for (let i = 0; i < prodsRevenda.length; i++) {
        const p = prodsRevenda[i]
        const res = calcularCustoRevenda({
          custo_aquisicao_unitario: p.getFloat('custo_aquisicao_unitario'),
          composicao: p.get('composicao'),
          despesas_compra: p.get('despesas_compra'),
          perda_pct: p.getFloat('perda_pct'),
          custo_adicional_embalagem: p.getFloat('custo_adicional_embalagem'),
          custo_etiqueta: p.getFloat('custo_etiqueta'),
        })
        if (res.temLinhaEspelho) {
          p.set('custo_total', res.custo_total)
          app.save(p)
        }
      }
    } catch (e) {
      console.warn('Erro ao atualizar produtos revenda:', e)
    }

    // 2. Recalcular em prec_produtos e atualizar prec_precificacoes
    try {
      const precProdsRevenda = app.findRecordsByFilter(
        'prec_produtos',
        "tipo = 'revenda'",
        '',
        5000,
        0,
      )
      for (let i = 0; i < precProdsRevenda.length; i++) {
        const p = precProdsRevenda[i]
        const res = calcularCustoRevenda({
          custo_aquisicao_unitario: p.getFloat('custo_aquisicao_unitario'),
          composicao: p.get('composicao'),
          despesas_compra: p.get('despesas_compra'),
          perda_pct: p.getFloat('perda_pct'),
          custo_adicional_embalagem: p.getFloat('custo_adicional_embalagem'),
          custo_etiqueta: p.getFloat('custo_etiqueta'),
        })

        if (res.temLinhaEspelho) {
          p.set('custo_composicao', res.custo_total)
          app.save(p)

          // Atualizar snapshot nas precificações vinculadas a este prec_produto
          try {
            const precs = app.findRecordsByFilter(
              'prec_precificacoes',
              "produto = '" + p.id + "'",
              '',
              1000,
              0,
            )
            for (let j = 0; j < precs.length; j++) {
              const prec = precs[j]
              const snap = prec.get('custo_snapshot') || {}
              snap.custo_total = res.custo_total
              snap.atualizado_em = new Date().toISOString()
              prec.set('custo_snapshot', snap)
              app.save(prec)
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('Erro ao atualizar prec_produtos revenda:', e)
    }
  },
  () => {
    // Migração de correção de dados/recalibração é idempotente e segura sem rollback destrutivo
  },
)
