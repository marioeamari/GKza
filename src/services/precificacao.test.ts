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
