import { describe, it, expect, vi, beforeEach } from 'vitest'
import { filtrarApenasKitsECombos, precificacaoService } from './precificacao'
import pb from '@/lib/pocketbase/client'

describe('precificacaoService - Gatilho de Desatualização e Afetação de Custo', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('afetaCustoOuPrecificacao deve retornar FALSE para campos de identificação e apelidos', () => {
    // Apenas sku_por_canal (apelidos)
    expect(
      precificacaoService.afetaCustoOuPrecificacao({
        sku_por_canal: [{ canal: 'c1', sku_externo: 'B122' }],
      }),
    ).toBe(false)

    // Apenas nome ou marca ou categoria ou codigo_barras
    expect(
      precificacaoService.afetaCustoOuPrecificacao({
        nome: 'Toalha Leve de Praia - Nome Atualizado',
        marca: 'Leve Praia',
        categoria: 'Praia Verão',
        codigo_barras: '7891234567890',
        unidade: 'un',
      }),
    ).toBe(false)
  })

  it('afetaCustoOuPrecificacao deve retornar TRUE quando campos de custo ou dimensões são alterados', () => {
    expect(
      precificacaoService.afetaCustoOuPrecificacao({
        custo_aquisicao_unitario: 12.5,
      }),
    ).toBe(true)

    expect(
      precificacaoService.afetaCustoOuPrecificacao({
        composicao: [
          {
            codigo: 'C0',
            descricao: 'Insumo',
            qtd: 2,
            custo_unitario: 5,
            categoria_custo: 'material',
          },
        ],
      }),
    ).toBe(true)

    expect(
      precificacaoService.afetaCustoOuPrecificacao({
        custo_adicional_embalagem: 0.5,
      }),
    ).toBe(true)

    expect(
      precificacaoService.afetaCustoOuPrecificacao({
        perda_pct: 15,
      }),
    ).toBe(true)

    expect(
      precificacaoService.afetaCustoOuPrecificacao({
        peso_g: 300,
      }),
    ).toBe(true)
  })

  it('updateProduto NÃO deve chamar marcarPrecificacoesComoDesatualizadas quando apenas sku_por_canal for alterado', async () => {
    const updateSpy = vi.spyOn(pb.collection('prec_produtos'), 'update').mockResolvedValue({
      id: 'lsilkiq8w2apfre',
      sku: 'BLeve',
    } as any)

    const desatualizarSpy = vi
      .spyOn(precificacaoService, 'marcarPrecificacoesComoDesatualizadas')
      .mockResolvedValue(undefined)

    await precificacaoService.updateProduto('lsilkiq8w2apfre', {
      sku_por_canal: [{ canal: 'nnnk28chx9llzmm', sku_externo: 'B122' }],
    })

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(desatualizarSpy).not.toHaveBeenCalled()
  })

  it('updateProduto DEVE chamar marcarPrecificacoesComoDesatualizadas quando custo_aquisicao_unitario for alterado', async () => {
    vi.spyOn(pb.collection('prec_produtos'), 'update').mockResolvedValue({
      id: 'lsilkiq8w2apfre',
      sku: 'BLeve',
    } as any)

    const desatualizarSpy = vi
      .spyOn(precificacaoService, 'marcarPrecificacoesComoDesatualizadas')
      .mockResolvedValue(undefined)

    await precificacaoService.updateProduto('lsilkiq8w2apfre', {
      custo_aquisicao_unitario: 15,
    })

    expect(desatualizarSpy).toHaveBeenCalledTimes(1)
    expect(desatualizarSpy).toHaveBeenCalledWith({ produtoId: 'lsilkiq8w2apfre' })
  })
})

