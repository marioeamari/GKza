import { describe, it, expect } from 'vitest'
import {
  formatarDimensaoInsumo,
  criarSnapshotItemReceita,
  congelarSnapshotReceita,
  aplicarAutoPreenchimentoEmbalagem,
} from '@/services/insumos'
import type { InsumoRecord } from '@/types/domain'
import type { ItemComposicaoCusto } from '@/lib/precificacao/calculo'

describe('Catálogo de Insumos & Receitas Técnicas (Fichas e Orçamentos)', () => {
  // Mock de insumo básico
  const mockInsumoMateriaPrima: InsumoRecord = {
    id: 'ins_tecido_01',
    collectionId: 'col_insumos',
    collectionName: 'insumos',
    created: '2025-01-01',
    updated: '2025-01-01',
    nome: 'Tecido Algodão Egípcio Branco',
    tipo: 'insumo',
    unidade: 'm',
    valor_unitario: 25.5,
    ativo: true,
    dimensao_tipo: '2d',
    dimensao_largura_cm: 140,
    dimensao_altura_cm: 200,
    fornecedor: 'forn_textil_01',
    expand: {
      fornecedor: {
        id: 'forn_textil_01',
        collectionId: 'col_fornecedores',
        collectionName: 'fornecedores',
        razao_social: 'Têxtil Brasil S.A.',
        nome_fantasia: 'Têxtil Brasil',
      } as any,
      categoria: {
        id: 'cat_tecidos',
        collectionId: 'col_insumos_categorias',
        collectionName: 'insumos_categorias',
        nome: 'Tecidos & Malhas',
        ordem: 1,
        ativo: true,
      },
    },
  }

  const mockInsumoEmbalagem: InsumoRecord = {
    id: 'ins_emb_01',
    collectionId: 'col_insumos',
    collectionName: 'insumos',
    created: '2025-01-01',
    updated: '2025-01-01',
    nome: 'Caixa de Envio Papelão Reforçada',
    tipo: 'insumo',
    unidade: 'un',
    valor_unitario: 3.8,
    ativo: true,
    dimensao_tipo: '3d',
    dimensao_comprimento_cm: 30,
    dimensao_largura_cm: 20,
    dimensao_altura_cm: 10,
    expand: {
      categoria: {
        id: 'cat_embalagens',
        collectionId: 'col_insumos_categorias',
        collectionName: 'insumos_categorias',
        nome: 'Embalagem',
        ordem: 2,
        ativo: true,
      },
    },
  }

  // (1) autopreenchimento de custo_adicional_embalagem ao escolher insumo de Embalagem
  it('(1) autopreenche custo_adicional_embalagem ao escolher insumo da categoria Embalagem quando não editado manualmente', () => {
    // Caso 1: valor vazio / 0 e não editado manualmente
    const res1 = aplicarAutoPreenchimentoEmbalagem({
      insumo: mockInsumoEmbalagem,
      valorEmbalagemAtual: '',
      editadoManualmente: false,
    })
    expect(res1.deveAtualizar).toBe(true)
    expect(res1.novoValor).toBe(3.8)

    // Caso 2: valor default '0.10' mas marcado como não editado manualmente
    const res2 = aplicarAutoPreenchimentoEmbalagem({
      insumo: mockInsumoEmbalagem,
      valorEmbalagemAtual: '0.10',
      editadoManualmente: false,
    })
    expect(res2.deveAtualizar).toBe(true)
    expect(res2.novoValor).toBe(3.8)

    // Caso 3: insumo que NÃO é embalagem não deve atualizar
    const resNaoEmb = aplicarAutoPreenchimentoEmbalagem({
      insumo: mockInsumoMateriaPrima,
      valorEmbalagemAtual: '0.10',
      editadoManualmente: false,
    })
    expect(resNaoEmb.deveAtualizar).toBe(false)
  })

  // (2) sobrescrita manual respeitada
  it('(2) respeita a sobrescrita manual do usuário sem substituir o valor digitado', () => {
    const res = aplicarAutoPreenchimentoEmbalagem({
      insumo: mockInsumoEmbalagem,
      valorEmbalagemAtual: '5.50',
      editadoManualmente: true,
    })
    expect(res.deveAtualizar).toBe(false)
    expect(res.novoValor).toBe(null)
  })

  // (3) custo da linha = qtd × valor_unitario
  it('(3) calcula corretamente o custo da linha como qtd × valor_unitario', () => {
    const itemComposicao: ItemComposicaoCusto = {
      codigo: 'C0',
      descricao: mockInsumoMateriaPrima.nome,
      qtd: 3.5,
      custo_unitario: mockInsumoMateriaPrima.valor_unitario, // 25.5
      categoria_custo: 'material',
    }

    const subtotal = Math.round(itemComposicao.qtd * itemComposicao.custo_unitario * 100) / 100
    // 3.5 × 25.5 = 89.25
    expect(subtotal).toBe(89.25)

    // Verificando também snapshot gerado
    const snapshot = criarSnapshotItemReceita(itemComposicao, '2025-01-01T00:00:00.000Z')
    const subtotalSnapshot = Math.round(snapshot.qtd * snapshot.custo_unitario * 100) / 100
    expect(subtotalSnapshot).toBe(89.25)
    expect(snapshot.snapshot_valor_unitario).toBe(25.5)
  })

  // (4) formatação 2D (L × A cm) e 3D (C × L × A cm)
  it('(4) formata dimensões 2D (L × A cm) e 3D (C × L × A cm) corretamente', () => {
    // 2D: Tecido 140 × 200 cm
    const dim2d = formatarDimensaoInsumo(mockInsumoMateriaPrima)
    expect(dim2d).toBe('140 × 200 cm')

    // 3D: Caixa 30 × 20 × 10 cm
    const dim3d = formatarDimensaoInsumo(mockInsumoEmbalagem)
    expect(dim3d).toBe('30 × 20 × 10 cm')

    // Sem dimensões
    const insumoSimples: InsumoRecord = {
      id: 'ins_linha_01',
      collectionId: 'col_insumos',
      collectionName: 'insumos',
      created: '2025-01-01',
      updated: '2025-01-01',
      nome: 'Linha de Costura',
      tipo: 'insumo',
      unidade: 'un',
      valor_unitario: 4.0,
      ativo: true,
    }
    expect(formatarDimensaoInsumo(insumoSimples)).toBe('')
  })

  // (5) imutabilidade do snapshot — alterar o insumo no catálogo depois não muda o congelado
  it('(5) garante a imutabilidade do snapshot: alterar o insumo no catálogo posterior não afeta a receita congelada', () => {
    const receitaOriginal: ItemComposicaoCusto[] = [
      {
        codigo: 'C0',
        descricao: mockInsumoMateriaPrima.nome,
        qtd: 2,
        custo_unitario: mockInsumoMateriaPrima.valor_unitario, // 25.50
        categoria_custo: 'material',
        insumo_id: mockInsumoMateriaPrima.id,
        dimensao_formatada: '140 × 200 cm',
        fornecedor_nome: 'Têxtil Brasil',
      },
      {
        codigo: 'C1',
        descricao: mockInsumoEmbalagem.nome,
        qtd: 1,
        custo_unitario: mockInsumoEmbalagem.valor_unitario, // 3.80
        categoria_custo: 'insumo',
        insumo_id: mockInsumoEmbalagem.id,
        dimensao_formatada: '30 × 20 × 10 cm',
        fornecedor_nome: 'Embalagens Express',
      },
    ]

    // Congela a receita para o orçamento
    const snapshotCongelado = congelarSnapshotReceita(receitaOriginal, '2025-01-01T10:00:00.000Z')

    expect(snapshotCongelado).toHaveLength(2)
    expect(snapshotCongelado[0].custo_unitario).toBe(25.5)
    expect(snapshotCongelado[0].dimensao_formatada).toBe('140 × 200 cm')
    expect(snapshotCongelado[1].custo_unitario).toBe(3.8)

    // Simula alteração posterior no catálogo de insumos / produto
    receitaOriginal[0].custo_unitario = 99.99
    receitaOriginal[0].descricao = 'Tecido Alterado e Muito Mais Caro'
    receitaOriginal[0].dimensao_formatada = '300 × 500 cm'
    mockInsumoMateriaPrima.valor_unitario = 99.99

    // O snapshot congelado no orçamento DEVE permanecer inalterado (imutabilidade profunda)
    expect(snapshotCongelado[0].custo_unitario).toBe(25.5)
    expect(snapshotCongelado[0].descricao).toBe('Tecido Algodão Egípcio Branco')
    expect(snapshotCongelado[0].dimensao_formatada).toBe('140 × 200 cm')
    expect(snapshotCongelado[0].fornecedor_nome).toBe('Têxtil Brasil')
  })

  // (6) produto legado sem vínculo preserva valores
  it('(6) preserva valores de produtos legados sem vínculo no catálogo de insumos', () => {
    const itemLegado: ItemComposicaoCusto = {
      codigo: 'C0',
      descricao: 'Matéria-prima genérica digitada à mão nos anos anteriores',
      qtd: 5,
      custo_unitario: 12.34,
      categoria_custo: 'material',
      // Sem insumo_id nem fornecedor vinculado
    }

    const snapshot = criarSnapshotItemReceita(itemLegado, '2025-01-01T12:00:00.000Z')

    expect(snapshot.codigo).toBe('C0')
    expect(snapshot.descricao).toBe('Matéria-prima genérica digitada à mão nos anos anteriores')
    expect(snapshot.qtd).toBe(5)
    expect(snapshot.custo_unitario).toBe(12.34)
    expect(snapshot.insumo_id).toBeUndefined()
    expect(snapshot.dimensao_formatada).toBeUndefined()
    expect(snapshot.fornecedor_nome).toBeUndefined()

    // O congelamento em lote também funciona para listas legadas
    const congelado = congelarSnapshotReceita([itemLegado])
    expect(congelado[0].custo_unitario).toBe(12.34)
    expect(congelado[0].descricao).toBe(itemLegado.descricao)
  })
})
