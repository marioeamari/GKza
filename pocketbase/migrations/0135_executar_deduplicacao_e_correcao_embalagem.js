migrate(
  (app) => {
    // Helper para extrair array de composição de um Record PocketBase
    function parseComposicao(rec) {
      let comp = null
      try {
        comp = rec.get('composicao')
      } catch (_) {}

      if (comp === null || comp === undefined || comp === '') {
        try {
          const raw = rec.getString('composicao')
          if (raw) comp = JSON.parse(raw)
        } catch (_) {}
      }

      if (typeof comp === 'string' && comp.trim()) {
        try {
          comp = JSON.parse(comp)
        } catch (_) {}
      }

      if (Array.isArray(comp)) return comp
      return []
    }

    // Helper: detecta se a composição já possui linha de categoria Embalagem
    function temEmbalagemNaComposicao(comp) {
      if (!Array.isArray(comp) || comp.length === 0) return false
      for (let i = 0; i < comp.length; i++) {
        const item = comp[i]
        if (!item) continue
        const catCusto = String(item.categoria_custo || '').toLowerCase()
        const catNome = String(item.categoria_nome || '').toLowerCase()
        const desc = String(item.descricao || '').toLowerCase()
        if (
          catCusto === 'embalagem' ||
          catNome === 'embalagem' ||
          catCusto.indexOf('embalagem') !== -1 ||
          catNome.indexOf('embalagem') !== -1 ||
          desc.indexOf('saco plastico') !== -1 ||
          desc.indexOf('saco plástico') !== -1 ||
          desc.indexOf('embalagem') !== -1
        ) {
          return true
        }
      }
      return false
    }

    // Helper para transferir vínculos de um prec_produto descartado para o mantido
    function transferirVinculosEDescartar(descartadoId, mantidoId) {
      if (!descartadoId || !mantidoId || descartadoId === mantidoId) return

      // 1. prec_precificacoes
      try {
        const precs = app.findRecordsByFilter(
          'prec_precificacoes',
          "produto = '" + descartadoId + "'",
          '',
          1000,
          0,
        )
        for (let i = 0; i < precs.length; i++) {
          const p = precs[i]
          const canal = p.getString('canal')
          const empresa = p.getString('empresa')
          const modalidade = p.getString('modalidade')

          let jaExiste = null
          try {
            jaExiste = app.findFirstRecordByFilter(
              'prec_precificacoes',
              "produto = '" +
                mantidoId +
                "' && canal = '" +
                canal +
                "' && empresa = '" +
                empresa +
                "' && modalidade = '" +
                modalidade +
                "'",
            )
          } catch (_) {}

          if (jaExiste) {
            if (
              p.getString('status') === 'aprovada' &&
              jaExiste.getString('status') !== 'aprovada'
            ) {
              jaExiste.set('status', 'aprovada')
              jaExiste.set('preco_aprovado', p.getFloat('preco_aprovado'))
              jaExiste.set('aprovado_em', p.getString('aprovado_em'))
              jaExiste.set('aprovado_por', p.getString('aprovado_por'))
              app.save(jaExiste)
            }
            app.delete(p)
          } else {
            p.set('produto', mantidoId)
            app.save(p)
          }
        }
      } catch (e) {
        console.warn('0135: Aviso ao transferir prec_precificacoes:', e)
      }

      // 2. prec_matriz_classificacoes (UNIQUE em produto + canal)
      try {
        const mats = app.findRecordsByFilter(
          'prec_matriz_classificacoes',
          "produto = '" + descartadoId + "'",
          '',
          1000,
          0,
        )
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i]
          const canal = m.getString('canal')
          let jaExiste = null
          try {
            jaExiste = app.findFirstRecordByFilter(
              'prec_matriz_classificacoes',
              "produto = '" + mantidoId + "' && canal = '" + canal + "'",
            )
          } catch (_) {}

          if (jaExiste) {
            app.delete(m)
          } else {
            m.set('produto', mantidoId)
            app.save(m)
          }
        }
      } catch (e) {
        console.warn('0135: Aviso ao transferir prec_matriz_classificacoes:', e)
      }

      // 3. prec_perfis_tributarios
      try {
        const tribs = app.findRecordsByFilter(
          'prec_perfis_tributarios',
          "produto = '" + descartadoId + "'",
          '',
          1000,
          0,
        )
        for (let i = 0; i < tribs.length; i++) {
          const tr = tribs[i]
          tr.set('produto', mantidoId)
          app.save(tr)
        }
      } catch (e) {
        console.warn('0135: Aviso ao transferir prec_perfis_tributarios:', e)
      }

      // 4. prec_kits (UNIQUE em produto_pai)
      try {
        const kits = app.findRecordsByFilter(
          'prec_kits',
          "produto_pai = '" + descartadoId + "'",
          '',
          1000,
          0,
        )
        for (let i = 0; i < kits.length; i++) {
          const k = kits[i]
          let jaExiste = null
          try {
            jaExiste = app.findFirstRecordByFilter('prec_kits', "produto_pai = '" + mantidoId + "'")
          } catch (_) {}
          if (jaExiste) {
            app.delete(k)
          } else {
            k.set('produto_pai', mantidoId)
            app.save(k)
          }
        }
      } catch (e) {
        console.warn('0135: Aviso ao transferir prec_kits:', e)
      }

      // 5. kit_pedidos
      try {
        const pedKits = app.findRecordsByFilter(
          'kit_pedidos',
          "produto_referencia = '" + descartadoId + "'",
          '',
          2000,
          0,
        )
        for (let i = 0; i < pedKits.length; i++) {
          const pk = pedKits[i]
          pk.set('produto_referencia', mantidoId)
          app.save(pk)
        }
      } catch (e) {
        console.warn('0135: Aviso ao transferir kit_pedidos:', e)
      }

      // 6. Copiar campos valiosos para o mantido e excluir o descartado
      try {
        const descRec = app.findRecordById('prec_produtos', descartadoId)
        const mantRec = app.findRecordById('prec_produtos', mantidoId)
        let alterou = false

        if (!mantRec.getString('imagem') && descRec.getString('imagem')) {
          mantRec.set('imagem', descRec.getString('imagem'))
          alterou = true
        }
        if (!mantRec.getString('fornecedor_produto') && descRec.getString('fornecedor_produto')) {
          mantRec.set('fornecedor_produto', descRec.getString('fornecedor_produto'))
          alterou = true
        }
        if (!mantRec.getString('marca') && descRec.getString('marca')) {
          mantRec.set('marca', descRec.getString('marca'))
          alterou = true
        }
        if (!mantRec.getString('categoria') && descRec.getString('categoria')) {
          mantRec.set('categoria', descRec.getString('categoria'))
          alterou = true
        }
        if (!mantRec.getString('embalagem') && descRec.getString('embalagem')) {
          mantRec.set('embalagem', descRec.getString('embalagem'))
          alterou = true
        }
        if (!mantRec.getString('fornecedor') && descRec.getString('fornecedor')) {
          mantRec.set('fornecedor', descRec.getString('fornecedor'))
          alterou = true
        }

        if (alterou) {
          app.save(mantRec)
        }

        app.delete(descRec)
      } catch (e) {
        console.warn('0135: Aviso ao excluir prec_produto descartado:', e)
      }
    }

    // =========================================================================
    // ETAPA 1: Deduplicar prec_produtos baseando-se nos produtos cadastrados em 'produtos'
    // =========================================================================
    let totalDeduplicados = 0
    try {
      const produtos = app.findRecordsByFilter('produtos', '1=1', '', 5000, 0)

      for (let i = 0; i < produtos.length; i++) {
        const prod = produtos[i]
        const prodId = prod.id
        const baseId = prod.getString('base_origem')
        const skuProd = prod.getString('sku')
        const nomeProd = prod.getString('nome')

        let fpOrigemId = ''
        if (baseId) {
          try {
            const baseRec = app.findRecordById('produtos_base', baseId)
            if (baseRec && baseRec.getString('origem_colecao') === 'fornecedores_produtos') {
              fpOrigemId = baseRec.getString('origem_id')
            }
          } catch (_) {}
        }

        const encontradosMap = {}

        // Candidato por sku
        if (skuProd) {
          try {
            const porSku = app.findRecordsByFilter(
              'prec_produtos',
              "sku = '" + skuProd.replace(/'/g, "''") + "'",
              '',
              20,
              0,
            )
            for (let j = 0; j < porSku.length; j++) {
              encontradosMap[porSku[j].id] = porSku[j]
            }
          } catch (_) {}
        }

        // Candidato por fornecedor_produto
        if (fpOrigemId) {
          try {
            const porFp = app.findRecordsByFilter(
              'prec_produtos',
              "fornecedor_produto = '" + fpOrigemId + "'",
              '',
              20,
              0,
            )
            for (let j = 0; j < porFp.length; j++) {
              encontradosMap[porFp[j].id] = porFp[j]
            }
          } catch (_) {}
        }

        // Candidato por nome correspondente
        if (nomeProd) {
          try {
            const porNome = app.findRecordsByFilter(
              'prec_produtos',
              "nome = '" + nomeProd.replace(/'/g, "''") + "'",
              '',
              20,
              0,
            )
            for (let j = 0; j < porNome.length; j++) {
              encontradosMap[porNome[j].id] = porNome[j]
            }
          } catch (_) {}
        }

        // Candidato por base_origem ou origem_id já vinculados
        if (baseId) {
          try {
            const porBase = app.findRecordsByFilter(
              'prec_produtos',
              "base_origem = '" + baseId + "'",
              '',
              20,
              0,
            )
            for (let j = 0; j < porBase.length; j++) {
              encontradosMap[porBase[j].id] = porBase[j]
            }
          } catch (_) {}
        }

        if (prodId) {
          try {
            const porOrigem = app.findRecordsByFilter(
              'prec_produtos',
              "origem_id = '" + prodId + "'",
              '',
              20,
              0,
            )
            for (let j = 0; j < porOrigem.length; j++) {
              encontradosMap[porOrigem[j].id] = porOrigem[j]
            }
          } catch (_) {}
        }

        const ids = Object.keys(encontradosMap)
        if (ids.length > 1) {
          const candidatos = ids.map((id) => encontradosMap[id])
          candidatos.sort((a, b) => {
            const compA = parseComposicao(a)
            const compB = parseComposicao(b)
            const hasCompA = compA.length > 0 ? 1 : 0
            const hasCompB = compB.length > 0 ? 1 : 0
            if (hasCompA !== hasCompB) return hasCompB - hasCompA

            // Preferir o que tem o SKU do produto composto atual
            if (skuProd) {
              const skuA = a.getString('sku') === skuProd ? 1 : 0
              const skuB = b.getString('sku') === skuProd ? 1 : 0
              if (skuA !== skuB) return skuB - skuA
            }

            // Preferir o que já tem origem_id vinculada
            const origA = a.getString('origem_id') === prodId ? 1 : 0
            const origB = b.getString('origem_id') === prodId ? 1 : 0
            if (origA !== origB) return origB - origA

            // Desempate pela data de criação mais recente
            const createdA = a.getString('created') || ''
            const createdB = b.getString('created') || ''
            return createdB.localeCompare(createdA)
          })

          const mantido = candidatos[0]
          for (let k = 1; k < candidatos.length; k++) {
            transferirVinculosEDescartar(candidatos[k].id, mantido.id)
            totalDeduplicados++
          }

          mantido.set('base_origem', baseId)
          mantido.set('origem_id', prodId)
          if (skuProd) mantido.set('sku', skuProd)
          if (fpOrigemId && !mantido.getString('fornecedor_produto')) {
            mantido.set('fornecedor_produto', fpOrigemId)
          }

          const comp = parseComposicao(mantido)
          if (temEmbalagemNaComposicao(comp)) {
            mantido.set('custo_adicional_embalagem', 0)
          }
          app.save(mantido)
        } else if (ids.length === 1) {
          const unico = encontradosMap[ids[0]]
          unico.set('base_origem', baseId)
          unico.set('origem_id', prodId)
          if (skuProd && !unico.getString('sku')) {
            unico.set('sku', skuProd)
          }
          if (fpOrigemId && !unico.getString('fornecedor_produto')) {
            unico.set('fornecedor_produto', fpOrigemId)
          }
          const comp = parseComposicao(unico)
          if (temEmbalagemNaComposicao(comp)) {
            unico.set('custo_adicional_embalagem', 0)
          }
          app.save(unico)
        }

        // Corrigir no produto composto 'produtos' o custo_total e custo_embalagem caso haja embalagem na composição
        const compProd = parseComposicao(prod)
        if (temEmbalagemNaComposicao(compProd)) {
          let somaComp = 0
          for (let c = 0; c < compProd.length; c++) {
            const it = compProd[c]
            const q = Number(it.qtd) || 0
            const u = Number(it.custo_unitario) || 0
            const perda = (Number(it.perda_pct) || 0) / 100
            somaComp += q * (1 + perda) * u
          }
          const custoCompArredondado = Math.round((somaComp + Number.EPSILON) * 100) / 100
          const aquisicao = prod.getFloat('custo_aquisicao') || 0
          const etiqueta = prod.getFloat('custo_etiqueta') || 0
          const custoTotalCorreto =
            Math.round((aquisicao + custoCompArredondado + etiqueta + Number.EPSILON) * 100) / 100

          prod.set('custo_composicao', custoCompArredondado)
          prod.set('custo_embalagem', 0)
          prod.set('custo_total', custoTotalCorreto)
          app.save(prod)
        }
      }
    } catch (e) {
      console.warn('0135: Aviso no loop de deduplicação por produtos:', e)
    }

    // =========================================================================
    // ETAPA 2: Varredura geral e preventiva de duplicações residuais em prec_produtos
    // Casamento por mesmo nome ou mesmo fornecedor_produto
    // =========================================================================
    try {
      const allPrecs = app.findRecordsByFilter('prec_produtos', '1=1', '', 5000, 0)
      const porNome = {}
      for (let i = 0; i < allPrecs.length; i++) {
        const p = allPrecs[i]
        const nomeNorm = (p.getString('nome') || '').trim().toLowerCase()
        if (!nomeNorm) continue
        if (!porNome[nomeNorm]) porNome[nomeNorm] = []
        porNome[nomeNorm].push(p)
      }

      const nomes = Object.keys(porNome)
      for (let i = 0; i < nomes.length; i++) {
        const grupo = porNome[nomes[i]]
        if (grupo.length > 1) {
          // Filtrar os que ainda existem no banco (podem ter sido deletados em iteração prévia)
          const validos = []
          for (let v = 0; v < grupo.length; v++) {
            try {
              const recCheck = app.findRecordById('prec_produtos', grupo[v].id)
              if (recCheck) validos.push(recCheck)
            } catch (_) {}
          }
          if (validos.length > 1) {
            validos.sort((a, b) => {
              const compA = parseComposicao(a)
              const compB = parseComposicao(b)
              const hasA = compA.length > 0 ? 1 : 0
              const hasB = compB.length > 0 ? 1 : 0
              if (hasA !== hasB) return hasB - hasA

              const hasOrigA = a.getString('origem_id') ? 1 : 0
              const hasOrigB = b.getString('origem_id') ? 1 : 0
              if (hasOrigA !== hasOrigB) return hasOrigB - hasOrigA

              const createdA = a.getString('created') || ''
              const createdB = b.getString('created') || ''
              return createdB.localeCompare(createdA)
            })

            const mantido = validos[0]
            for (let k = 1; k < validos.length; k++) {
              transferirVinculosEDescartar(validos[k].id, mantido.id)
              totalDeduplicados++
            }
          }
        }
      }
    } catch (e) {
      console.warn('0135: Aviso na deduplicação residual em prec_produtos:', e)
    }

    // =========================================================================
    // ETAPA 3: Varredura preventiva de embalagem dupla em prec_produtos
    // Zerar custo_adicional_embalagem onde a composição tem embalagem
    // =========================================================================
    let totalEmbalagensZeradas = 0
    try {
      const precAll = app.findRecordsByFilter('prec_produtos', '1=1', '', 5000, 0)
      for (let i = 0; i < precAll.length; i++) {
        const p = precAll[i]
        const comp = parseComposicao(p)
        if (temEmbalagemNaComposicao(comp)) {
          if (p.getFloat('custo_adicional_embalagem') > 0) {
            p.set('custo_adicional_embalagem', 0)
            app.save(p)
            totalEmbalagensZeradas++
          }
        }
      }
    } catch (e) {
      console.warn('0135: Aviso na varredura preventiva de embalagens prec_produtos:', e)
    }

    // =========================================================================
    // ETAPA 4: Varredura preventiva em produtos (produtos compostos)
    // Zerar custo_embalagem e recalcular custo_total onde composição tem embalagem
    // =========================================================================
    let totalProdutosCompostosRecalculados = 0
    try {
      const prodAll = app.findRecordsByFilter('produtos', '1=1', '', 5000, 0)
      for (let i = 0; i < prodAll.length; i++) {
        const prod = prodAll[i]
        const compProd = parseComposicao(prod)
        if (temEmbalagemNaComposicao(compProd)) {
          let somaComp = 0
          for (let c = 0; c < compProd.length; c++) {
            const it = compProd[c]
            const q = Number(it.qtd) || 0
            const u = Number(it.custo_unitario) || 0
            const perda = (Number(it.perda_pct) || 0) / 100
            somaComp += q * (1 + perda) * u
          }
          const custoCompArredondado = Math.round((somaComp + Number.EPSILON) * 100) / 100
          const aquisicao =
            prod.getString('classificacao') === 'revenda'
              ? prod.getFloat('custo_aquisicao') || 0
              : 0
          const etiqueta = prod.getFloat('custo_etiqueta') || 0
          const custoTotalCorreto =
            Math.round((aquisicao + custoCompArredondado + etiqueta + Number.EPSILON) * 100) / 100

          const custoEmbalagemAtual = prod.getFloat('custo_embalagem') || 0
          const custoTotalAtual = prod.getFloat('custo_total') || 0
          const custoCompAtual = prod.getFloat('custo_composicao') || 0

          if (
            custoEmbalagemAtual !== 0 ||
            custoTotalAtual !== custoTotalCorreto ||
            custoCompAtual !== custoCompArredondado
          ) {
            prod.set('custo_composicao', custoCompArredondado)
            prod.set('custo_embalagem', 0)
            prod.set('custo_total', custoTotalCorreto)
            app.save(prod)
            totalProdutosCompostosRecalculados++
          }
        }
      }
    } catch (e) {
      console.warn('0135: Aviso na varredura preventiva em produtos compostos:', e)
    }

    console.log(
      '0135_finalizada: deduplicados=' +
        totalDeduplicados +
        ', embalagens_zeradas=' +
        totalEmbalagensZeradas +
        ', compostos_recalculados=' +
        totalProdutosCompostosRecalculados,
    )
  },
  (app) => {
    // Reversão no-op pois deduplicação e limpeza de dados são operações definitivas
  },
)
