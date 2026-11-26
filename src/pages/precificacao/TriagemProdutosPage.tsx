import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import {
  FILTRO_ETAPA_TODOS,
  TriagemCarregando,
  TriagemFiltrosBar,
  TriagemLegenda,
  type FiltrosTriagem,
} from '@/components/triagem/TriagemCards'
import { TriagemGradeAgrupada } from '@/components/triagem/TriagemGradeAgrupada'
import { TriagemDetalheDialog } from '@/components/triagem/TriagemDetalheDialog'
import { carregarFontesTriagem } from '@/services/triagem'
import {
  avaliarProdutoTriagem,
  ETAPAS_TRIAGEM,
  ordenarPorAtraso,
  resumirTriagem,
  type TriagemAvaliacao,
} from '@/lib/triagemModelo'
import { urlImagemProdutoTriagem } from '@/lib/triagemImagem'
import { useTriagemGrupos } from '@/components/triagem/useTriagemGrupos'
import { useToast } from '@/hooks/use-toast'

/**
 * Triagem de Produtos — painel visual que mostra, por produto/SKU, em qual
 * das 7 etapas do sistema o produto está. O usuário esquece onde parou quando
 * interrompe o cadastro; esta tela responde isso.
 *
 * Agrupamento manual (0.0.317): arrastar um card sobre outro agrupa; grupo é
 * pilha de cards com título editável, navegação ‹ › e desagrupar. A avaliação
 * das 7 etapas, filtros, resumo e "Retomar daqui" NÃO mudam — o agrupamento é
 * camada visual por cima. Estado dos grupos persiste em `prec_triagem_grupos`
 * (migração 0153): ao recarregar, grupos, títulos, ordem e membros voltam.
 */
export default function TriagemProdutosPage() {
  const [avaliacoes, setAvaliacoes] = useState<TriagemAvaliacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionado, setSelecionado] = useState<TriagemAvaliacao | null>(null)
  const [filtros, setFiltros] = useState<FiltrosTriagem>({
    etapa: FILTRO_ETAPA_TODOS,
    categoria: 'todas',
    tipo: 'todos',
    busca: '',
  })
  const { toast } = useToast()

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      try {
        const { produtos, fontes } = await carregarFontesTriagem()
        const lista = produtos.map((p) => avaliarProdutoTriagem(p, fontes))
        setAvaliacoes(ordenarPorAtraso(lista))
      } catch (e) {
        console.error('Falha ao carregar triagem', e)
        toast({
          title: 'Erro ao carregar a triagem',
          description: 'Verifique a conexão e tente novamente.',
          variant: 'destructive',
        })
      } finally {
        setCarregando(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    void carregar()
  }, [carregar])

  const avaliacaoPorId = useMemo(
    () => new Map(avaliacoes.map((a) => [a.produto.id, a])),
    [avaliacoes],
  )

  // Filtros: enxugam a lista de avaliações que alimenta a grade. Com o filtro
  // ativo, o hook recebe A LISTA FILTRADA + os ids visíveis: a grade (posições
  // e grupos) mostra só o que passa no filtro; o estado dos grupos e o banco
  // permanecem completos (0.0.322 — ver lib/triagemGrupos.ts).
  const avaliacoesFiltradas = useMemo(() => {
    const busca = filtros.busca.trim().toLowerCase()
    return avaliacoes.filter((av) => {
      if (filtros.categoria !== 'todas' && (av.produto.categoria || '') !== filtros.categoria)
        return false
      if (filtros.tipo !== 'todos' && av.produto.tipo !== filtros.tipo) return false
      if (busca && !`${av.produto.nome} ${av.produto.sku}`.toLowerCase().includes(busca))
        return false
      if (filtros.etapa === FILTRO_ETAPA_TODOS) return true
      if (filtros.etapa === 'integrados') return av.integrado
      if (filtros.etapa === 'sem_cenario') return av.etapas.cenario.status === 'vermelho'
      const i = ETAPAS_TRIAGEM.indexOf(filtros.etapa as never)
      return i >= 0 && av.parouNaEtapaNumero === i + 1
    })
  }, [avaliacoes, filtros])

  const idsVisiveis = useMemo(
    () => avaliacoesFiltradas.map((a) => a.produto.id),
    [avaliacoesFiltradas],
  )

  const grupos = useTriagemGrupos(avaliacoesFiltradas, idsVisiveis)

  // decisão do soltar (agrupar/entrar em grupo/reordenar) — o hook interpreta
  // sobre as posições PROJETADAS e os grupos visíveis, então o arraste sob
  // filtro usa a frente exibida (e não a real) como alvo.
  const aoSoltar = grupos.soltar

  const categorias = useMemo(
    () => [...new Set(avaliacoes.map((a) => a.produto.categoria).filter(Boolean))] as string[],
    [avaliacoes],
  )
  const tipos = useMemo(() => [...new Set(avaliacoes.map((a) => a.produto.tipo))], [avaliacoes])

  const resumo = useMemo(() => resumirTriagem(avaliacoes), [avaliacoes])

  const textoResumo = resumo.total
    ? `${resumo.integrados} de ${resumo.total} produtos 100% integrados` +
      (resumo.pararamEtapa
        ? ` · ${resumo.pararamEtapa.quantidade} pararam na etapa ${resumo.pararamEtapa.nome}`
        : '')
    : ''
  const linhaSemCenarios = resumo.semNenhumCenario
    ? `${resumo.semNenhumCenario} produto(s) ainda sem nenhum cenário de preço`
    : ''

  return (
    <div className="container mx-auto space-y-4 p-4">
      <PageHeader
        title="Triagem de Produtos"
        description={
          textoResumo || 'Painel de integração das 7 etapas por produto/SKU (somente leitura)'
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void carregar()}
          disabled={carregando}
          aria-label="Recarregar triagem"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          Recarregar
        </Button>
      </PageHeader>

      {linhaSemCenarios && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {linhaSemCenarios}
        </p>
      )}

      <TriagemFiltrosBar
        filtros={filtros}
        onChange={setFiltros}
        categorias={categorias}
        tipos={tipos}
      />

      <TriagemLegenda />

      {carregando ? (
        <TriagemCarregando />
      ) : (
        <TriagemGradeAgrupada
          posicoes={grupos.posicoes}
          avaliacaoPorId={avaliacaoPorId}
          grupos={grupos.gruposVisiveis}
          onAbrir={setSelecionado}
          onTitulo={grupos.renomearGrupo}
          onTrazerParaFrente={grupos.trazerFrente}
          onNavegar={grupos.girar}
          onDesagruparFrente={grupos.desagruparUm}
          onDesagruparTudo={grupos.desagruparTodos}
          aoSoltar={aoSoltar}
          getUrlImagem={(p) => urlImagemProdutoTriagem(p)}
        />
      )}

      <TriagemDetalheDialog
        avaliacao={selecionado}
        onClose={() => setSelecionado(null)}
        getUrlImagem={urlImagemProdutoTriagem}
      />
    </div>
  )
}
