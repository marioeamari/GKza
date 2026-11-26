import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  adicionarAoGrupo,
  criarGrupoDePar,
  desagruparFrente,
  interpretarSoltar,
  montarPosicoes,
  moverPosicao,
  projetarGruposVisiveis,
  reordenarGrupos,
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
 *
 * Filtros (0.0.322): o hook recebe os IDS VISÍVEIS (resultado dos filtros da
 * página). A grade (`posicoes`) é montada SÓ com o que está visível — grupo
 * cujos membros não batem com o filtro some da grade MAS NÃO sai do estado
 * nem do banco (volta quando o filtro é limpo). Toda mutação usa a lista
 * visível:
 * - desagrupar/girar/trazer-frente só tocam membros visíveis (frente exibida =
 *   primeiro membro VISÍVEL); membro oculto permanece no grupo;
 * - agrupar mantém o grupo tocado na MESMA posição da grade visível (nunca no
 *   fim — o que esconderia os grupos depois dele sob filtro);
 * - reordenar usa `reordenarGrupos`, que preserva os grupos ocultos com a
 *   ordem relativa que já tinham.
 * Persistência gravando só o que mudou (`persistirDiferencas`): o filtro é
 * projeção — nada de membro oculto é apagado do banco.
 */
export function useTriagemGrupos(
  avaliacoes: TriagemAvaliacao[],
  idsVisiveis?: string[],
): TriagemGruposApi {
  const { toast } = useToast()
  const [grupos, setGrupos] = useState<TriagemGrupo[]>([])
  const [carregandoGrupos, setCarregandoGrupos] = useState(true)

  const gruposRef = useRef<TriagemGrupo[]>([])
  gruposRef.current = grupos

  /** ids visíveis em ref (leitura sem re-render nas mutações de arrasto). */
  const visiveisRef = useRef<string[] | undefined>(idsVisiveis)
  visiveisRef.current = idsVisiveis

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

  /**
   * posições da grade = grupos salvos + cards soltos, SÓ com o visível:
   * a lista de avaliações vem já filtrada pela página; os grupos entram
   * PROJETADOS (`projetarGruposVisiveis`) para que a frente de cada grupo sob
   * filtro seja o primeiro membro visível — sem tocar no estado real.
   */
  const posicoes = useMemo<TriagemPosicao[]>(() => {
    const p = montarPosicoes(avaliacoes, projetarGruposVisiveis(grupos, idsVisiveis))
    posicoesRef.current = p
    return p
  }, [avaliacoes, grupos, idsVisiveis])

  /** grupos exibíveis (projeção): a grade renderiza a partir destes. */
  const gruposVisiveis = useMemo(
    () => projetarGruposVisiveis(grupos, idsVisiveis),
    [grupos, idsVisiveis],
  )

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
      // estado otimista já normalizado: grupo com <2 membros não existe como
      // grupo (vira solto) — a projeção do filtro NUNCA dissolve grupo real.
      const rascunhoNormalizado = idsVisiveis
        ? rascunho.filter((g) => g.membros.length >= 2)
        : rascunho
      setGrupos(rascunhoNormalizado)
      try {
        const novos = await persistirDiferencas(anteriores, rascunhoNormalizado)
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
        // o grupo tocado assume a MESMA posição que o alvo tinha na grade
        // visível (soltos não geram registro, então a "posição" é contada só
        // entre grupos): sob filtro, grupos depois dele não pulam para o fim.
        const idsVisiveisAtuais = visiveisRef.current
        if (!idsVisiveisAtuais) return [...semAlvo, grupoFinal]
        const visiveis = new Set(idsVisiveisAtuais)
        const posAlvoNaGrade = semAlvo
          .filter((g) => g.membros.some((m) => visiveis.has(m)))
          .findIndex((g) => g.id === (gAlvo ? gAlvo.id : ''))
        if (posAlvoNaGrade < 0) return [...semAlvo, grupoFinal]
        const out = [...semAlvo]
        out.splice(posAlvoNaGrade, 0, grupoFinal)
        return out
      })
    },
    [aplicarGrupos],
  )

  /** decide entre agrupar / reordenar a partir da chave e da zona do alvo. */
  const soltar = useCallback(
    (arrastadoKey: string, alvoKey: string | null, zona: ZonaSoltar) => {
      const decisao = interpretarSoltar(
        posicoesRef.current,
        projetarGruposVisiveis(gruposRef.current, visiveisRef.current),
        arrastadoKey,
        alvoKey,
        zona,
      )
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
        atuais.map((g) =>
          g.id === grupoId ? trazerParaFrente(g, produtoId, visiveisRef.current) : g,
        ),
      )
    },
    [aplicarGrupos],
  )

  const girar = useCallback(
    (grupoId: string, dir: boolean) => {
      void aplicarGrupos((atuais) =>
        atuais.map((g) => (g.id === grupoId ? girarPilha(g, dir, visiveisRef.current) : g)),
      )
    },
    [aplicarGrupos],
  )

  /** tira o card da frente VISÍVEL do grupo; com 1 membro restante vira solto. */
  const desagruparUm = useCallback(
    (grupoId: string) => {
      void aplicarGrupos((atuais) =>
        atuais.flatMap((g) => {
          if (g.id !== grupoId) return [g]
          const r = desagruparFrente(g, visiveisRef.current)
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

  /**
   * reordena a grade; grupo se move como bloco (só a ordem dos grupos
   * persiste). Sob filtro, usa `reordenarGrupos`: grupos ocultos preservam a
   * ordem relativa em vez de serem descartados.
   */
  const reordenar = useCallback(
    (de: number, para: number) => {
      const atuais = gruposRef.current
      const novas = moverPosicao(posicoesRef.current, de, para)
      if (novas === posicoesRef.current) return
      const ids = novas.flatMap((p) => (p.tipo === 'grupo' ? [p.grupoId] : []))
      const novaOrdem = reordenarGrupos(atuais, ids)
      setGrupos(novaOrdem)
      void (async () => {
        try {
          // Persiste a ordem de TODOS os grupos na ordem do estado: visíveis
          // primeiro (reordenados), ocultos depois (ordem relativa mantida).
          // Gravar só os visíveis deixaria ordens antigas menores no banco e
          // o recarregamento embaralharia a ordem — estado e banco têm que
          // refletir a MESMA sequência.
          await Promise.all(
            novaOrdem.map((g, i) =>
              salvarGrupoTriagem({ id: g.id, titulo: g.titulo, ordem: i + 1, membros: g.membros }),
            ),
          )
        } catch (e) {
          console.error('Falha ao salvar a ordem dos grupos', e)
          avisarFalha()
        }
      })()
    },
    [avisarFalha],
  )

  return {
    grupos,
    gruposVisiveis,
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

export interface TriagemGruposApi {
  grupos: TriagemGrupo[]
  gruposVisiveis: TriagemGrupo[]
  posicoes: TriagemPosicao[]
  carregandoGrupos: boolean
  agrupar: (arrastado: string, alvo: string) => void
  soltar: (arrastadoKey: string, alvoKey: string | null, zona: ZonaSoltar) => void
  trazerFrente: (grupoId: string, produtoId: string) => void
  girar: (grupoId: string, dir: boolean) => void
  desagruparUm: (grupoId: string) => void
  desagruparTodos: (grupoId: string) => void
  renomearGrupo: (grupoId: string, titulo: string) => void
  reordenar: (de: number, para: number) => void
  recarregarGrupos: () => Promise<void>
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
  // Regra: grupo vale como grupo com 2+ membros REAIS. Mutação sob filtro que
  // deixa um grupo com <2 membros dissolve o grupo (o registro é excluído e o
  // membro restante vira card solto) — sem isso o registro ficava no banco
  // com os membros antigos e o grupo "voltava" ao recarregar.
  const validos = novos.filter((g) => g.membros.length >= 2)
  const mapaAntes = new Map(anteriores.map((g) => [g.id, g]))
  const fila: Array<{ id: string; input: Parameters<typeof salvarGrupoTriagem>[0] }> = []
  for (let i = 0; i < validos.length; i++) {
    const g = validos[i]
    const antes = mapaAntes.get(g.id)
    const mudou =
      !antes ||
      antes.membros.join('|') !== g.membros.join('|') ||
      (antes.titulo || '') !== (g.titulo || '')
    if (!mudou) continue
    fila.push({ id: g.id, input: { id: g.id, titulo: g.titulo, ordem: i + 1, membros: g.membros } })
  }
  const excluidos = anteriores.filter((g) => !validos.some((n) => n.id === g.id))
  if (fila.length === 0 && excluidos.length === 0) return validos

  const resultados = await Promise.all(fila.map((f) => salvarGrupoTriagem(f.input)))
  await Promise.all(excluidos.map((g) => excluirGrupoTriagem(g.id)))

  // troca tmp_ pelos ids reais (a ordem do save é a ordem da fila = ordem nova)
  const reais = resultados.filter((r): r is NonNullable<typeof r> => Boolean(r && r.id))
  const troca = new Map<string, string>()
  fila.forEach((f, i) => {
    const real = reais[i]
    if (real && f.id !== real.id) troca.set(f.id, real.id)
  })
  if (troca.size === 0) return validos
  return validos.map((g) => {
    const real = troca.get(g.id)
    return real ? { ...g, id: real } : g
  })
}
