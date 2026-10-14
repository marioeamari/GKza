import { describe, it, expect, vi, beforeEach } from 'vitest'
import { precificacaoService } from './precificacao'
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
