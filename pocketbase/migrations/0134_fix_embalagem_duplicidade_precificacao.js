migrate(
  (app) => {
    // 1. Adicionar campos base_origem e origem_id em prec_produtos se não existirem
    const precCol = app.findCollectionByNameOrId('prec_produtos')
    const pbCol = app.findCollectionByNameOrId('produtos_base')

    if (!precCol.fields.getByName('base_origem')) {
      precCol.fields.add(
        new RelationField({
          name: 'base_origem',
          collectionId: pbCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
    }

    if (!precCol.fields.getByName('origem_id')) {
      precCol.fields.add(
        new TextField({
          name: 'origem_id',
          max: 50,
          required: false,
        }),
      )
    }

    app.save(precCol)

    try {
      precCol.addIndex('idx_prec_prod_borigem', false, 'base_origem', '')
      precCol.addIndex('idx_prec_prod_origem_id', false, 'origem_id', '')
      app.save(precCol)
    } catch (_) {}

    // Helper: detecta se a composição já possui linha de categoria Embalagem
    function temEmbalagemNaComposicao(comp) {
      if (!Array.isArray(comp) || comp.length === 0) return false
      for (let i = 0; i < comp.length; i++) {
        const item = comp[i]
        if (!item) continue
        const catCusto = (item.categoria_custo || '').toLowerCase()
        const catNome = (item.categoria_nome || '').toLowerCase()
        const desc = (item.descricao || '').toLowerCase()
        if (
          catCusto === 'embalagem' ||
          catNome === 'embalagem' ||
          catCusto.indexOf('embalagem') !== -1 ||
          catNome.indexOf('embalagem') !== -1 ||
          desc.indexOf('saco plastico') !== -1 ||
          desc.indexOf('embalagem') !== -1
        ) {
          return true
        }
      }
      return false
    }

    // Helper para transferir vínculos de um prec_produto descartado para o mantido
    function transferirVinculosEDescartar(descartadoId, mantidoId) {
      if (descartadoId === mantidoId) return

      // 1. prec_precificacoes
      try {
        const precs = app.findRecordsByFilter(
          'prec_precificacoes',
          'produto = {:descartadoId}',
          '',
          1000,
          0,
          { descartadoId },
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
              'produto = {:mantidoId} && canal = {:canal} && empresa = {:empresa} && modalidade = {:modalidade}',
              { mantidoId, canal, empresa, modalidade },
            )
          } catch (_) {}

          if (jaExiste) {
            // Se o descartado era aprovado e o mantido não, mantém status
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
        console.warn('Aviso ao migrar prec_precificacoes:', e)
      }

      // 2. prec_matriz_classificacoes (UNIQUE em produto + canal)
      try {
        const mats = app.findRecordsByFilter(
          'prec_matriz_classificacoes',
          'produto = {:descartadoId}',
          '',
          1000,
          0,
          { descartadoId },
        )
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i]
          const canal = m.getString('canal')
          let jaExiste = null
          try {
            jaExiste = app.findFirstRecordByFilter(
              'prec_matriz_classificacoes',
              'produto = {:mantidoId} && canal = {:canal}',
              { mantidoId, canal },
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
        console.warn('Aviso ao migrar prec_matriz_classificacoes:', e)
      }

      // 3. prec_perfis_tributarios
      try {
        const tribs = app.findRecordsByFilter(
          'prec_perfis_tributarios',
          'produto = {:descartadoId}',
          '',
          1000,
          0,
          { descartadoId },
        )
        for (let i = 0; i < tribs.length; i++) {
          const tr = tribs[i]
          tr.set('produto', mantidoId)
          app.save(tr)
        }
      } catch (e) {
        console.warn('Aviso ao migrar prec_perfis_tributarios:', e)
      }

      // 4. prec_kits (UNIQUE em produto_pai)
      try {
        const kits = app.findRecordsByFilter(
          'prec_kits',
          'produto_pai = {:descartadoId}',
          '',
          1000,
          0,
          { descartadoId },
        )
        for (let i = 0; i < kits.length; i++) {
          const k = kits[i]
          let jaExiste = null
          try {
            jaExiste = app.findFirstRecordByFilter('prec_kits', 'produto_pai = {:mantidoId}', {
              mantidoId,
            })
          } catch (_) {}
          if (jaExiste) {
            app.delete(k)
          } else {
            k.set('produto_pai', mantidoId)
            app.save(k)
          }
        }
      } catch (e) {
        console.warn('Aviso ao migrar prec_kits:', e)
      }

      // 5. kit_pedidos
      try {
        const pedKits = app.findRecordsByFilter(
          'kit_pedidos',
          'produto_referencia = {:descartadoId}',
          '',
          2000,
          0,
          { descartadoId },
        )
        for (let i = 0; i < pedKits.length; i++) {
          const pk = pedKits[i]
          pk.set('produto_referencia', mantidoId)
          app.save(pk)
        }
      } catch (e) {
        console.warn('Aviso ao migrar kit_pedidos:', e)
      }

      // 6. Copiar campos valiosos para o mantido se estiverem vazios nele
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

        // Excluir registro descartado
        app.delete(descRec)
      } catch (e) {
        console.warn('Aviso ao excluir prec_produto descartado:', e)
      }
    }

    // 2. Varrer produtos compostos e deduplicar em prec_produtos
    try {
      const produtos = app.findRecordsByFilter('produtos', '', '', 5000, 0)

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

        // Buscar todos os prec_produtos candidatos
        const encontradosMap = {}

        // Candidato por sku
        if (skuProd) {
          try {
            const p = app.findFirstRecordByFilter('prec_produtos', 'sku = {:skuProd}', { skuProd })
            if (p) encontradosMap[p.id] = p
          } catch (_) {}
        }

        // Candidato por fornecedor_produto
        if (fpOrigemId) {
          try {
            const pList = app.findRecordsByFilter(
              'prec_produtos',
              'fornecedor_produto = {:fpOrigemId}',
              '',
              20,
              0,
              { fpOrigemId },
            )
            for (let j = 0; j < pList.length; j++) {
              encontradosMap[pList[j].id] = pList[j]
            }
          } catch (_) {}
        }

        // Candidato por nome correspondente
        if (nomeProd) {
          try {
            const pList = app.findRecordsByFilter(
              'prec_produtos',
              'nome = {:nomeProd}',
              '',
              20,
              0,
              { nomeProd },
            )
            for (let j = 0; j < pList.length; j++) {
              encontradosMap[pList[j].id] = pList[j]
            }
          } catch (_) {}
        }

        // Candidato por base_origem ou origem_id já vinculados
        if (baseId) {
          try {
            const pList = app.findRecordsByFilter(
              'prec_produtos',
              'base_origem = {:baseId}',
              '',
              20,
              0,
              { baseId },
            )
            for (let j = 0; j < pList.length; j++) {
              encontradosMap[pList[j].id] = pList[j]
            }
          } catch (_) {}
        }

        const ids = Object.keys(encontradosMap)
        if (ids.length > 1) {
          // Ordenar candidatos: primeiro os que têm composição, depois o mais recente (created DESC)
          const candidatos = ids.map((id) => encontradosMap[id])
          candidatos.sort((a, b) => {
            const compA = a.get('composicao')
            const compB = b.get('composicao')
            const hasCompA = Array.isArray(compA) && compA.length > 0 ? 1 : 0
            const hasCompB = Array.isArray(compB) && compB.length > 0 ? 1 : 0
            if (hasCompA !== hasCompB) return hasCompB - hasCompA

            // Preferir o que tem o SKU do produto composto atual
            if (skuProd) {
              const skuA = a.getString('sku') === skuProd ? 1 : 0
              const skuB = b.getString('sku') === skuProd ? 1 : 0
              if (skuA !== skuB) return skuB - skuA
            }

            // Desempate pela data de criação mais recente
            const createdA = a.getString('created') || ''
            const createdB = b.getString('created') || ''
            return createdB.localeCompare(createdA)
          })

          const mantido = candidatos[0]
          for (let k = 1; k < candidatos.length; k++) {
            transferirVinculosEDescartar(candidatos[k].id, mantido.id)
          }

          // Atualizar o registro mantido com os metadados de origem e cálculo limpo
          mantido.set('base_origem', baseId)
          mantido.set('origem_id', prodId)
          if (fpOrigemId && !mantido.getString('fornecedor_produto')) {
            mantido.set('fornecedor_produto', fpOrigemId)
          }

          const comp = mantido.get('composicao')
          if (temEmbalagemNaComposicao(comp)) {
            mantido.set('custo_adicional_embalagem', 0)
          }
          app.save(mantido)
        } else if (ids.length === 1) {
          const unico = encontradosMap[ids[0]]
          unico.set('base_origem', baseId)
          unico.set('origem_id', prodId)
          if (fpOrigemId && !unico.getString('fornecedor_produto')) {
            unico.set('fornecedor_produto', fpOrigemId)
          }
          const comp = unico.get('composicao')
          if (temEmbalagemNaComposicao(comp)) {
            unico.set('custo_adicional_embalagem', 0)
          }
          app.save(unico)
        }

        // Corrigir no produto composto 'produtos' o custo_total caso haja embalagem na composição
        const compProd = prod.get('composicao')
        if (temEmbalagemNaComposicao(compProd)) {
          let somaComp = 0
          if (Array.isArray(compProd)) {
            for (let c = 0; c < compProd.length; c++) {
              const it = compProd[c]
              const q = Number(it.qtd) || 0
              const u = Number(it.custo_unitario) || 0
              const perda = (Number(it.perda_pct) || 0) / 100
              somaComp += q * (1 + perda) * u
            }
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
      console.warn('Aviso no loop de deduplicacao da migracao 0134:', e)
    }

    // 3. Varredura final preventiva em prec_produtos para zerar custo_adicional_embalagem
    // onde a composição analítica já inclui linha de embalagem
    try {
      const precAll = app.findRecordsByFilter('prec_produtos', '', '', 5000, 0)
      for (let i = 0; i < precAll.length; i++) {
        const p = precAll[i]
        const comp = p.get('composicao')
        if (temEmbalagemNaComposicao(comp)) {
          if (p.getFloat('custo_adicional_embalagem') > 0) {
            p.set('custo_adicional_embalagem', 0)
            app.save(p)
          }
        }
      }
    } catch (e) {
      console.warn('Aviso na varredura preventiva de embalagens prec_produtos:', e)
    }
  },
  (app) => {
    // Reverter campos se necessário
    try {
      const precCol = app.findCollectionByNameOrId('prec_produtos')
      if (precCol.fields.getByName('base_origem')) {
        precCol.fields.removeByName('base_origem')
      }
      if (precCol.fields.getByName('origem_id')) {
        precCol.fields.removeByName('origem_id')
      }
      app.save(precCol)
    } catch (_) {}
  },
)
