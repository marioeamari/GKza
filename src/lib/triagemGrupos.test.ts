import { describe, expect, it } from 'vitest'

import {
  adicionarAoGrupo,
  criarGrupoDePar,
  desagruparFrente,
  desfazerGrupo,
  girarPilha,
  interpretarSoltar,
  montarGruposSalvos,
  montarPosicoes,
  moverPosicao,
  normalizarMembros,
  projetarGruposVisiveis,
  proximaOrdem,
  reordenarGrupos,
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

describe('interpretarSoltar', () => {
  it('soltar card sobre o CENTRO de outro card solto agrupa os dois', () => {
    const posicoes = montarPosicoes([av(A), av(B), av(C)], [])
    const d = interpretarSoltar(posicoes, [], 'p:' + B, 'p:' + A, 'centro')
    expect(d).toEqual({ acao: 'agrupar', produtoId: B, alvoProdutoId: A })
  })

  it('soltar card na borda de outro card solto REORDENA (não agrupa)', () => {
    const posicoes = montarPosicoes([av(A), av(B), av(C)], [])
    expect(interpretarSoltar(posicoes, [], 'p:' + B, 'p:' + A, 'antes')).toEqual({
      acao: 'reordenar',
      de: 1,
      para: 0,
    })
    expect(interpretarSoltar(posicoes, [], 'p:' + B, 'p:' + A, 'depois')).toEqual({
      acao: 'reordenar',
      de: 1,
      para: 0,
    })
  })

  it('soltar card sobre um grupo faz o card ENTRAR no grupo (alvo = frente)', () => {
    const grupos = [{ id: 'g1', titulo: '', membros: [A, B] }]
    const posicoes = montarPosicoes([av(A), av(B), av(C)], grupos)
    expect(interpretarSoltar(posicoes, grupos, 'p:' + C, 'g:g1', 'centro')).toEqual({
      acao: 'agrupar',
      produtoId: C,
      alvoProdutoId: A,
    })
    // qualquer zona sobre grupo agrupa (grupo não tem borda de reordenar)
    expect(interpretarSoltar(posicoes, grupos, 'p:' + C, 'g:g1', 'antes')).toEqual({
      acao: 'agrupar',
      produtoId: C,
      alvoProdutoId: A,
    })
  })

  it('arrastar um GRUPO sempre move o bloco (nunca funde grupos)', () => {
    const grupos = [
      { id: 'g1', titulo: '', membros: [A, B] },
      { id: 'g2', titulo: '', membros: [C, D] },
    ]
    const posicoes = montarPosicoes([av(A), av(B), av(C), av(D)], grupos)
    expect(interpretarSoltar(posicoes, grupos, 'g:g1', 'g:g2', 'centro')).toEqual({
      acao: 'reordenar',
      de: 0,
      para: 1,
    })
  })

  it('soltar sobre si mesmo ou alvo inexistente devolve null', () => {
    const posicoes = montarPosicoes([av(A), av(B)], [])
    expect(interpretarSoltar(posicoes, [], 'p:' + A, 'p:' + A, 'centro')).toBeNull()
    expect(interpretarSoltar(posicoes, [], 'p:' + A, null, 'centro')).toBeNull()
    expect(interpretarSoltar(posicoes, [], 'p:' + A, 'g:inexistente', 'centro')).toBeNull()
  })

  it('soltar card que já pertence ao grupo alvo devolve null (idempotente)', () => {
    const grupos = [{ id: 'g1', titulo: '', membros: [A, B] }]
    const posicoes = montarPosicoes([av(A), av(B)], grupos)
    // A é a frente do g1 → chave do grupo é g:g1; arrastar B sobre g1
    expect(interpretarSoltar(posicoes, grupos, 'p:' + B, 'g:g1', 'centro')).toBeNull()
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

// ── Filtro ativo (0.0.322) ────────────────────────────────────────────────────
//
// Regra gravada: sob filtro, a lista de avaliações recebida por montarPosicoes
// é a FILTRADA e os grupos entram PROJETADOS (só membros visíveis). O estado
// real dos grupos NUNCA é alterado pela projeção; ao limpar o filtro a grade
// volta completa. Mutações sob filtro tocam só membros visíveis; grupos
// ocultos preservam a ordem relativa (reordenarGrupos).

describe('filtro ativo: projeção da grade', () => {
  const gruposCompleto = [{ id: 'g1', titulo: 'Kit', membros: [A, B, C] }]

  it('montarPosicoes com lista filtrada: só membros visíveis aparecem; grupo reduzido a 1 vira solto', () => {
    // filtro deixa passar só A e C (B oculto)
    const visiveis = [av(A), av(C)]
    const projetados = projetarGruposVisiveis(gruposCompleto, [A, C])
    const posicoes = montarPosicoes(visiveis, projetados)
    // grupo g1 fica com [A, C] → continua grupo (2+ membros)
    expect(posicoes).toEqual([{ tipo: 'grupo', grupoId: 'g1' }])
  })

  it('grupo com apenas 1 membro visível aparece como card solto (sem pilha vazia)', () => {
    const visiveis = [av(A), av(D)]
    const projetados = projetarGruposVisiveis(gruposCompleto, [A])
    const posicoes = montarPosicoes(visiveis, projetados)
    expect(posicoes).toEqual([
      { tipo: 'solto', produtoId: A }, // grupo degradado = card solto, não pilha
      { tipo: 'solto', produtoId: D },
    ])
  })

  it('grupo cujo todos os membros estão ocultos some da grade (não vira posição vazia)', () => {
    const visiveis = [av(D)]
    const projetados = projetarGruposVisiveis(gruposCompleto, [])
    expect(projetados).toEqual([{ id: 'g1', titulo: 'Kit', membros: [] }])
    expect(montarPosicoes(visiveis, projetados)).toEqual([{ tipo: 'solto', produtoId: D }])
  })

  it('limpar o filtro (idsVisiveis=undefined) devolve os grupos INTACTOS', () => {
    expect(projetarGruposVisiveis(gruposCompleto, undefined)).toEqual(gruposCompleto)
    const posicoes = montarPosicoes([av(A), av(B), av(C), av(D)], gruposCompleto)
    expect(posicoes).toEqual([
      { tipo: 'grupo', grupoId: 'g1' },
      { tipo: 'solto', produtoId: D },
    ])
  })
})

describe('filtro ativo: desagrupar/girar/frente com membros visíveis', () => {
  const g = { id: 'g1', titulo: '', membros: [A, B, C] }

  it('desagruparFrente sob filtro libera o PRIMEIRO membro VISÍVEL (ocultos ficam)', () => {
    // frente real é A, mas A está oculto: frente exibida é B
    const r = desagruparFrente(g, [B, C])
    expect(r.liberado).toBe(B)
    expect(r.grupo?.membros).toEqual([A, C]) // A oculto permanece no grupo
  })

  it('desagruparFrente sem filtro reduz exatamente ao comportamento antigo', () => {
    const r = desagruparFrente(g, undefined)
    expect(r.liberado).toBe(A)
    expect(r.grupo?.membros).toEqual([B, C])
  })

  it('girarPilha sob filtro gira só a subsequência visível (oculto não vira frente)', () => {
    // visíveis B, C: › desloca B→frente exibida; A fica na posição 0 real
    const girado = girarPilha(g, true, [B, C])
    expect(girado.membros).toEqual([A, C, B])
    // A (oculto) segue fora da frente; ao limpar o filtro, frente real é A
    expect(girado.membros[0]).toBe(A)
    // sem filtro: redução exata ao comportamento antigo
    expect(girarPilha(g, true, undefined).membros).toEqual([B, C, A])
  })

  it('trazerParaFrente sob filtro assume a posição do primeiro membro VISÍVEL', () => {
    // C visível é trazido à frente exibida (posição de B); A oculto segue antes
    const movido = trazerParaFrente(g, C, [B, C])
    expect(movido.membros).toEqual([A, C, B])
    // oculto não pode ser trazido (não está na pilha exibida)
    expect(trazerParaFrente(g, A, [B, C]).membros).toEqual([A, B, C])
  })
})

describe('filtro ativo: reordenarGrupos preserva grupos ocultos', () => {
  it('reordena só os grupos visíveis; ocultos mantêm a ordem relativa no fim', () => {
    const grupos = [
      { id: 'g1', titulo: '', membros: [A, B] },
      { id: 'g2', titulo: '', membros: [C, D] },
      { id: 'g3', titulo: '', membros: [A, D] }, // hipotético: interseção
    ]
    // só g3 e g1 aparecem na grade filtrada, nessa ordem nova
    const out = reordenarGrupos(grupos, ['g3', 'g1'])
    expect(out.map((x) => x.id)).toEqual(['g3', 'g1', 'g2']) // g2 oculto preservado
  })

  it('sem filtro (todos os ids) a ordem é exatamente a da grade completa', () => {
    const grupos = [
      { id: 'g1', titulo: '', membros: [A, B] },
      { id: 'g2', titulo: '', membros: [C, D] },
    ]
    expect(reordenarGrupos(grupos, ['g2', 'g1']).map((x) => x.id)).toEqual(['g2', 'g1'])
  })

  it('grade projetada permite reordenar sob filtro sem perder grupos ocultos', () => {
    // grade: g1, g2, D — filtro oculta C (membro de g2) e D vira solto após g2
    const grupos = [
      { id: 'g1', titulo: '', membros: [A, B] },
      { id: 'g2', titulo: '', membros: [C, D] },
    ]
    const visiveis = [av(A), av(B), av(D)]
    const projetados = projetarGruposVisiveis(grupos, ['A', 'B', 'D'])
    const posicoes = montarPosicoes(visiveis, projetados)
    expect(posicoes).toEqual([
      { tipo: 'grupo', grupoId: 'g1' },
      { tipo: 'solto', produtoId: D }, // g2 com só D visível = solto
    ])
    // mover D para a frente: grade nova é [D, g1] → grupos visíveis = [g1]
    const novas = moverPosicao(posicoes, 1, 0)
    expect(novas).toEqual([
      { tipo: 'solto', produtoId: D },
      { tipo: 'grupo', grupoId: 'g1' },
    ])
    const ordem = reordenarGrupos(grupos, ['g1'])
    expect(ordem.map((x) => x.id)).toEqual(['g1', 'g2']) // g2 intacto
    // e limpar o filtro devolve os membros: g2 segue [C, D]
    expect(projetarGruposVisiveis(ordem, undefined)[1].membros).toEqual([C, D])
  })
})
