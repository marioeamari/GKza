import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, RefreshCw, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/PageHeader'
import { TriagemCards } from '@/components/triagem/TriagemCards'
import { carregarFontesTriagem } from '@/services/triagem'
import {
  ETAPAS_TRIAGEM,
  avaliarProdutoTriagem,
  nomeEtapaTriagem,
  ordenarPorAtraso,
  resumirTriagem,
  type TriagemAvaliacao,
  type TriagemEtapaChave,
} from '@/lib/triagemModelo'

type FiltroEtapa = TriagemEtapaChave | 'todas'
type FiltroTipo = 'todos' | 'revenda' | 'fabricacao_propria' | 'kit' | 'combo'

export default function TriagemProdutosPage() {
  const navigate = useNavigate()
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [avaliacoes, setAvaliacoes] = useState<TriagemAvaliacao[]>([])
  const [categorias, setCategorias] = useState<string[]>([])

  const [filtroEtapa, setFiltroEtapa] = useState<FiltroEtapa>('todas')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
  const [busca, setBusca] = useState('')

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const { produtos, fontes } = await carregarFontesTriagem()
      const cats = new Set<string>()
      const avs = produtos.map((p) => {
        if (p.categoria) cats.add(p.categoria)
        return avaliarProdutoTriagem(p, fontes)
      })
      setCategorias([...cats].sort((a, b) => a.localeCompare(b, 'pt-BR')))
      setAvaliacoes(ordenarPorAtraso(avs))
    } catch (e) {
      console.error(e)
      setErro('Não foi possível carregar os produtos. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const resumo = useMemo(() => resumirTriagem(avaliacoes), [avaliacoes])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return avaliacoes.filter((a) => {
      const p = a.produto
      // Filtro "por etapa onde parou": manter só quem parou nela
      if (filtroEtapa !== 'todas' && ETAPAS_TRIAGEM[a.parouNaEtapaNumero - 1] !== filtroEtapa) {
        return false
      }
      if (filtroCategoria !== 'todas' && (p.categoria || '') !== filtroCategoria) return false
      if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) return false
      if (termo) {
        const alvo = `${p.sku || ''} ${p.nome || ''}`.toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      return true
    })
  }, [avaliacoes, filtroEtapa, filtroCategoria, filtroTipo, busca])

  return (
    <div className="min-h-dvh bg-[#FAF9F7]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <PageHeader
          title="Triagem de Produtos"
          description="Pipeline visual por produto/SKU — em qual etapa do ciclo de vida cada produto está."
        />

        {/* Barra de resumo */}
        <Card className="mb-4 border-none shadow-sm">
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
            {carregando ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </span>
            ) : erro ? (
              <>
                <span className="text-sm text-red-600">{erro}</span>
                <Button size="sm" variant="outline" onClick={carregar}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Recarregar
                </Button>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">
                  <span className="text-[#DF5830]">{resumo.integrados}</span> de {resumo.total}{' '}
                  produtos 100% integrados
                </span>
                {resumo.pararamEtapa && (
                  <span className="text-sm text-muted-foreground">
                    · {resumo.pararamEtapa.quantidade} pararam na etapa{' '}
                    <strong className="font-medium">{resumo.pararamEtapa.nome}</strong>
                  </span>
                )}
                <span className="text-sm text-muted-foreground">
                  · {resumo.semNenhumCenario} sem nenhum cenário
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={carregar}
                    aria-label="Recarregar dados"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </span>
              </>
            )}
          </CardContent>
        </Card>

        {/* Filtros */}
        <Card className="mb-4 border-none shadow-sm">
          <CardContent className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por SKU ou nome…"
                aria-label="Buscar por SKU ou nome"
                className="pl-9 pr-8"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={filtroEtapa} onValueChange={(v) => setFiltroEtapa(v as FiltroEtapa)}>
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por etapa onde parou">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Etapa: todas</SelectItem>
                {ETAPAS_TRIAGEM.map((chave, i) => (
                  <SelectItem key={chave} value={chave}>
                    {i + 1}. {nomeEtapaTriagem(chave)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="w-[190px]" aria-label="Filtrar por categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Categoria: todas</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as FiltroTipo)}>
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Tipo: todos</SelectItem>
                <SelectItem value="revenda">Revenda</SelectItem>
                <SelectItem value="fabricacao_propria">Fabricação própria</SelectItem>
                <SelectItem value="kit">Kit</SelectItem>
                <SelectItem value="combo">Combo</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Grade de cards */}
        {carregando ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-44 animate-pulse border-none bg-muted/40 shadow-sm" />
            ))}
          </div>
        ) : filtradas.length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="text-4xl" aria-hidden>
                🗂️
              </span>
              <p className="text-lg font-medium">Nenhum produto encontrado</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {avaliacoes.length === 0
                  ? 'Cadastre seu primeiro produto comercial em Precificação ▾ Produtos para acompanhá-lo aqui em todas as etapas do ciclo de vida.'
                  : 'Nenhum produto atende aos filtros escolhidos. Ajuste a busca, a etapa, a categoria ou o tipo.'}
              </p>
              {avaliacoes.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setBusca('')
                    setFiltroEtapa('todas')
                    setFiltroCategoria('todas')
                    setFiltroTipo('todos')
                  }}
                >
                  Limpar filtros
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <TriagemCards avaliacoes={filtradas} onAbrirDetalhe={() => {}} />
        )}
      </div>
    </div>
  )
}
