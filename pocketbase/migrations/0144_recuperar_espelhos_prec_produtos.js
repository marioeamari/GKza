/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0144: Recuperação e garantia de espelho único por produto em prec_produtos.
 * Garante que todo produto ativo (revenda ou fabricação própria) possua um espelho
 * em prec_produtos com origem_id = produto.id.
 * Se faltar (ex: BPesada-Personalizada, cujo espelho foi roubado pela BPesada-Person-Nome
 * por compartilharem a mesma base_origem), cria o espelho com o payload completo.
 * Se o espelho existente foi adulterado por ping-pong de sync, restaura os dados corretos do produto.
 * Idempotente: reexecuções não duplicam registros.
 */
migrate(
  (app) => {
    const colPrec = app.findCollectionByNameOrId('prec_produtos')

    // Helper puro para calcular custo embalagem efetiva seguindo a regra contra dupla contagem
    function extrairEmbalagemEfetiva(composicao, custoEmbalagem) {
      let temLinhaEmbalagem = false
      if (Array.isArray(composicao)) {
        for (let i = 0; i < composicao.length; i++) {
          const item = composicao[i] || {}
          const catCusto = (item.categoria_custo || '').toLowerCase()
          const catNome = (item.categoria_nome || '').toLowerCase()
          const desc = (item.descricao || '').toLowerCase()
          if (
            catCusto === 'embalagem' ||
            catNome === 'embalagem' ||
            catCusto.includes('embalagem') ||
            catNome.includes('embalagem') ||
            desc.includes('saco plastico') ||
            desc.includes('saco plástico') ||
            desc.includes('embalagem')
          ) {
            temLinhaEmbalagem = true
            break
          }
        }
      }
      return temLinhaEmbalagem ? 0 : Math.max(0, Number(custoEmbalagem) || 0)
    }

    // 1. Buscar produtos ativos com classificação revenda ou fabricacao_propria
    const produtos = app.findRecordsByFilter(
      'produtos',
      "status = 'ativo' && (classificacao = 'revenda' || classificacao = 'fabricacao_propria')",
      'created',
      2000,
      0,
    )

    console.log('[Migração 0144] Produtos ativos encontrados:', produtos.length)

    for (let i = 0; i < produtos.length; i++) {
      const prod = produtos[i]
      const prodId = prod.id
      const nome = prod.getString('nome')
      const skuDesejado =
        (prod.getString('sku') || '').trim() || 'PROD-' + prodId.slice(0, 8).toUpperCase()
      const classificacao = prod.getString('classificacao') || 'revenda'
      const baseOrigem = prod.getString('base_origem')
      const custoAquisicao = prod.getFloat('custo_aquisicao') || 0
      const custoEtiqueta = prod.getFloat('custo_etiqueta') || 0
      const perdaPct = prod.getFloat('perda_pct') || 0
      const unidade = prod.getString('unidade') || 'un'
      const dimComp = prod.getFloat('dimensao_comprimento_cm') || 0
      const dimLarg = prod.getFloat('dimensao_largura_cm') || 0
      const dimAlt = prod.getFloat('dimensao_altura_cm') || 0
      const pesoG = prod.getFloat('peso_g') || 0
      const status = prod.getString('status') || 'ativo'
      const composicao = prod.get('composicao') || []
      const empresas = prod.get('empresas') || []
      const primeiraEmpresa = Array.isArray(empresas) && empresas.length > 0 ? empresas[0] : ''

      const embalagemEfetiva = extrairEmbalagemEfetiva(
        composicao,
        prod.getFloat('custo_embalagem') || 0,
      )

      let fornecedorId = ''
      let fornecedorProdutoId = ''
      if (baseOrigem) {
        try {
          const baseRec = app.findRecordById('produtos_base', baseOrigem)
          if (baseRec) {
            fornecedorId = baseRec.getString('fornecedor') || ''
            if (baseRec.getString('origem_colecao') === 'fornecedores_produtos') {
              fornecedorProdutoId = baseRec.getString('origem_id') || ''
            }
          }
        } catch (_) {}
      }

      // Verificar se já existe espelho com origem_id = prodId
      let espelhoExistente = null
      try {
        espelhoExistente = app.findFirstRecordByFilter('prec_produtos', 'origem_id = {:prodId}', {
          prodId: prodId,
        })
      } catch (_) {}

      if (espelhoExistente) {
        // Já tem espelho com origem_id do produto.
        // Garante que os dados estejam alinhados com o produto cadastrado (recupera caso tenha sofrido sobrescrita parcial)
        espelhoExistente.set('nome', nome)
        espelhoExistente.set('tipo', classificacao)
        espelhoExistente.set('sku', skuDesejado)
        espelhoExistente.set('custo_aquisicao_unitario', custoAquisicao)
        espelhoExistente.set('custo_adicional_embalagem', embalagemEfetiva)
        espelhoExistente.set('custo_etiqueta', custoEtiqueta)
        espelhoExistente.set('perda_pct', perdaPct)
        espelhoExistente.set('unidade', unidade)
        espelhoExistente.set('dimensao_comprimento_cm', dimComp)
        espelhoExistente.set('dimensao_largura_cm', dimLarg)
        espelhoExistente.set('dimensao_altura_cm', dimAlt)
        espelhoExistente.set('peso_g', pesoG)
        espelhoExistente.set('status', status)
        espelhoExistente.set('composicao', composicao)
        if (baseOrigem) espelhoExistente.set('base_origem', baseOrigem)
        if (primeiraEmpresa) espelhoExistente.set('empresa', primeiraEmpresa)
        if (fornecedorId) espelhoExistente.set('fornecedor', fornecedorId)
        if (fornecedorProdutoId) espelhoExistente.set('fornecedor_produto', fornecedorProdutoId)

        app.save(espelhoExistente)
      } else {
        // Faltava espelho para este produto (caso da BPesada-Personalizada)!
        console.log('[Migração 0144] Criando espelho em prec_produtos para produto:', prodId, nome)
        const novoEspelho = new Record(colPrec)
        novoEspelho.set('origem_id', prodId)
        novoEspelho.set('nome', nome)
        novoEspelho.set('tipo', classificacao)
        novoEspelho.set('sku', skuDesejado)
        novoEspelho.set('custo_aquisicao_unitario', custoAquisicao)
        novoEspelho.set('custo_adicional_embalagem', embalagemEfetiva)
        novoEspelho.set('custo_etiqueta', custoEtiqueta)
        novoEspelho.set('perda_pct', perdaPct)
        novoEspelho.set('unidade', unidade)
        novoEspelho.set('dimensao_comprimento_cm', dimComp)
        novoEspelho.set('dimensao_largura_cm', dimLarg)
        novoEspelho.set('dimensao_altura_cm', dimAlt)
        novoEspelho.set('peso_g', pesoG)
        novoEspelho.set('status', status)
        novoEspelho.set('composicao', composicao)
        if (baseOrigem) novoEspelho.set('base_origem', baseOrigem)
        if (primeiraEmpresa) novoEspelho.set('empresa', primeiraEmpresa)
        if (fornecedorId) novoEspelho.set('fornecedor', fornecedorId)
        if (fornecedorProdutoId) novoEspelho.set('fornecedor_produto', fornecedorProdutoId)

        app.save(novoEspelho)
      }
    }
  },
  (app) => {
    // Reversão limpa (não deleta dados por segurança de cascade de precificações)
  },
)
