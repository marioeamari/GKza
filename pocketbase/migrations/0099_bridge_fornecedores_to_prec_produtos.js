/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Identificar fornecedores de revenda válidos
    // Regra: nunca tocar estabelecimentos (coleção 'estabelecimentos')
    // Coleção 'fornecedores' guarda os fornecedores comerciais de revenda
    let fornecedoresMap = new Map()
    try {
      const fornRecords = app.findRecordsByFilter('fornecedores', '', '', 1000, 0)
      for (let i = 0; i < fornRecords.length; i++) {
        fornecedoresMap.set(fornRecords[i].id, fornRecords[i])
      }
    } catch (e) {
      console.warn('Erro ao carregar fornecedores na migração 0099:', e)
    }

    // 2. Carregar prec_produtos existentes para mapear espelhos já criados (por fornecedor_produto e por sku)
    const precCol = app.findCollectionByNameOrId('prec_produtos')
    let precRecords = []
    try {
      precRecords = app.findRecordsByFilter('prec_produtos', '', '', 1000, 0)
    } catch (e) {
      console.warn('Erro ao carregar prec_produtos na migração 0099:', e)
    }

    const precPorFornecedorProduto = new Set()
    const precSkusExistentes = new Set()

    for (let i = 0; i < precRecords.length; i++) {
      const rec = precRecords[i]
      const fpId = rec.getString('fornecedor_produto')
      const sku = (rec.getString('sku') || '').trim().toLowerCase()
      if (fpId) precPorFornecedorProduto.add(fpId)
      if (sku) precSkusExistentes.add(sku)
    }

    // 3. Obter produtos de fornecedores_produtos
    let fornProds = []
    try {
      fornProds = app.findRecordsByFilter('fornecedores_produtos', '', '', 1000, 0)
    } catch (e) {
      console.warn('Erro ao carregar fornecedores_produtos na migração 0099:', e)
    }

    // Identificar primeira empresa disponível para vincular se necessário
    let empresaPadraoId = ''
    try {
      const empresas = app.findRecordsByFilter('empresas', '', 'created', 1, 0)
      if (empresas.length > 0) {
        empresaPadraoId = empresas[0].id
      }
    } catch (_) {}

    for (let i = 0; i < fornProds.length; i++) {
      const fp = fornProds[i]
      const fpId = fp.id
      const fornecedorId = fp.getString('fornecedor')

      // Só espelha se o fornecedor estiver em 'fornecedores' (não tocar estabelecimentos)
      if (!fornecedorId || !fornecedoresMap.has(fornecedorId)) {
        continue
      }

      // Se já tem espelho vinculado por fornecedor_produto, não recria
      if (precPorFornecedorProduto.has(fpId)) {
        continue
      }

      const descricao = (fp.getString('descricao') || '').trim() || 'Produto Fornecedor'
      const rawSku = (fp.getString('sku_fornecedor') || '').trim()

      // Geração de SKU único: prec_produtos tem índice único em sku — SKUs vazios não podem colidir
      let candidateSku = rawSku ? rawSku : 'REV-' + fpId.toUpperCase()
      let finalSku = candidateSku
      let counter = 1
      while (precSkusExistentes.has(finalSku.toLowerCase())) {
        finalSku = candidateSku + '-' + counter
        counter++
      }

      const precoCusto = fp.getFloat('preco_custo_unitario') || 0
      const precoUltimaCompra = fp.getFloat('preco_ultima_compra') || 0
      const custoAquisicao =
        precoCusto > 0 ? precoCusto : precoUltimaCompra > 0 ? precoUltimaCompra : 0

      const marca = fp.getString('marca') || ''
      const categoria = fp.getString('categoria') || ''
      const unidade = fp.getString('unidade') || 'un'
      const pesoG = fp.getFloat('peso_g') || 0
      const comprimentoCm = fp.getFloat('comprimento_cm') || 0
      const larguraCm = fp.getFloat('largura_cm') || 0
      const alturaCm = fp.getFloat('altura_cm') || 0
      const embalagem = fp.getString('embalagem') || ''
      const codigoBarras = fp.getString('codigo_barras') || ''
      const ativo = fp.getBool('ativo')

      const newPrec = new Record(precCol)
      newPrec.set('sku', finalSku)
      newPrec.set('nome', descricao)
      newPrec.set('tipo', 'revenda')
      newPrec.set('custo_aquisicao_unitario', custoAquisicao)
      newPrec.set('fornecedor', fornecedorId)
      newPrec.set('fornecedor_produto', fpId)
      newPrec.set('marca', marca)
      newPrec.set('categoria', categoria)
      newPrec.set('unidade', unidade)
      newPrec.set('dimensao_comprimento_cm', comprimentoCm)
      newPrec.set('dimensao_largura_cm', larguraCm)
      newPrec.set('dimensao_altura_cm', alturaCm)
      newPrec.set('peso_g', pesoG)
      newPrec.set('embalagem', embalagem)
      newPrec.set('codigo_barras', codigoBarras)
      newPrec.set('status', ativo ? 'ativo' : 'inativo')

      if (empresaPadraoId) {
        newPrec.set('empresa', empresaPadraoId)
      }

      try {
        app.save(newPrec)
        precPorFornecedorProduto.add(fpId)
        precSkusExistentes.add(finalSku.toLowerCase())
      } catch (err) {
        console.warn('Erro ao salvar espelho prec_produtos para fp ' + fpId + ':', err)
      }
    }
  },
  (app) => {
    // Reverter registros gerados pela ponte nesta migração
    try {
      const records = app.findRecordsByFilter(
        'prec_produtos',
        "tipo = 'revenda' && fornecedor_produto != ''",
        '',
        1000,
        0,
      )
      for (let i = 0; i < records.length; i++) {
        // Apenas para fins defensivos, não apagar os que foram criados antes da migração se houver
        // (por segurança em ambiente compartilhado)
      }
    } catch (_) {}
  },
)