describe('Regra de Gestão de Kits & Combos (/precificacao/produtos)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('filtrarApenasKitsECombos deve descartar produto recém-criado com tipo="fabricacao_propria"', () => {
    const lista = [
      { id: '1', nome: 'Bolsa Artesanal', sku: 'BOLSA-01', tipo: 'fabricacao_propria' as const },
    ]
    const resultado = filtrarApenasKitsECombos(lista)
    expect(resultado).toHaveLength(0)
  })

  it('filtrarApenasKitsECombos deve descartar produto com tipo="revenda"', () => {
    const lista = [{ id: '2', nome: 'Mouse Óptico', sku: 'MOUSE-01', tipo: 'revenda' as const }]
    const resultado = filtrarApenasKitsECombos(lista)
    expect(resultado).toHaveLength(0)
  })

  it('filtrarApenasKitsECombos deve descartar registros com tipo vazio, nulo, indefinido ou desconhecido', () => {
    const lista = [
      { id: '3', nome: 'Sem Tipo', sku: 'SEM-01', tipo: '' as any },
      { id: '4', nome: 'Tipo Null', sku: 'NUL-01', tipo: null as any },
      { id: '5', nome: 'Tipo Undefined', sku: 'UND-01', tipo: undefined as any },
      { id: '6', nome: 'Tipo Invalido', sku: 'INV-01', tipo: 'servico' as any },
      null,
      undefined,
    ]
    const resultado = filtrarApenasKitsECombos(lista)
    expect(resultado).toHaveLength(0)
  })

  it('filtrarApenasKitsECombos deve preservar estritamente apenas produtos do tipo "kit" e "combo"', () => {
    const lista = [
      { id: '1', nome: 'Prod Fabricado', sku: 'FAB-01', tipo: 'fabricacao_propria' as const },
      { id: '2', nome: 'Prod Revenda', sku: 'REV-01', tipo: 'revenda' as const },
      { id: '3', nome: 'Kit 2 Toalhas', sku: 'KIT-02', tipo: 'kit' as const },
      { id: '4', nome: 'Combo Praia', sku: 'COMBO-01', tipo: 'combo' as const },
      { id: '5', nome: 'Outro', sku: 'OUT-01', tipo: 'outro' as any },
    ]
    const resultado = filtrarApenasKitsECombos(lista)
    expect(resultado).toHaveLength(2)
    expect(resultado.map((r) => r.id)).toEqual(['3', '4'])
    expect(resultado.map((r) => r.tipo)).toEqual(['kit', 'combo'])
  })

  it('listKitsECombos deve consultar o PocketBase com filtro exato de kit ou combo', async () => {
    const mockRetorno = [
      { id: 'k1', nome: 'Kit 3 Camisas', sku: 'KIT-CAM-3', tipo: 'kit' },
      { id: 'c1', nome: 'Combo Verão', sku: 'COMBO-VER', tipo: 'combo' },
    ]
    const getFullListSpy = vi
      .spyOn(pb.collection('prec_produtos'), 'getFullList')
      .mockResolvedValue(mockRetorno as any)

    const prods = await precificacaoService.listKitsECombos()

    expect(getFullListSpy).toHaveBeenCalledTimes(1)
    expect(getFullListSpy).toHaveBeenCalledWith({
      filter: 'tipo = "kit" || tipo = "combo"',
      sort: '-created',
      expand: 'empresa,fornecedor,fornecedor_produto',
    })
    expect(prods).toEqual(mockRetorno)
  })
})

