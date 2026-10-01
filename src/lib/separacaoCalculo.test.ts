import { describe, it, expect } from 'vitest'
import { calcularComposicaoKit } from './separacaoCalculo'
import type { KitTema, KitModelo, KitRegra, KitPedido } from '@/types/separacaoKits'

describe('calcularComposicaoKit - Regras de Separação de Kits', () => {
  const temaMonica: KitTema = {
    id: 'tema_monica',
    nome: 'Turma da Mônica',
    ativo: true,
    ordem: 1,
  }

  const modelosMonica: KitModelo[] = [
    { id: 'm1', tema: 'tema_monica', codigo: 'M01', nome: 'Mônica', ordem: 1, ativo: true },
    { id: 'm2', tema: 'tema_monica', codigo: 'M02', nome: 'Cebolinha', ordem: 2, ativo: true },
    { id: 'm3', tema: 'tema_monica', codigo: 'M03', nome: 'Magali', ordem: 3, ativo: true },
    { id: 'm4', tema: 'tema_monica', codigo: 'M04', nome: 'Cascão', ordem: 4, ativo: true },
    { id: 'm5', tema: 'tema_monica', codigo: 'M05', nome: 'Mônica 2', ordem: 5, ativo: true },
    { id: 'm6', tema: 'tema_monica', codigo: 'M06', nome: 'Turma Completa', ordem: 6, ativo: true },
  ]

  it('Exemplo 1: Turma da Mônica 6 modelos, pedido 30 un -> cada modelo recebe 5 un exatas', () => {
    const res = calcularComposicaoKit({
      tema: temaMonica,
      modelos: modelosMonica,
      quantidadeTotal: 30,
    })

    expect(res.origem).toBe('automatica')
    expect(res.totalGeral).toBe(30)
    expect(res.itens).toHaveLength(6)

    // Todos com 5
    for (const item of res.itens) {
      expect(item.quantidade).toBe(5)
    }
  })

  it('Exemplo 2: Divisão com excedente: 32 un / 6 modelos -> M01=6, M02=6, M03..M06=5 (total 32)', () => {
    const res = calcularComposicaoKit({
      tema: temaMonica,
      modelos: modelosMonica,
      quantidadeTotal: 32,
    })

    expect(res.origem).toBe('automatica')
    expect(res.totalGeral).toBe(32)
    expect(res.itens).toHaveLength(6)

    expect(res.itens[0]).toMatchObject({ codigo: 'M01', quantidade: 6 })
    expect(res.itens[1]).toMatchObject({ codigo: 'M02', quantidade: 6 })
    expect(res.itens[2]).toMatchObject({ codigo: 'M03', quantidade: 5 })
    expect(res.itens[3]).toMatchObject({ codigo: 'M04', quantidade: 5 })
    expect(res.itens[4]).toMatchObject({ codigo: 'M05', quantidade: 5 })
    expect(res.itens[5]).toMatchObject({ codigo: 'M06', quantidade: 5 })

    const soma = res.itens.reduce((acc, i) => acc + i.quantidade, 0)
    expect(soma).toBe(32)
  })

  it('Exemplo 3: Pedido menor que a quantidade de modelos (ex: 4 un / 6 modelos)', () => {
    const res = calcularComposicaoKit({
      tema: temaMonica,
      modelos: modelosMonica,
      quantidadeTotal: 4,
    })

    expect(res.origem).toBe('automatica')
    expect(res.totalGeral).toBe(4)
    // Apenas os 4 primeiros recebem 1 un
    expect(res.itens).toHaveLength(4)
    expect(res.itens[0]).toMatchObject({ codigo: 'M01', quantidade: 1 })
    expect(res.itens[1]).toMatchObject({ codigo: 'M02', quantidade: 1 })
    expect(res.itens[2]).toMatchObject({ codigo: 'M03', quantidade: 1 })
    expect(res.itens[3]).toMatchObject({ codigo: 'M04', quantidade: 1 })
  })

  it('Prioridade 2: Regra manual cadastrada para quantidade tem prioridade sobre automática', () => {
    const regraManual10: KitRegra = {
      id: 'reg_10',
      tema: 'tema_monica',
      tipo: 'manual',
      quantidade_kit: 10,
      descricao: 'Kit 10: M01=3, M02=3, M03=2, M04=2',
      ativo: true,
      composicao: [
        { codigo: 'M01', nome: 'Mônica', quantidade: 3 },
        { codigo: 'M02', nome: 'Cebolinha', quantidade: 3 },
        { codigo: 'M03', nome: 'Magali', quantidade: 2 },
        { codigo: 'M04', nome: 'Cascão', quantidade: 2 },
      ],
    }

    const res = calcularComposicaoKit({
      tema: temaMonica,
      modelos: modelosMonica,
      quantidadeTotal: 10,
      regrasDoTema: [regraManual10],
    })

    expect(res.origem).toBe('manual')
    expect(res.totalGeral).toBe(10)
    expect(res.itens).toHaveLength(4)
    expect(res.itens.find((i) => i.codigo === 'M01')?.quantidade).toBe(3)
    expect(res.itens.find((i) => i.codigo === 'M02')?.quantidade).toBe(3)
    expect(res.itens.find((i) => i.codigo === 'M03')?.quantidade).toBe(2)
    expect(res.itens.find((i) => i.codigo === 'M04')?.quantidade).toBe(2)
  })

  it('Prioridade 1: Pedido personalizado do cliente sobrepõe regras automáticas e manuais', () => {
    const regraManual50: KitRegra = {
      id: 'reg_50',
      tema: 'tema_monica',
      tipo: 'manual',
      quantidade_kit: 50,
      ativo: true,
      composicao: [{ codigo: 'M01', nome: 'Mônica', quantidade: 50 }],
    }

    const pedidoPersonalizado: KitPedido = {
      id: 'ped_1',
      numero_pedido: '987654321',
      produto_nome: 'Kit Toalha',
      tema: 'tema_monica',
      quantidade_total: 50,
      tipo_composicao: 'personalizada',
      status_separacao: 'aguardando',
      composicao_personalizada: [
        { codigo: 'M01', nome: 'Mônica', quantidade: 30 },
        { codigo: 'M06', nome: 'Turma Completa', quantidade: 20 },
      ],
    }

    const res = calcularComposicaoKit({
      tema: temaMonica,
      modelos: modelosMonica,
      quantidadeTotal: 50,
      regrasDoTema: [regraManual50],
      pedidoPersonalizado,
    })

    expect(res.origem).toBe('personalizada')
    expect(res.totalGeral).toBe(50)
    expect(res.itens).toHaveLength(2)
    expect(res.itens[0]).toMatchObject({ codigo: 'M01', quantidade: 30 })
    expect(res.itens[1]).toMatchObject({ codigo: 'M06', quantidade: 20 })
  })

  it('Ignora modelos inativos na distribuição automática e emite alerta se modelo da regra/personalização for inativo', () => {
    const modelosComInativo: KitModelo[] = [
      { id: 'm1', tema: 'tema_monica', codigo: 'M01', nome: 'Mônica', ordem: 1, ativo: true },
      { id: 'm2', tema: 'tema_monica', codigo: 'M02', nome: 'Cebolinha', ordem: 2, ativo: false }, // Inativo
      { id: 'm3', tema: 'tema_monica', codigo: 'M03', nome: 'Magali', ordem: 3, ativo: true },
    ]

    const resAuto = calcularComposicaoKit({
      tema: temaMonica,
      modelos: modelosComInativo,
      quantidadeTotal: 10,
    })

    // Apenas M01 e M03 ativos -> 10 / 2 = 5 cada
    expect(resAuto.origem).toBe('automatica')
    expect(resAuto.itens).toHaveLength(2)
    expect(resAuto.itens.map((i) => i.codigo)).toEqual(['M01', 'M03'])
    expect(resAuto.itens[0].quantidade).toBe(5)
    expect(resAuto.itens[1].quantidade).toBe(5)

    // Se um pedido personalizado pedir o modelo inativo, deve calcular e emitir alerta
    const resPers = calcularComposicaoKit({
      tema: temaMonica,
      modelos: modelosComInativo,
      quantidadeTotal: 10,
      pedidoPersonalizado: {
        id: 'ped_inativo',
        numero_pedido: '111',
        produto_nome: 'Kit',
        tema: 'tema_monica',
        quantidade_total: 10,
        tipo_composicao: 'personalizada',
        status_separacao: 'aguardando',
        composicao_personalizada: [{ codigo: 'M02', nome: 'Cebolinha', quantidade: 10 }],
      },
    })

    expect(resPers.origem).toBe('personalizada')
    expect(resPers.itens[0].inativoAlerta).toBe(true)
    expect(resPers.avisos.length).toBeGreaterThan(0)
  })
})
