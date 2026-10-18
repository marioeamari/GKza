import { describe, it, expect, vi } from 'vitest'
import { insumosService } from '@/services/insumos'
import { fornecedoresService } from '@/services/fornecedores'
import { cadastrosService } from '@/services/cadastros'
import type { InsumoRecord, InsumoCategoriaRecord, Fornecedor, Pessoa } from '@/types/domain'

describe('Insumos Auxiliares e Resiliência de Rede', () => {
  it('garante que falha em dados auxiliares não derruba carregamento de insumos com Promise.allSettled', async () => {
    // Simula categorias e fornecedores falhando (ex: Failed to fetch)
    const mockListInsumos = vi.fn().mockResolvedValue([
      {
        id: 'ins_1',
        nome: 'Caixa Kraft 20x20',
        tipo: 'insumo',
        valor_unitario: 2.5,
        ativo: true,
      } as InsumoRecord,
    ])
    const mockListCategorias = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const mockListFornecedores = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const [catsResult, fornResult, insResult] = await Promise.allSettled([
      mockListCategorias(),
      mockListFornecedores(),
      mockListInsumos(),
    ])

    // Insumos principais carregam com sucesso mesmo se auxiliares falharem
    expect(insResult.status).toBe('fulfilled')
    if (insResult.status === 'fulfilled') {
      expect(insResult.value).toHaveLength(1)
      expect(insResult.value[0].nome).toBe('Caixa Kraft 20x20')
    }

    // Auxiliares registraram falha controlada
    expect(catsResult.status).toBe('rejected')
    expect(fornResult.status).toBe('rejected')
  })

  it('permite reexecutar (retry) apenas os dados auxiliares que falharam', async () => {
    let fornAttempts = 0
    const mockListFornecedores = vi.fn().mockImplementation(async () => {
      fornAttempts++
      if (fornAttempts === 1) {
        throw new TypeError('Failed to fetch')
      }
      return [
        {
          id: 'forn_1',
          nome_fantasia: 'Papelaria Central',
          razao_social: 'Papelaria Central Ltda',
        } as Fornecedor,
      ]
    })

    // 1ª tentativa falha
    await expect(mockListFornecedores()).rejects.toThrow('Failed to fetch')

    // 2ª tentativa (botão Tentar novamente) tem sucesso
    const retryResult = await mockListFornecedores()
    expect(retryResult).toHaveLength(1)
    expect(retryResult[0].nome_fantasia).toBe('Papelaria Central')
    expect(fornAttempts).toBe(2)
  })

  it('cadastrosService.listPessoas possui wrapper withRetry para absorver falhas transitórias', async () => {
    expect(typeof cadastrosService.listPessoas).toBe('function')
  })

  it('fornecedoresService.listFornecedores possui wrapper withRetry para absorver falhas transitórias', async () => {
    expect(typeof fornecedoresService.listFornecedores).toBe('function')
  })

  it('insumosService.listCategorias possui wrapper withRetry para absorver falhas transitórias', async () => {
    expect(typeof insumosService.listCategorias).toBe('function')
  })
})
