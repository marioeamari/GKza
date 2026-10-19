import { describe, it, expect } from 'vitest'
import {
  isItemPrincipalPermitido,
  buildItensPrincipaisOpcoes,
  temLinhaEmbalagemNaComposicao,
  calcularCustoTotalKit,
} from './kitComboHelpers'
import type { PrecProdutoRecord } from '@/types/precificacao'
import type { ProdutoBaseRecord } from '@/types/domain'

describe('kitComboHelpers - Regras de Composição de Kits e Combos', () => {
  describe('(B) Validação de Item Principal permitido', () => {
    it('kit aceita produto composto (fabricação própria ou revenda)', () => {
      expect(
        isItemPrincipalPermitido({ tipo: 'fabricacao_propria', origem: 'composto' }, 'kit'),
      ).toBe(true)
      expect(isItemPrincipalPermitido({ tipo: 'revenda', origem: 'composto' }, 'kit')).toBe(true)
    })

    it('kit aceita produto base APENAS com tipo = revenda', () => {
      expect(isItemPrincipalPermitido({ tipo: 'revenda', origem: 'produto_base' }, 'kit')).toBe(
        true,
      )
    })

    it('kit NÃO aceita insumo/embalagem/serviço como item principal, apenas como linha de embalagem/etiqueta', () => {
      expect(isItemPrincipalPermitido({ tipo: 'insumo', origem: 'produto_base' }, 'kit')).toBe(
        false,
      )
      expect(isItemPrincipalPermitido({ tipo: 'embalagem', origem: 'produto_base' }, 'kit')).toBe(
        false,
      )
      expect(isItemPrincipalPermitido({ tipo: 'etiqueta', origem: 'produto_base' }, 'kit')).toBe(
        false,
      )
      expect(isItemPrincipalPermitido({ tipo: 'servico', origem: 'produto_base' }, 'kit')).toBe(
        false,
      )
      expect(isItemPrincipalPermitido({ tipo: 'tecido', origem: 'produto_base' }, 'kit')).toBe(
        false,
      )
      expect(isItemPrincipalPermitido({ tipo: 'pintura', origem: 'produto_base' }, 'kit')).toBe(
        false,
      )
      expect(isItemPrincipalPermitido({ tipo: 'costura', origem: 'produto_base' }, 'kit')).toBe(
        false,
      )
      expect(isItemPrincipalPermitido({ tipo: 'outro', origem: 'produto_base' }, 'kit')).toBe(false)
    })

    it('combo aceita produto composto, kits e produto base tipo revenda, mas NÃO insumos/serviços', () => {
      expect(
        isItemPrincipalPermitido({ tipo: 'fabricacao_propria', origem: 'composto' }, 'combo'),
      ).toBe(true)
      expect(isItemPrincipalPermitido({ tipo: 'revenda', origem: 'composto' }, 'combo')).toBe(true)
      expect(isItemPrincipalPermitido({ tipo: 'kit', origem: 'composto' }, 'combo')).toBe(true)
      expect(isItemPrincipalPermitido({ tipo: 'revenda', origem: 'produto_base' }, 'combo')).toBe(
        true,
      )

      expect(isItemPrincipalPermitido({ tipo: 'insumo', origem: 'produto_base' }, 'combo')).toBe(
        false,
      )
      expect(isItemPrincipalPermitido({ tipo: 'embalagem', origem: 'produto_base' }, 'combo')).toBe(
        false,
      )
      expect(isItemPrincipalPermitido({ tipo: 'servico', origem: 'produto_base' }, 'combo')).toBe(
        false,
      )
    })
  })

  describe('buildItensPrincipaisOpcoes', () => {
    it('filtra corretamente a lista consolidada para a UI e NÃO lista compostos inativos', () => {
      const compostosMock: Partial<PrecProdutoRecord>[] = [
        {
          id: 'c1',
          nome: 'Toalha Allure Composta',
          sku: 'ALL-01',
          tipo: 'fabricacao_propria',
          status: 'ativo',
        },
        { id: 'c2', nome: 'Pano Copa Composto', sku: 'PC-01', tipo: 'revenda', status: 'ativo' },
        {
          id: 'c3_inativo',
          nome: 'Produto Excluido Inativo',
          sku: 'EXC-01',
          tipo: 'revenda',
          status: 'inativo',
        },
      ]

      const basesMock: Partial<ProdutoBaseRecord>[] = [
        {
          id: 'b1',
          nome: 'Toalha Direta Fornecedor',
          sku: 'FORN-01',
          tipo: 'revenda',
          custo_unitario: 15,
        },
        {
          id: 'b2',
          nome: 'Saco Plástico 30x40',
          sku: 'EMB-01',
          tipo: 'embalagem',
          custo_unitario: 0.35,
        },
        {
          id: 'b3',
          nome: 'Etiqueta Bordada',
          sku: 'ETIQ-01',
          tipo: 'etiqueta',
          custo_unitario: 0.1,
        },
        { id: 'b4', nome: 'Costura Bainha', tipo: 'costura', custo_unitario: 1.5 },
      ]

      const opcoes = buildItensPrincipaisOpcoes({
        produtosCompostos: compostosMock as PrecProdutoRecord[],
        produtosBase: basesMock as ProdutoBaseRecord[],
        contexto: 'kit',
      })

      // Apenas c1, c2 e b1 devem aparecer. c3_inativo, b2, b3 e b4 NUNCA aparecem como item principal
      const ids = opcoes.map((o) => o.id)
      expect(ids).toContain('comp_c1')
      expect(ids).toContain('comp_c2')
      expect(ids).not.toContain('comp_c3_inativo')
      expect(ids).toContain('base_b1')
      expect(ids).not.toContain('base_b2')
      expect(ids).not.toContain('base_b3')
      expect(ids).not.toContain('base_b4')
      expect(opcoes).toHaveLength(3)
    })
  })

  describe('(A & B) Cálculo de Custo do Kit: itens + linhas analíticas + campos legados', () => {
    it('novo kit: soma itens + linhas da composição analítica com campos legados zerados', () => {
      // 2 unidades de toalha a R$ 20 cada = R$ 40
      // Composição com 1 saco kraft (embalagem) a R$ 0,50 e 1 etiqueta a R$ 0,15 = R$ 0,65
      // Campos legados custo_embalagem e custo_etiqueta = 0
      const res = calcularCustoTotalKit({
        custoComponenteUnitario: 20,
        quantidadeComponente: 2,
        composicao: [
          {
            id: 'C1',
            codigo: 'C1',
            descricao: 'Saco Kraft 20x30',
            qtd: 1,
            custo_unitario: 0.5,
            categoria_custo: 'embalagem',
          },
          {
            id: 'C2',
            codigo: 'C2',
            descricao: 'Etiqueta Adesiva',
            qtd: 1,
            custo_unitario: 0.15,
            categoria_custo: 'etiqueta',
          },
        ],
        custoEmbalagemLegado: 0,
        custoEtiquetaLegado: 0,
      })

      expect(res.custoComponentes).toBe(40)
      expect(res.custoComposicao).toBe(0.65)
      expect(res.custoEmbalagemEfetivo).toBe(0)
      expect(res.custoEtiquetaEfetivo).toBe(0)
      expect(res.custoTotal).toBe(40.65)
    })

    it('produto e kit legado com valor nos campos continua somando se composição não tem embalagem', () => {
      // 3 unidades a R$ 10 = R$ 30
      // Sem composição de embalagem
      // Custo embalagem legado = 0.80, etiqueta legada = 0.20
      const res = calcularCustoTotalKit({
        custoComponenteUnitario: 10,
        quantidadeComponente: 3,
        composicao: [],
        custoEmbalagemLegado: 0.8,
        custoEtiquetaLegado: 0.2,
      })

      expect(res.custoComponentes).toBe(30)
      expect(res.custoComposicao).toBe(0)
      expect(res.custoEmbalagemEfetivo).toBe(0.8)
      expect(res.custoEtiquetaEfetivo).toBe(0.2)
      expect(res.custoTotal).toBe(31) // 30 + 0.8 + 0.2
    })

    it('mantém a regra vigente de zerar custo_embalagem legado quando a composição já contém embalagem (elimina dupla contagem)', () => {
      // 2 unidades a R$ 10 = R$ 20
      // Composição já tem Embalagem por R$ 0.70
      // Campo legado tem R$ 0.50 -> deve ser ignorado para não duplicar embalagem
      // Campo de etiqueta tem R$ 0.10 -> somado normalmente
      const res = calcularCustoTotalKit({
        custoComponenteUnitario: 10,
        quantidadeComponente: 2,
        composicao: [
          {
            id: 'C1',
            codigo: 'C1',
            descricao: 'Caixa de Envio',
            qtd: 1,
            custo_unitario: 0.7,
            categoria_custo: 'embalagem',
          },
        ],
        custoEmbalagemLegado: 0.5,
        custoEtiquetaLegado: 0.1,
      })

      expect(res.custoComponentes).toBe(20)
      expect(res.custoComposicao).toBe(0.7)
      expect(res.custoEmbalagemEfetivo).toBe(0) // zerado contra dupla contagem
      expect(res.custoEtiquetaEfetivo).toBe(0.1)
      expect(res.custoTotal).toBe(20.8) // 20 + 0.70 + 0 + 0.10
    })

    // Caso 4: Kit 5× com perda por linha → 5 × qtd ajustada
    it('Caso 4: Kit 5x com perda por linha -> 5 x qtd ajustada ou composicao ajustada', () => {
      // Exemplo Kit de 5 unidades de produto componente a R$ 10 (base = 50) + item de composição com perda 10%
      const res = calcularCustoTotalKit({
        custoComponenteUnitario: 10,
        quantidadeComponente: 5,
        composicao: [
          {
            id: 'C1',
            codigo: 'C1',
            descricao: 'Fita adesiva / embalagem',
            qtd: 2,
            custo_unitario: 5,
            categoria_custo: 'insumo',
            perda_pct: 10, // 2 * 1.10 = 2.2 qtd efetiva -> 2.2 * 5 = 11.00
          },
        ],
      })

      expect(res.custoComponentes).toBe(50)
      expect(res.custoComposicao).toBeCloseTo(11.0, 2)
      expect(res.custoTotal).toBeCloseTo(61.0, 2)
    })

    // (D) Testes que travam as novas regras solicitadas pelo usuário:
    // 1. Kit sem perda = custo igual ao atual (regressão zero)
    it('Regra D1: kit sem perda = custo igual ao atual (regressão zero)', () => {
      const res = calcularCustoTotalKit({
        custoComponenteUnitario: 15,
        quantidadeComponente: 2,
        composicao: [
          {
            id: 'C1',
            descricao: 'Caixa',
            qtd: 1,
            custo_unitario: 3,
            categoria_custo: 'embalagem',
          },
        ],
      })

      expect(res.custoComponentes).toBe(30)
      expect(res.quantidadeEfetiva).toBe(2)
      expect(res.custoComposicao).toBe(3)
      expect(res.custoTotal).toBe(33)
    })

    // 2. Kit com perda global 10% sem perda por linha = custo direto × 1,10
    it('Regra D2: kit com perda global 10% sem perda por linha = custo direto x 1,10', () => {
      // Componentes: 2 un a R$ 20 = R$ 40
      // Composição: 1 un a R$ 10 = R$ 10
      // Custo direto total = 50 -> com perda global 10% = 55
      const res = calcularCustoTotalKit({
        custoComponenteUnitario: 20,
        quantidadeComponente: 2,
        perdaComponente: 0,
        composicao: [
          {
            id: 'C1',
            descricao: 'Insumo',
            qtd: 1,
            custo_unitario: 10,
            categoria_custo: 'insumo',
          },
        ],
        perda_pct: 10,
      })

      expect(res.custoComponentes).toBe(40)
      expect(res.custoComposicao).toBe(10)
      expect(res.custoTotal).toBe(55) // 50 * 1.10
    })

    // 3. Item principal 5 un com perda 20% = 6 un efetivas
    it('Regra D3: item principal 5 un com perda 20% = 6 un efetivas (ex: 5 panos com 1 defeituoso)', () => {
      // 5 un * (1 + 20/100) = 6 un efetivas
      // Unitário R$ 10 -> custo dos componentes = 6 * 10 = 60
      const res = calcularCustoTotalKit({
        custoComponenteUnitario: 10,
        quantidadeComponente: 5,
        perdaComponente: 20,
      })

      expect(res.quantidadeEfetiva).toBe(6)
      expect(res.custoComponentes).toBe(60)
      expect(res.custoTotal).toBe(60)
    })

    // 4. Perda da linha vence a perda global (não multiplicar em cascata)
    it('Regra D4: perda da linha vence a global no kit (não multiplica em cascata)', () => {
      // Componente principal tem perda 20% (5 un -> 6 un efetivas a R$ 10 = R$ 60)
      // Perda global de 10% informada no Kit -> DEVE FICAR INATIVA porque a linha tem perda
      const res = calcularCustoTotalKit({
        custoComponenteUnitario: 10,
        quantidadeComponente: 5,
        perdaComponente: 20,
        perda_pct: 10, // global deve ser anulada
      })

      expect(res.quantidadeEfetiva).toBe(6)
      expect(res.custoComponentes).toBe(60)
      expect(res.custoTotal).toBe(60) // Se tivesse cascata seria 60 * 1.10 = 66
    })

    it('Regra D4b: perda na linha da composição analítica anula a perda global do kit', () => {
      // Componentes: 2 un a R$ 20 = 40 (sem perda)
      // Composição: 1 un a R$ 10 com 10% de perda = 1.1 * 10 = 11
      // Perda global de 15% -> deve ser anulada porque a composição tem perda própria
      const res = calcularCustoTotalKit({
        custoComponenteUnitario: 20,
        quantidadeComponente: 2,
        composicao: [
          {
            id: 'C1',
            descricao: 'Fita',
            qtd: 1,
            custo_unitario: 10,
            perda_pct: 10,
          },
        ],
        perda_pct: 15, // global inativa
      })

      expect(res.custoComponentes).toBe(40)
      expect(res.custoComposicao).toBe(11)
      expect(res.custoTotal).toBe(51) // 40 + 11 (sem cascata de 15%)
    })
  })
})
