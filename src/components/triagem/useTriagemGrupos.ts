import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  adicionarAoGrupo,
  criarGrupoDePar,
  desagruparFrente,
  montarPosicoes,
  moverPosicao,
  trazerParaFrente,
  girarPilha,
  type TriagemGrupo,
  type TriagemPosicao,
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

  /** aplica mutação com rollback em erro de rede (estado volta ao anterior). */
  const aplicarGrupos = useCallback(
    async (fn: (atuais: TriagemGrupo[]) => TriagemGrupo[]) => {
      const anteriores = gruposRef.current
      const novos = fn(anteriores)
      setGrupos(novos)
      try {
        await persistirDiferencas(anteriores, novos)
      } catch (e) {
        console.error('Falha ao salvar grupos da triagem', e)
        setGrupos(anteriores)
        toast({
          title: 'Não foi possível salvar o grupo',
          description: 'Verifique a conexão e tente novamente.',
          variant: 'destructive',
        })
      }
    },
    [toast],
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
        // o grupo tocado assume a posição do fim da grade (ordem nova é
        // persistida; cards soltos entre grupos não geram registro)
        return [...semAlvo, grupoFinal]
      })
    },
    [aplicarGrupos],
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
        toastRef.current?.('Não foi possível salvar a ordem dos grupos')
      }
    })()
  }, [])

  const toastRef = useRef<((msg: string) => void) | null>(null)
  useEffect(() => {
    toastRef.current = (msg: string) =>
      toast({
        title: msg,
        description: 'Verifique a conexão e tente novamente.',
        variant: 'destructive',
      })
  }, [toast])

  return {
    grupos,
    posicoes,
    carregandoGrupos,
    agrupar,
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
 * ou alterados (membros/título/ordem), exclui os removidos.
 */
async function persistirDiferencas(
  anteriores: TriagemGrupo[],
  novos: TriagemGrupo[],
): Promise<void> {
  const mapaAntes = new Map(anteriores.map((g, i) => [g.id, { g, i }]))
  const mapaDepois = new Map(novos.map((g, i) => [g.id, { g, i }]))

  const fila: Array<Promise<unknown>> = []
  for (const [id, { g, i }] of mapaDepois) {
    if (g.membros.length < 2) continue // solto/degradado: sem registro
    const antes = mapaAntes.get(id)
    const mudou =
      !antes ||
      antes.g.membros.join('|') !== g.membros.join('|') ||
      (antes.g.titulo || '') !== (g.titulo || '') ||
      antes.i !== i
    if (!mudou) continue
    fila.push(salvarGrupoTriagem({ id, titulo: g.titulo, ordem: i + 1, membros: g.membros }))
  }
  for (const [id] of mapaAntes) {
    if (!mapaDepois.has(id)) fila.push(excluirGrupoTriagem(id))
  }
  await Promise.all(fila)
}
