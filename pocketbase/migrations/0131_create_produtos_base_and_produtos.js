/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0131: Reestruturação do Catálogo de Produtos e Fornecedores
 * - Criação da coleção única 'produtos_base' (tudo que compõe custo: revenda, insumos, serviços, etc., vinculado a 1 fornecedor)
 * - Criação da coleção 'produtos' (entidade com nome, classificação revenda|fabricacao_propria, base_origem e composição por linhas de produtos_base, vinculável a empresas)
 * - Migração idempotente preservando coleções antigas (fornecedores_produtos e insumos) intactas no banco
 */
migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const adminOrGestor =
      "@request.auth.role = 'admin' || @request.auth.role = 'gestor' || @request.auth.id != ''"

    const fornecedoresCol = app.findCollectionByNameOrId('fornecedores')
    const empresasCol = app.findCollectionByNameOrId('empresas')

    // 1. Coleção 'produtos_base'
    let colProdutosBase
    try {
      colProdutosBase = app.findCollectionByNameOrId('produtos_base')
    } catch {
      colProdutosBase = null
    }

    if (!colProdutosBase) {
      colProdutosBase = new Collection({
        name: 'produtos_base',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: authenticated,
        updateRule: authenticated,
        deleteRule: adminOrGestor,
        fields: [
          { name: 'nome', type: 'text', required: true, max: 250 },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: [
              'revenda',
              'insumo',
              'servico',
              'embalagem',
              'etiqueta',
              'tecido',
              'pintura',
              'costura',
              'outro',
            ],
            maxSelect: 1,
          },
          {
            name: 'fornecedor',
            type: 'relation',
            required: true,
            collectionId: fornecedoresCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'sku', type: 'text', required: false, max: 100 },
          { name: 'ncm', type: 'text', required: false, max: 20 },
          { name: 'codigo_barras', type: 'text', required: false, max: 100 },
          { name: 'unidade', type: 'text', required: false, max: 20 },
          { name: 'custo_unitario', type: 'number', required: false, min: 0 },
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
          { name: 'peso_g', type: 'number', required: false, min: 0 },
          {
            name: 'imagem',
            type: 'file',
            required: false,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          },
          { name: 'origem_colecao', type: 'text', required: false, max: 50 },
          { name: 'origem_id', type: 'text', required: false, max: 50 },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'observacoes', type: 'text', required: false, max: 1000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_pbase_forn ON produtos_base (fornecedor)',
          'CREATE INDEX idx_pbase_tipo ON produtos_base (tipo)',
          'CREATE INDEX idx_pbase_sku ON produtos_base (sku)',
          'CREATE INDEX idx_pbase_origem ON produtos_base (origem_colecao, origem_id)',
        ],
      })
      app.save(colProdutosBase)
    }

    // 2. Coleção 'produtos' (entidade de composição e precificação)
    let colProdutos
    try {
      colProdutos = app.findCollectionByNameOrId('produtos')
    } catch {
      colProdutos = null
    }

    if (!colProdutos) {
      colProdutos = new Collection({
        name: 'produtos',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: authenticated,
        updateRule: authenticated,
        deleteRule: adminOrGestor,
        fields: [
          { name: 'nome', type: 'text', required: true, max: 250 },
          {
            name: 'classificacao',
            type: 'select',
            required: true,
            values: ['revenda', 'fabricacao_propria'],
            maxSelect: 1,
          },
          {
            name: 'base_origem',
            type: 'relation',
            required: false,
            collectionId: colProdutosBase.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'composicao', type: 'json', required: false, maxSize: 5242880 },
          {
            name: 'empresas',
            type: 'relation',
            required: false,
            collectionId: empresasCol.id,
            cascadeDelete: false,
            maxSelect: 50,
          },
          { name: 'sku', type: 'text', required: false, max: 100 },
          { name: 'codigo_barras', type: 'text', required: false, max: 100 },
          { name: 'unidade', type: 'text', required: false, max: 20 },
          { name: 'custo_aquisicao', type: 'number', required: false, min: 0 },
          { name: 'custo_composicao', type: 'number', required: false, min: 0 },
          { name: 'custo_total', type: 'number', required: false, min: 0 },
          { name: 'custo_embalagem', type: 'number', required: false, min: 0 },
          { name: 'custo_etiqueta', type: 'number', required: false, min: 0 },
          { name: 'peso_g', type: 'number', required: false, min: 0 },
          { name: 'dimensao_comprimento_cm', type: 'number', required: false, min: 0 },
          { name: 'dimensao_largura_cm', type: 'number', required: false, min: 0 },
          { name: 'dimensao_altura_cm', type: 'number', required: false, min: 0 },
          {
            name: 'imagem',
            type: 'file',
            required: false,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          },
          {
            name: 'status',
            type: 'select',
            required: false,
            values: ['ativo', 'inativo', 'rascunho'],
            maxSelect: 1,
          },
          { name: 'observacoes', type: 'text', required: false, max: 1000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_prod_comp_classif ON produtos (classificacao)',
          'CREATE INDEX idx_prod_comp_borigem ON produtos (base_origem)',
          'CREATE INDEX idx_prod_comp_sku ON produtos (sku)',
          'CREATE INDEX idx_prod_comp_status ON produtos (status)',
        ],
      })
      app.save(colProdutos)
    }

    // 3. Migração de dados idempotente:
    // a) Fornecedores_produtos -> produtos_base
    try {
      const fornProds = app.findRecordsByFilter('fornecedores_produtos', '', '', 2000, 0)
      for (let i = 0; i < fornProds.length; i++) {
        const fp = fornProds[i]
        const fornId = fp.getString('fornecedor')
        if (!fornId) continue

        // Verificar se já migrou
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

          const img = fp.getString('imagem')
          if (img) {
            pbRec.set('imagem', img)
          }

          app.save(pbRec)
        }
      }
    } catch (err) {
      console.warn('Aviso ao migrar fornecedores_produtos para produtos_base:', err)
    }

    // b) Insumos -> produtos_base
    try {
      const insumos = app.findRecordsByFilter('insumos', '', '', 2000, 0)
      for (let i = 0; i < insumos.length; i++) {
        const ins = insumos[i]
        const fornId = ins.getString('fornecedor')
        // Insumo precisa de fornecedor. Se ausente, busca ou cria um fornecedor genérico
        let targetFornId = fornId
        if (!targetFornId) {
          try {
            const primeiroForn = app.findRecordsByFilter('fornecedores', '', 'created', 1, 0)
            if (primeiroForn.length > 0) {
              targetFornId = primeiroForn[0].id
            }
          } catch (_) {}
        }
        if (!targetFornId) continue

        let existe = null
        try {
          existe = app.findFirstRecordByFilter(
            'produtos_base',
            "origem_colecao = 'insumos' && origem_id = {:id}",
            { id: ins.id },
          )
        } catch (_) {}

        if (!existe) {
          const pbRec = new Record(colProdutosBase)
          pbRec.set('nome', ins.getString('nome') || 'Insumo Base')
          const insTipo = ins.getString('tipo') === 'servico' ? 'servico' : 'insumo'
          pbRec.set('tipo', insTipo)
          pbRec.set('fornecedor', targetFornId)
          pbRec.set('unidade', ins.getString('unidade') || 'un')
          pbRec.set('custo_unitario', ins.getFloat('valor_unitario') || 0)
          pbRec.set('dimensao_tipo', ins.getString('dimensao_tipo') || 'nenhuma')
          pbRec.set('dimensao_comprimento_cm', ins.getFloat('dimensao_comprimento_cm') || 0)
          pbRec.set('dimensao_largura_cm', ins.getFloat('dimensao_largura_cm') || 0)
          pbRec.set('dimensao_altura_cm', ins.getFloat('dimensao_altura_cm') || 0)
          pbRec.set('origem_colecao', 'insumos')
          pbRec.set('origem_id', ins.id)
          pbRec.set('ativo', ins.getBool('ativo'))
          pbRec.set('observacoes', ins.getString('observacoes') || '')
          app.save(pbRec)
        }
      }
    } catch (err) {
      console.warn('Aviso ao migrar insumos para produtos_base:', err)
    }

    // c) Criar produtos compostos a partir de produtos_base (revenda) e de prec_produtos existentes
    try {
      const basesRevenda = app.findRecordsByFilter(
        'produtos_base',
        "tipo = 'revenda' && origem_colecao = 'fornecedores_produtos'",
        '',
        2000,
        0,
      )
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
          p.set('custo_composicao', 0)
          p.set('custo_total', custoAquisicao)
          p.set('sku', base.getString('sku') || '')
          p.set('unidade', base.getString('unidade') || 'un')
          p.set('dimensao_comprimento_cm', base.getFloat('dimensao_comprimento_cm') || 0)
          p.set('dimensao_largura_cm', base.getFloat('dimensao_largura_cm') || 0)
          p.set('dimensao_altura_cm', base.getFloat('dimensao_altura_cm') || 0)
          p.set('peso_g', base.getFloat('peso_g') || 0)
          p.set('status', base.getBool('ativo') ? 'ativo' : 'inativo')

          // Verificar se havia composição no registro original em fornecedores_produtos
          const origId = base.getString('origem_id')
          if (origId) {
            try {
              const fpOrig = app.findRecordById('fornecedores_produtos', origId)
              const composicaoJson = fpOrig.get('composicao')
              if (composicaoJson) {
                p.set('composicao', composicaoJson)
              }
              const cEmb = fpOrig.getFloat('custo_adicional_embalagem') || 0
              const cEti = fpOrig.getFloat('custo_etiqueta') || 0
              p.set('custo_embalagem', cEmb)
              p.set('custo_etiqueta', cEti)
            } catch (_) {}
          }

          app.save(p)
        }
      }
    } catch (err) {
      console.warn('Aviso ao criar produtos a partir de produtos_base revenda:', err)
    }

    // d) Criar produtos compostos a partir de prec_produtos (fabricacao_propria)
    try {
      const precFabPropria = app.findRecordsByFilter(
        'prec_produtos',
        "tipo = 'fabricacao_propria'",
        '',
        2000,
        0,
      )
      for (let i = 0; i < precFabPropria.length; i++) {
        const prec = precFabPropria[i]
        const sku = prec.getString('sku')
        let existeProd = null
        if (sku) {
          try {
            existeProd = app.findFirstRecordByFilter('produtos', 'sku = {:sku}', { sku })
          } catch (_) {}
        }
        if (!existeProd) {
          const p = new Record(colProdutos)
          p.set('nome', prec.getString('nome') || 'Produto Fabricação Própria')
          p.set('classificacao', 'fabricacao_propria')
          p.set('sku', sku || '')
          p.set('unidade', prec.getString('unidade') || 'un')
          p.set('dimensao_comprimento_cm', prec.getFloat('dimensao_comprimento_cm') || 0)
          p.set('dimensao_largura_cm', prec.getFloat('dimensao_largura_cm') || 0)
          p.set('dimensao_altura_cm', prec.getFloat('dimensao_altura_cm') || 0)
          p.set('peso_g', prec.getFloat('peso_g') || 0)
          p.set('status', prec.getString('status') || 'ativo')
          p.set('composicao', prec.get('composicao'))
          p.set('custo_embalagem', prec.getFloat('custo_adicional_embalagem') || 0)
          p.set('custo_etiqueta', prec.getFloat('custo_etiqueta') || 0)

          const empId = prec.getString('empresa')
          if (empId) {
            p.set('empresas', [empId])
          }

          // Calcular custo_total = soma da composição + embalagem + etiqueta
          let custoComp = 0
          try {
            const compList = prec.get('composicao')
            if (Array.isArray(compList)) {
              for (const c of compList) {
                const q = Number(c.qtd) || 1
                const u = Number(c.custo_unitario) || 0
                custoComp += q * u
              }
            }
          } catch (_) {}

          p.set('custo_aquisicao', 0)
          p.set('custo_composicao', custoComp)
          p.set(
            'custo_total',
            custoComp +
              (prec.getFloat('custo_adicional_embalagem') || 0) +
              (prec.getFloat('custo_etiqueta') || 0),
          )

          app.save(p)
        }
      }
    } catch (err) {
      console.warn('Aviso ao criar produtos a partir de prec_produtos fabricacao_propria:', err)
    }
  },
  (app) => {
    // Reverter coleções novas criadas
    const toRemove = ['produtos', 'produtos_base']
    for (const name of toRemove) {
      try {
        const col = app.findCollectionByNameOrId(name)
        if (col) app.delete(col)
      } catch (_) {}
    }
  },
)
