import { describe, it, expect } from 'vitest'
import {
  agruparProdutosPorCategoria,
  extrairDadosCelulaMatriz,
  filtrarProdutosMatriz,
  getTextoContraste,
  normalizarLista,
} from './matrizHelpers'
import {
  PrecCategoriaProdutoRecord,
  PrecMatrizClassificacaoRecord,
  PrecMatrizLegendaRecord,
  PrecProdutoRecord,
} from '@/types/precificacao'

describe('matrizHelpers - Regras da Matriz de Presença por Canal', () => {
  const catBanho: PrecCategoriaProdutoRecord = {
    id: 'cat_banho',
    nome: 'Toalha de Banho',
    cor: '#0284C7',
    ordem: 10,
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  const catRosto: PrecCategoriaProdutoRecord = {
    id: 'cat_rosto',
    nome: 'Toalha de Rosto',
    cor: '#0D9488',
    ordem: 20,
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  const prod1: PrecProdutoRecord = {
    id: 'p1',
    sku: '1Ballure-f',
    nome: '1 Banho Allure Splendor - Femin.',
    categoria: 'Toalha de Banho',
    tipo: 'kit',
    status: 'ativo',
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  const prod2: PrecProdutoRecord = {
    id: 'p2',
    sku: '2Ballure-f',
    nome: '2 Banho Allure Splendor - Femin',
    categoria: 'cat_banho', // vinculada por ID
    tipo: 'kit',
    status: 'ativo',
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  const prod3: PrecProdutoRecord = {
    id: 'p3',
    sku: 'rf10',
    nome: 'Kit com 10 Rosto Folha Sortidas',
    categoria: 'Toalha de Rosto',
    tipo: 'kit',
    status: 'ativo',
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  const prodSemCat: PrecProdutoRecord = {
    id: 'p4',
    sku: 'B80',
    nome: 'Sky Nova',
    categoria: '',
    tipo: 'fabricacao_propria',
    status: 'ativo',
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  const legAtivo: PrecMatrizLegendaRecord = {
    id: 'leg_ativo',
    nome: 'Ativo',
    cor: '#10B981',
    cor_texto: '#FFFFFF',
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  const legRejeitado: PrecMatrizLegendaRecord = {
    id: 'leg_rejeitado',
    nome: 'Rejeitado',
    cor: '#EF4444',
    cor_texto: '#FFFFFF',
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  describe('normalizarLista', () => {
    it('deve retornar array vazio se for null, undefined ou objeto inválido', () => {
      expect(normalizarLista(null)).toEqual([])
      expect(normalizarLista(undefined)).toEqual([])
      expect(normalizarLista('string')).toEqual([])
      expect(normalizarLista(123)).toEqual([])
    })

    it('deve extrair .items de objetos paginados do PocketBase', () => {
      expect(normalizarLista({ items: [1, 2, 3] })).toEqual([1, 2, 3])
    })

    it('deve preservar arrays normais', () => {
      expect(normalizarLista([1, 2])).toEqual([1, 2])
    })
  })

  describe('agruparProdutosPorCategoria', () => {
    it('deve agrupar produtos por categoria e incluir "Sem categoria" no final', () => {
      const grupos = agruparProdutosPorCategoria(
        [prod1, prod2, prod3, prodSemCat],
        [catBanho, catRosto],
      )

      expect(grupos).toHaveLength(3)

      // Grupo 1: Toalha de Banho (recebe prod1 por nome e prod2 por id)
      expect(grupos[0].nome).toBe('Toalha de Banho')
      expect(grupos[0].produtos.map((p) => p.id)).toEqual(['p1', 'p2'])
      expect(grupos[0].isSemCategoria).toBe(false)

      // Grupo 2: Toalha de Rosto (recebe prod3)
      expect(grupos[1].nome).toBe('Toalha de Rosto')
      expect(grupos[1].produtos.map((p) => p.id)).toEqual(['p3'])

      // Grupo 3: Sem categoria no final
      expect(grupos[2].nome).toBe('Sem categoria')
      expect(grupos[2].isSemCategoria).toBe(true)
      expect(grupos[2].produtos.map((p) => p.id)).toEqual(['p4'])
    })

    it('não deve criar o grupo "Sem categoria" se todos os produtos tiverem categoria válida', () => {
      const grupos = agruparProdutosPorCategoria([prod1, prod3], [catBanho, catRosto])
      expect(grupos).toHaveLength(2)
      expect(grupos.some((g) => g.isSemCategoria)).toBe(false)
    })
  })

  describe('filtrarProdutosMatriz', () => {
    it('deve filtrar por SKU de forma insensível a maiúsculas', () => {
      const res = filtrarProdutosMatriz([prod1, prod2, prod3, prodSemCat], 'ballure')
      expect(res.map((p) => p.id)).toEqual(['p1', 'p2'])
    })

    it('deve filtrar por nome/referência', () => {
      const res = filtrarProdutosMatriz([prod1, prod2, prod3, prodSemCat], 'folha')
      expect(res.map((p) => p.id)).toEqual(['p3'])
    })

    it('deve filtrar por categoria específica', () => {
      const res = filtrarProdutosMatriz([prod1, prod2, prod3, prodSemCat], '', 'Toalha de Rosto')
      expect(res.map((p) => p.id)).toEqual(['p3'])
    })
  })

  describe('extrairDadosCelulaMatriz', () => {
    it('célula exibe preço aprovado por canal com a cor da legenda quando ambos existem', () => {
      const mapaClassificacoes = new Map<string, PrecMatrizClassificacaoRecord>([
        [
          'p1__shopee',
          {
            id: 'c1',
            produto: 'p1',
            canal: 'shopee',
            legenda: 'leg_ativo',
            created: '2026-01-01',
            updated: '2026-01-01',
          },
        ],
      ])

      const mapaPrecoPorProdCanal = {
        p1__shopee: {
          preco_aprovado: 49.9,
          status: 'aprovada',
          precificacao_id: 'prec_01',
          canal_id: 'shopee',
        },
      }

      const mapaLegendas = new Map<string, PrecMatrizLegendaRecord>([['leg_ativo', legAtivo]])

      const celula = extrairDadosCelulaMatriz({
        produtoId: 'p1',
        canalId: 'shopee',
        mapaClassificacoes,
        mapaPrecoPorProdCanal,
        mapaLegendas,
      })

      expect(celula.classificacao).toBeDefined()
      expect(celula.legenda?.nome).toBe('Ativo')
      expect(celula.legenda?.cor).toBe('#10B981')
      expect(celula.precoInfo?.preco_aprovado).toBe(49.9)
    })

    it('produto sem classificação no canal fica vazio/sem legenda', () => {
      const mapaClassificacoes = new Map<string, PrecMatrizClassificacaoRecord>()
      const mapaPrecoPorProdCanal = {}
      const mapaLegendas = new Map<string, PrecMatrizLegendaRecord>()

      const celula = extrairDadosCelulaMatriz({
        produtoId: 'p1',
        canalId: 'kwai',
        mapaClassificacoes,
        mapaPrecoPorProdCanal,
        mapaLegendas,
      })

      expect(celula.classificacao).toBeUndefined()
      expect(celula.legenda).toBeUndefined()
      expect(celula.precoInfo).toBeUndefined()
    })

    it('se não há preço para o canal mas há classificação, mantém legenda e sem preço', () => {
      const mapaClassificacoes = new Map<string, PrecMatrizClassificacaoRecord>([
        [
          'p1__shein',
          {
            id: 'c2',
            produto: 'p1',
            canal: 'shein',
            legenda: 'leg_rejeitado',
            created: '2026-01-01',
            updated: '2026-01-01',
          },
        ],
      ])

      const mapaPrecoPorProdCanal = {} // sem preço aprovado no canal
      const mapaLegendas = new Map<string, PrecMatrizLegendaRecord>([
        ['leg_rejeitado', legRejeitado],
      ])

      const celula = extrairDadosCelulaMatriz({
        produtoId: 'p1',
        canalId: 'shein',
        mapaClassificacoes,
        mapaPrecoPorProdCanal,
        mapaLegendas,
      })

      expect(celula.classificacao).toBeDefined()
      expect(celula.legenda?.nome).toBe('Rejeitado')
      expect(celula.legenda?.cor).toBe('#EF4444')
      expect(celula.precoInfo).toBeUndefined()
    })
  })

  describe('getTextoContraste', () => {
    it('deve retornar texto preto (#111827) para cores claras como amarelo (#F59E0B)', () => {
      expect(getTextoContraste('#FCD34D')).toBe('#111827')
      expect(getTextoContraste('#FFFFFF')).toBe('#111827')
    })

    it('deve retornar texto branco (#FFFFFF) para cores escuras', () => {
      expect(getTextoContraste('#10B981')).toBe('#FFFFFF')
      expect(getTextoContraste('#EF4444')).toBe('#FFFFFF')
      expect(getTextoContraste('#000000')).toBe('#FFFFFF')
    })
  })
})
