import { describe, expect, it } from 'vitest'

import {
  adicionarAoGrupo,
  criarGrupoDePar,
  desagruparFrente,
  desfazerGrupo,
  girarPilha,
  montarGruposSalvos,
  montarPosicoes,
  moverPosicao,
  normalizarMembros,
  proximaOrdem,
  tituloGrupo,
  trazerParaFrente,
  type TriagemGrupoRecord,
} from './triagemGrupos'
import type { TriagemAvaliacao } from './triagemModelo'

/** Avaliação mínima só com o que montarPosicoes usa (produto.id). */
function av(id: string): TriagemAvaliacao {
  return {
    produto: {
      id,
      nome: `Produto ${id}`,
      sku: `SKU-${id}`,
      tipo: 'revenda',
      created: '2026-01-01T10:00:00.000Z',
    },
    etapas: {} as TriagemAvaliacao['etapas'],
    parouNaEtapaNumero: 1,
    integrado: false,
    selo: '⚠️ Parou na etapa 1 — Base',
    severidadePendencia: 'vermelho',
    etapasCinzas: [],
    etapasAmarelas: [],
  }
}

const A = 'avA'
const B = 'avB'
const C = 'avC'
const D = 'avD'

describe('montarPosicoes', () => {
  it('sem grupos: todos os produtos ficam como cards soltos na ordem recebida', () => {
    const posicoes = montarPosicoes([av(A), av(B), av(C)], [])
    expect(posicoes).toEqual([
      { tipo: 'solto', produtoId: A },
      { tipo: 'solto', produtoId: B },
      { tipo: 'solto', produtoId: C },
    ])
  })

  it('grupo salvo reaparece como posição de grupo seguido dos soltos', () => {
    const grupos = [{ id: 'g1', titulo: 'Toalhas', membros: [A, B] }]
    const posicoes = montarPosicoes([av(A), av(B), av(C)], grupos)
    expect(posicoes).toEqual([
      { tipo: 'grupo', grupoId: 'g1' },
      { tipo: 'solto', produtoId: C },
    ])
  })

  it('membro removido do catálogo é descartado do grupo', () => {
    const grupos = [{ id: 'g1', titulo: '', membros: [A, 'fantasma', B] }]
    const posicoes = montarPosicoes([av(A), av(B)], grupos)
    expect(posicoes).toEqual([{ tipo: 'grupo', grupoId: 'g1' }])
  })

  it('grupo com 1 membro restante vira card solto; grupo vazio some', () => {
    const grupos = [
      { id: 'g1', titulo: '', membros: [A, 'fantasma'] },
      { id: 'g2', titulo: '', membros: ['fantasma2'] },
    ]
    const posicoes = montarPosicoes([av(A), av(B)], grupos)
    expect(posicoes).toEqual([
      { tipo: 'solto', produtoId: A },
      { tipo: 'solto', produtoId: B },
    ])
  })

  it('produto em dois grupos (dado corrompido) só aparece no primeiro', () => {
    const grupos = [
      { id: 'g1', titulo: '', membros: [A, B] },
      { id: 'g2', titulo: '', membros: [B, C] },
    ]
    const posicoes = montarPosicoes([av(A), av(B), av(C)], grupos)
    expect(posicoes).toEqual([
      { tipo: 'grupo', grupoId: 'g1' },
      { tipo: 'grupo', grupoId: 'g2' },
    ])
  })
})

describe('montarGruposSalvos', () => {
  it('ordena pela ordem gravada e copia os membros', () => {
    const registros: TriagemGrupoRecord[] = [
      { id: 'g2', titulo: 'B', ordem: 2, membros: [C] },
      { id: 'g1', titulo: 'A', ordem: 1, membros: [A, B] },
    ]
    const grupos = montarGruposSalvos(registros)
    expect(grupos.map((g) => g.id)).toEqual(['g1', 'g2'])
    expect(grupos[0].membros).toEqual([A, B])
  })

  it('ordem ausente/zero vai para o fim (depois das ordens positivas)', () => {
    const registros: TriagemGrupoRecord[] = [
      { id: 'g3', titulo: '', ordem: 0, membros: [] },
      { id: 'g1', titulo: '', ordem: 5, membros: [] },
      { id: 'g2', titulo: '', ordem: 1, membros: [] },
    ]
    const grupos = montarGruposSalvos(registros)
    expect(grupos.map((g) => g.id)).toEqual(['g2', 'g1', 'g3'])
  })
})

describe('normalizarMembros', () => {
  it('aceita array de ids, remove duplicatas e valores inválidos', () => {
    expect(normalizarMembros([A, A, B])).toEqual([A, B])
    expect(normalizarMembros([A, 5, null, ''])).toEqual([A])
    expect(normalizarMembros('não é array')).toEqual([])
    expect(normalizarMembros(undefined)).toEqual([])
  })
})

