import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  adicionarAoGrupo,
  criarGrupoDePar,
  desagruparFrente,
  interpretarSoltar,
  montarPosicoes,
  moverPosicao,
  trazerParaFrente,
  girarPilha,
  type TriagemGrupo,
  type TriagemPosicao,
  type ZonaSoltar,
} from '@/lib/triagemGrupos'
import type { TriagemAvaliacao } from '@/lib/triagemModelo'
import {
  carregarGruposTriagem,
  excluirGrupoTriagem,
  salvarGrupoTriagem,
} from '@/services/triagemGrupos'
import { useToast } from '@/hooks/use-toast'

/**
 * Estado + persistência do agrupamento manual da Triagem (camada de
 * organização visual sobre a leitura padrão — não altera as 7 etapas).
 *
 * Regra gravada (protocolo, migração 0153): grupo = registro em
 * `prec_triagem_grupos` com titulo + ordem + membros (JSON de ids, frente =
 * primeiro). Cards soltos não geram registro. Toda mutação de grupo grava no
 * banco; falha de rede volta o estado anterior e avisa (toast).
 */
export function useTriagemGrupos(avaliacoes: TriagemAvaliacao[]) {
  const { toast } = useToast()
  const [grupos, setGrupos] = useState<TriagemGrupo[]>([])
  const [carregandoGrupos, setCarregandoGrupos] = useState(true)

  const gruposRef = useRef<TriagemGrupo[]>([])
  gruposRef.current = grupos

  /** espelho das posições atuais para o reordenar (leitura sem re-render). */
  const posicoesRef = useRef<TriagemPosicao[]>([])

  const avisarFalha = useCallback(() => {
    toast({
      title: 'Não foi possível salvar o grupo',
      description: 'Verifique a conexão e tente novamente.',
      variant: 'destructive',
    })
  }, [toast])

  const recarregar = useCallback(async () => {
    try {
      const salvos = await carregarGruposTriagem()
      setGrupos(salvos)
    } catch (e) {
      console.error('Falha ao carregar grupos da triagem', e)
      setGrupos([])
    } finally {
      setCarregandoGrupos(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  /** posições da grade = grupos salvos + cards soltos (na ordem recebida). */
  const posicoes = useMemo<TriagemPosicao[]>(() => {
    const p = montarPosicoes(avaliacoes, grupos)
    posicoesRef.current = p
    return p
  }, [avaliacoes, grupos])

  /**
   * Aplica mutação com rollback em erro de rede: estado volta ao anterior e
   * o usuário é avisado. Diferenças são persistidas por `persistirDiferencas`
   * (salva novos/alterados, exclui removidos) e ids tmp_* são trocados pelos
   * reais do banco no estado.
   */
  const aplicarGrupos = useCallback(
    async (fn: (atuais: TriagemGrupo[]) => TriagemGrupo[]) => {
      const anteriores = gruposRef.current
      const rascunho = fn(anteriores)
      setGrupos(rascunho)
      try {
        const novos = await persistirDiferencas(anteriores, rascunho)
        setGrupos(novos)
      } catch (e) {
        console.error('Falha ao salvar grupos da triagem', e)
        setGrupos(anteriores)
        avisarFalha()
      }
    },
    [avisarFalha],
  )

  // ── operações expostas à grade ────────────────────────────────────────────

  /** arrastado sobre alvo: alvo solto → cria grupo; alvo em grupo → entra. */
  const agrupar = useCallback(
    (arrastado: string, alvo: string) => {
      if (arrastado === alvo) return
      const gs = gruposRef.current
      const gAlvo = gs.find((g) => g.membros.includes(alvo))
      const gArr = gs.find((g) => g.membros.includes(arrastado))
      if (gAlvo && gAlvo.id === (gArr ? gArr.id : '')) return
      void aplicarGrupos((atuais) => {
        const grupoFinal = gAlvo
          ? adicionarAoGrupo(gAlvo, arrastado)
          : criarGrupoDePar(alvo, arrastado)
        // remove o arrastado do grupo dele (se havia) e o grupo tocado da lista
        const semArrastado = atuais
          .map((g) => (g.membros.includes(arrastado) ? removerMembro(g, arrastado) : g))
          .filter((g): g is TriagemGrupo => g !== null)
        const semAlvo = semArrastado.filter((g) => g.id !== (gAlvo ? gAlvo.id : grupoFinal.id))
        // o grupo tocado assume o fim da grade (ordem nova é persistida)
        return [...semAlvo, grupoFinal]
      })
    },
    [aplicarGrupos],
  )

  /** decide entre agrupar / reordenar a partir da chave e da zona do alvo. */
  const soltar = useCallback(
    (arrastadoKey: string, alvoKey: string | null, zona: ZonaSoltar) => {
      const decisao = interpretarSoltar(posicoesRef.current, gruposRef.current, arrastadoKey, alvoKey, zona)
      if (!decisao) return
      if (decisao.acao === 'agrupar') agrupar(decisao.produtoId, decisao.alvoProdutoId)
      else reordenar(decisao.de, decisao.para)
    },
    // reordenar é estável (sem dependências) e declarado adiante
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agrupar],
  )

  const trazerFrente = useCallback(
    (grupoId: string, produtoId: string) => {
      void aplicarGrupos((atuais) =>
        atuais.map((g) => (g.id === grupoId ? trazerParaFrente(g, produtoId) : g)),
      )
    },
    [aplicarGrupos],
  )

  const girar = useCallback(
    (grupoId: string, dir: boolean) => {
      void aplicarGrupos((atuais) => atuais.map((g) => (g.id === grupoId ? girarPilha(g, dir) : g)))
    },
    [aplicarGrupos],
  )

  /** tira o card da frente do grupo; com 1 membro restante vira solto. */
  const desagruparUm = useCallback(
    (grupoId: string) => {
      void aplicarGrupos((atuais) =>
        atuais.flatMap((g) => {
          if (g.id !== grupoId) return [g]
          const r = desagruparFrente(g)
          return r.grupo ? [r.grupo] : []
        }),
      )
    },
    [aplicarGrupos],
  )

  /** desfaz o grupo inteiro — todos voltam a soltos na ordem original. */
  const desagruparTodos = useCallback(
    (grupoId: string) => {
      void aplicarGrupos((atuais) => atuais.filter((g) => g.id !== grupoId))
    },
    [aplicarGrupos],
  )

  const renomearGrupo = useCallback(
    (grupoId: string, titulo: string) => {
      void aplicarGrupos((atuais) => atuais.map((g) => (g.id === grupoId ? { ...g, titulo } : g)))
    },
    [aplicarGrupos],
  )

  /** reordena a grade; grupo se move como bloco (só a ordem dos grupos persiste). */
  const reordenar = useCallback((de: number, para: number) => {
    const atuais = gruposRef.current
    const novas = moverPosicao(posicoesRef.current, de, para)
    if (novas === posicoesRef.current) return
    setGrupos(() => {
      const ids = novas.flatMap((p) => (p.tipo === 'grupo' ? [p.grupoId] : []))
      const mapa = new Map(atuais.map((g) => [g.id, g]))
      return ids.map((id) => mapa.get(id)).filter((g): g is TriagemGrupo => g !== undefined)
    })
    void (async () => {
      try {
        const ids = novas.flatMap((p) => (p.tipo === 'grupo' ? [p.grupoId] : []))
        await Promise.all(
          ids.map((id, i) => {
            const g = atuais.find((x) => x.id === id)
            if (!g) return Promise.resolve()
            return salvarGrupoTriagem({ id, titulo: g.titulo, ordem: i + 1, membros: g.membros })
          }),
        )
      } catch (e) {
        console.error('Falha ao salvar a ordem dos grupos', e)
        avisarFalha()
      }
    })()
  }, [avisarFalha])

  return {
    grupos,
    posicoes,
    carregandoGrupos,
    agrupar,
    soltar,
    trazerFrente,
    girar,
    desagruparUm,
    desagruparTodos,
    renomearGrupo,
    reordenar,
    recarregarGrupos: recarregar,
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function removerMembro(g: TriagemGrupo, id: string): TriagemGrupo | null {
  const membros = g.membros.filter((m) => m !== id)
  return membros.length > 0 ? { ...g, membros } : null
}

/**
 * Persiste a diferença entre o estado anterior e o novo: salva grupos novos
 * ou alterados (membros/título/ordem), exclui os removidos; devolve o estado
 * com os ids REAIS do banco no lugar dos temporários (tmp_* → id gravado),
 * preservando a ordem — o grupo criado permanece na posição em que a UI o
 * colocou.
 */
async function persistirDiferencas(
  anteriores: TriagemGrupo[],
  novos: TriagemGrupo[],
): Promise<TriagemGrupo[]> {
  const mapaAntes = new Map(anteriores.map((g) => [g.id, g]))
  const fila: Array<{ id: string; input: Parameters<typeof salvarGrupoTriagem>[0] }> = []
  for (let i = 0; i < novos.length; i++) {
    const g = novos[i]
    if (g.membros.length < 2) continue // solto/degradado: sem registro
    const antes = mapaAntes.get(g.id)
    const mudou =
      !antes ||
      antes.membros.join('|') !== g.membros.join('|') ||
      (antes.titulo || '') !== (g.titulo || '')
    if (!mudou) continue
    fila.push({ id: g.id, input: { id: g.id, titulo: g.titulo, ordem: i + 1, membros: g.membros } })
  }
  const excluidos = anteriores.filter((g) => !novos.some((n) => n.id === g.id))
  if (fila.length === 0 && excluidos.length === 0) return novos

  const resultados = await Promise.all(fila.map((f) => salvarGrupoTriagem(f.input)))
  await Promise.all(excluidos.map((g) => excluirGrupoTriagem(g.id)))

  // troca tmp_ pelos ids reais (a ordem do save é a ordem da fila = ordem nova)
  const reais = resultados.filter((r): r is NonNullable<typeof r> => Boolean(r && r.id))
  const troca = new Map<string, string>()
  fila.forEach((f, i) => {
    const real = reais[i]
    if (real && f.id !== real.id) troca.set(f.id, real.id)
  })
  if (troca.size === 0) return novos
  return novos.map((g) => {
    const real = troca.get(g.id)
    return real ? { ...g, id: real } : g
  })
}