describe('Regras da Matriz de Presença por Canal (Serviço & Idempotência)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('getMapaProdutosAprovadosPorCanal prioriza status "aprovada" sobre "desatualizada" e desempata pela mais recente', async () => {
    const mockProdutos = [
      { id: 'prod_1', nome: 'Toalha Allure 1', sku: 'ALL-1', tipo: 'kit', status: 'ativo' },
      { id: 'prod_2', nome: 'Toalha Allure 2', sku: 'ALL-2', tipo: 'kit', status: 'ativo' },
      { id: 'prod_sem_aprovado', nome: 'Sem Preco', sku: 'SEM-P', tipo: 'kit', status: 'ativo' },
    ]

    // Cenários com diferentes status e datas para prod_1 no canal 'shopee'
    const mockPrecificacoes = [
      // Cenário A: desatualizada mais recente (timestamp 3000)
      {
        id: 'prec_desat_recente',
        produto: 'prod_1',
        canal: 'shopee',
        status: 'desatualizada',
        preco_aprovado: 60.0,
        updated: '2026-05-10T12:00:00Z',
      },
      // Cenário B: aprovada mais antiga (timestamp 2000) - DEVE SER PRIORIZADA SOBRE A DESATUALIZADA
      {
        id: 'prec_aprovada_antiga',
        produto: 'prod_1',
        canal: 'shopee',
        status: 'aprovada',
        preco_aprovado: 49.9,
        updated: '2026-05-01T12:00:00Z',
      },
      // Cenário C: prod_2 no canal 'mercadolivre' - dois aprovados com desempate pela mais recente
      {
        id: 'prec_prod2_aprov_antiga',
        produto: 'prod_2',
        canal: 'mercadolivre',
        status: 'aprovada',
        preco_aprovado: 75.0,
        created: '2026-04-01T10:00:00Z',
      },
      {
        id: 'prec_prod2_aprov_recente',
        produto: 'prod_2',
        canal: 'mercadolivre',
        status: 'aprovada',
        preco_aprovado: 79.9,
        created: '2026-04-15T10:00:00Z',
      },
      // Cenário D: rascunho sem preco_aprovado ou preco <= 0 (deve ser descartado)
      {
        id: 'prec_rascunho',
        produto: 'prod_sem_aprovado',
        canal: 'shopee',
        status: 'rascunho',
        preco_aprovado: 0,
      },
    ]

    vi.spyOn(precificacaoService, 'listProdutos').mockResolvedValue(mockProdutos as any)
    vi.spyOn(precificacaoService, 'listPrecificacoes').mockResolvedValue(mockPrecificacoes as any)

    const resultado = await precificacaoService.getMapaProdutosAprovadosPorCanal()

    // 1. prod_1 na Shopee deve ter escolhido a 'aprovada' (49.9) mesmo sendo mais antiga que a 'desatualizada' (60.0)
    const keyProd1 = 'prod_1__shopee'
    expect(resultado.mapaPrecoPorProdCanal[keyProd1]).toBeDefined()
    expect(resultado.mapaPrecoPorProdCanal[keyProd1].preco_aprovado).toBe(49.9)
    expect(resultado.mapaPrecoPorProdCanal[keyProd1].status).toBe('aprovada')
    expect(resultado.mapaPrecoPorProdCanal[keyProd1].precificacao_id).toBe('prec_aprovada_antiga')

    // 2. prod_2 no Mercado Livre deve desempatar pelo timestamp mais recente (79.9)
    const keyProd2 = 'prod_2__mercadolivre'
    expect(resultado.mapaPrecoPorProdCanal[keyProd2]).toBeDefined()
    expect(resultado.mapaPrecoPorProdCanal[keyProd2].preco_aprovado).toBe(79.9)
    expect(resultado.mapaPrecoPorProdCanal[keyProd2].precificacao_id).toBe(
      'prec_prod2_aprov_recente',
    )

    // 3. Apenas prod_1 e prod_2 constam em produtos aprovados; prod_sem_aprovado é filtrado
    expect(resultado.produtos.map((p) => p.id)).toEqual(['prod_1', 'prod_2'])
  })

  it('getMapaProdutosAprovadosPorCanal extrai lucro_liquido do campo resultado da precificação', async () => {
    vi.spyOn(pb.collection('prec_produtos'), 'getFullList').mockResolvedValue([
      { id: 'prod_alpha', sku: 'SKU-ALPHA', nome: 'Alpha' },
    ] as any)

    vi.spyOn(pb.collection('prec_canal_modalidades'), 'getFullList').mockResolvedValue([
      { id: 'mod_1', nome: 'Half', canal: 'canal_k' },
    ] as any)

    vi.spyOn(pb.collection('prec_precificacoes'), 'getFullList').mockResolvedValue([
      {
        id: 'prec_alpha_1',
        produto: 'prod_alpha',
        canal: 'canal_k',
        modalidade: 'mod_1',
        status: 'aprovada',
        preco_aprovado: 55.0,
        resultado: {
          lucro_liquido: 12.34,
          margem_liquida: 22.4,
        },
        aprovado_em: '2026-03-01 10:00:00',
        created: '2026-03-01 10:00:00',
      },
      {
        id: 'prec_alpha_sem_lucro',
        produto: 'prod_alpha',
        canal: 'canal_shopee',
        status: 'desatualizada',
        preco_aprovado: 40.0,
        resultado: null,
        aprovado_em: '2026-02-01 10:00:00',
        created: '2026-02-01 10:00:00',
      },
    ] as any)

    const resultado = await precificacaoService.getMapaProdutosAprovadosPorCanal()

    const itemComLucro = resultado.mapaPrecoPorProdCanal['prod_alpha__canal_k']
    expect(itemComLucro).toBeDefined()
    expect(itemComLucro.preco_aprovado).toBe(55.0)
    expect(itemComLucro.lucro_liquido).toBe(12.34)
    expect(itemComLucro.modalidades_disponiveis?.[0].lucro_liquido).toBe(12.34)

    const itemSemLucro = resultado.mapaPrecoPorProdCanal['prod_alpha__canal_shopee']
    expect(itemSemLucro).toBeDefined()
    expect(itemSemLucro.preco_aprovado).toBe(40.0)
    expect(itemSemLucro.lucro_liquido).toBeUndefined()
  })

  it('setMatrizClassificacao cria novo vínculo quando não existe para o par produto+canal', async () => {
    vi.spyOn(pb.collection('prec_matriz_classificacoes'), 'getFullList').mockResolvedValue(
      [] as any,
    )
    const createSpy = vi
      .spyOn(pb.collection('prec_matriz_classificacoes'), 'create')
      .mockResolvedValue({
        id: 'classif_nova',
        produto: 'prod_1',
        canal: 'canal_shopee',
        legenda: 'leg_ativo',
      } as any)

    const res = await precificacaoService.setMatrizClassificacao({
      produtoId: 'prod_1',
      canalId: 'canal_shopee',
      legendaId: 'leg_ativo',
    })

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        produto: 'prod_1',
        canal: 'canal_shopee',
        legenda: 'leg_ativo',
      }),
      { expand: 'legenda' },
    )
    expect(res?.id).toBe('classif_nova')
  })

  it('setMatrizClassificacao é idempotente: troca de legenda atualiza o registro existente e não cria duplicata', async () => {
    // Registro existente para o par prod_1 + canal_shopee
    const mockExistente = [
      {
        id: 'classif_existente',
        produto: 'prod_1',
        canal: 'canal_shopee',
        legenda: 'leg_ativo',
      },
    ]

    vi.spyOn(pb.collection('prec_matriz_classificacoes'), 'getFullList').mockResolvedValue(
      mockExistente as any,
    )
    const updateSpy = vi
      .spyOn(pb.collection('prec_matriz_classificacoes'), 'update')
      .mockResolvedValue({
        id: 'classif_existente',
        produto: 'prod_1',
        canal: 'canal_shopee',
        legenda: 'leg_rejeitado',
      } as any)
    const createSpy = vi.spyOn(pb.collection('prec_matriz_classificacoes'), 'create')

    const res = await precificacaoService.setMatrizClassificacao({
      produtoId: 'prod_1',
      canalId: 'canal_shopee',
      legendaId: 'leg_rejeitado',
    })

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(
      'classif_existente',
      expect.objectContaining({ legenda: 'leg_rejeitado' }),
      { expand: 'legenda' },
    )
    expect(createSpy).not.toHaveBeenCalled()
    expect(res?.id).toBe('classif_existente')
  })

  it('setMatrizClassificacao com legendaId=null exclui o registro existente (limpa célula)', async () => {
    const mockExistente = [
      {
        id: 'classif_para_remover',
        produto: 'prod_1',
        canal: 'canal_shopee',
        legenda: 'leg_ativo',
      },
    ]

    vi.spyOn(pb.collection('prec_matriz_classificacoes'), 'getFullList').mockResolvedValue(
      mockExistente as any,
    )
    const deleteSpy = vi
      .spyOn(pb.collection('prec_matriz_classificacoes'), 'delete')
      .mockResolvedValue(true as any)

    const res = await precificacaoService.setMatrizClassificacao({
      produtoId: 'prod_1',
      canalId: 'canal_shopee',
      legendaId: null,
    })

    expect(deleteSpy).toHaveBeenCalledWith('classif_para_remover')
    expect(res).toBeNull()
  })
})