describe('operações de grupo', () => {
  it('criarGrupoDePar: a fica na FRENTE (primeira posição)', () => {
    const g = criarGrupoDePar(A, B)
    expect(g.membros).toEqual([A, B])
    expect(g.titulo).toBe('')
  })

  it('entrar em grupo existente: produto entra no FIM da pilha', () => {
    const g = adicionarAoGrupo({ id: 'g1', titulo: '', membros: [A, B] }, C)
    expect(g.membros).toEqual([A, B, C])
    // duplicado não muda nada
    expect(adicionarAoGrupo(g, C).membros).toEqual([A, B, C])
  })

  it('clique traz o card para a FRENTE (e não duplica)', () => {
    const g = trazerParaFrente({ id: 'g1', titulo: '', membros: [A, B, C] }, B)
    expect(g.membros).toEqual([B, A, C])
    expect(trazerParaFrente(g, B).membros).toEqual([B, A, C])
    expect(trazerParaFrente(g, 'fantasma').membros).toEqual([B, A, C])
  })

  it('navegação circular ‹ › circula os membros', () => {
    const g = { id: 'g1', titulo: '', membros: [A, B, C] }
    expect(girarPilha(g, true).membros).toEqual([B, C, A]) // ›  próximo
    expect(girarPilha(g, false).membros).toEqual([C, A, B]) // ‹ anterior
    // grupo com 1 membro não gira
    expect(girarPilha({ id: 'g2', titulo: '', membros: [A] }, true).membros).toEqual([A])
  })

  it('desagruparFrente: frente vira solto, grupo segue com o resto', () => {
    const r = desagruparFrente({ id: 'g1', titulo: '', membros: [A, B, C] })
    expect(r.liberado).toBe(A)
    expect(r.grupo?.membros).toEqual([B, C])

    // grupo de 2 se desfaz ao liberar a frente
    const r2 = desagruparFrente({ id: 'g2', titulo: '', membros: [B, C] })
    expect(r2.liberado).toBe(B)
    expect(r2.grupo).toBeNull()
  })

  it('desfazerGrupo: todos os membros voltam a ser cards soltos', () => {
    expect(desfazerGrupo({ id: 'g1', titulo: '', membros: [A, B, C] })).toEqual([A, B, C])
  })
})

describe('moverPosicao', () => {
  it('move card solto dentro da grade sem duplicar posições', () => {
    const posicoes = montarPosicoes([av(A), av(B), av(C)], [])
    const out = moverPosicao(posicoes, 0, 2)
    expect(out.map((p) => (p.tipo === 'solto' ? p.produtoId : '?'))).toEqual([B, C, A])
  })

  it('grupo se move como bloco', () => {
    const grupos = [{ id: 'g1', titulo: '', membros: [A, B] }]
    const posicoes = montarPosicoes([av(A), av(B), av(C), av(D)], grupos)
    // [g1, C, D] → move g1 para o fim
    const out = moverPosicao(posicoes, 0, 2)
    expect(out).toEqual([
      { tipo: 'solto', produtoId: C },
      { tipo: 'solto', produtoId: D },
      { tipo: 'grupo', grupoId: 'g1' },
    ])
  })
})

describe('persistência (regra da coleção prec_triagem_grupos)', () => {
  it('grupo recarregado do banco reproduz exatamente o estado salvo', () => {
    const salvo: TriagemGrupoRecord = {
      id: 'g1',
      titulo: 'Toalhas Isa',
      ordem: 1,
      membros: ['KIT-BIsa-5', 'KIT-Blsa-10', 'KIT-Blsa-3'],
    }
    const grupos = montarGruposSalvos([salvo])
    const posicoes = montarPosicoes([av('KIT-BIsa-5'), av('KIT-Blsa-10'), av('KIT-Blsa-3')], grupos)
    expect(posicoes).toEqual([{ tipo: 'grupo', grupoId: 'g1' }])
    // frente = primeiro membro, ordem interna preservada
    expect(grupos[0].membros).toEqual(['KIT-BIsa-5', 'KIT-Blsa-10', 'KIT-Blsa-3'])
  })

  it('proximaOrdem devolve a próxima posição livre (ordem começa em 1)', () => {
    expect(proximaOrdem([])).toBe(1)
    expect(proximaOrdem([{ id: 'g1', titulo: '', ordem: 3, membros: [] }])).toBe(4)
  })

  it('título vazio mostra o rótulo padrão "Grupo"', () => {
    expect(tituloGrupo({ titulo: '' })).toBe('Grupo')
    expect(tituloGrupo({ titulo: '   ' })).toBe('Grupo')
    expect(tituloGrupo({ titulo: 'Toalhas' })).toBe('Toalhas')
  })
})
