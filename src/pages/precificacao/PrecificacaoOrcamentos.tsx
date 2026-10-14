import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText,
  Plus,
  Search,
  Filter,
  Calendar,
  User,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  MoreVertical,
  Trash2,
  Edit,
  Eye,
  Share2,
  Printer,
  Sparkles,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { orcamentosService } from '@/services/orcamentos'
import { OrcamentoRecord, StatusOrcamento } from '@/types/orcamento'
import {
  formatarMoedaBR,
  normalizarCanaisExpandidos,
  normalizarOrcamentoRecord,
} from '@/lib/precificacao/orcamentoCalculo'
import { imprimirOuBaixarOrcamentoPDF } from '@/lib/precificacao/orcamentoPdf'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'

const STATUS_CONFIG: Record<StatusOrcamento, { label: string; cor: string; icon: any }> = {
  rascunho: { label: 'Rascunho', cor: 'bg-slate-100 text-slate-700 border-slate-300', icon: Clock },
  enviado: { label: 'Enviado', cor: 'bg-blue-100 text-blue-700 border-blue-300', icon: Send },
  aceito: {
    label: 'Aceito',
    cor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: CheckCircle2,
  },
  recusado: { label: 'Recusado', cor: 'bg-rose-100 text-rose-800 border-rose-300', icon: XCircle },
}

export default function PrecificacaoOrcamentos() {
  const [loading, setLoading] = useState(true)
  const [orcamentos, setOrcamentos] = useState<OrcamentoRecord[]>([])
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<string>('todos')

  const carregarOrcamentos = async () => {
    try {
      setLoading(true)
      const data = await orcamentosService.listOrcamentos()
      setOrcamentos(data)
    } catch (err: any) {
      console.warn('Erro ao carregar orçamentos:', err)
      toast({
        title: 'Erro ao listar orçamentos',
        description: err.message || 'Verifique sua conexão.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarOrcamentos()
  }, [])

  const handleExcluir = async (id: string, codigo: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o orçamento ${codigo}?`)) return

    try {
      await orcamentosService.deleteOrcamento(id)
      setOrcamentos((prev) => prev.filter((o) => o.id !== id))
      toast({
        title: 'Orçamento excluído',
        description: `O orçamento ${codigo} foi removido com sucesso.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err.message || 'Não foi possível remover o orçamento.',
        variant: 'destructive',
      })
    }
  }

  const handleAlterarStatus = async (id: string, novoStatus: StatusOrcamento) => {
    try {
      await orcamentosService.updateOrcamento(id, { status: novoStatus })
      setOrcamentos((prev) => prev.map((o) => (o.id === id ? { ...o, status: novoStatus } : o)))
      toast({
        title: 'Status atualizado',
        description: `Orçamento marcado como ${STATUS_CONFIG[novoStatus].label}.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao mudar status',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const orcamentosFiltrados = useMemo(() => {
    return orcamentos.filter((orc) => {
      const matchBusca =
        !busca.trim() ||
        orc.codigo.toLowerCase().includes(busca.toLowerCase()) ||
        orc.cliente_nome.toLowerCase().includes(busca.toLowerCase()) ||
        (orc.titulo && orc.titulo.toLowerCase().includes(busca.toLowerCase())) ||
        (orc.tema_nome && orc.tema_nome.toLowerCase().includes(busca.toLowerCase()))

      const matchStatus = statusFiltro === 'todos' || orc.status === statusFiltro

      return matchBusca && matchStatus
    })
  }, [orcamentos, busca, statusFiltro])

  const formatarData = (dt?: string) => {
    if (!dt) return '-'
    const [ano, mes, dia] = dt.split('T')[0].split('-')
    return `${dia}/${mes}/${ano}`
  }

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Orçamentos & Cotações"
        subtitulo="Cotações multicanais para clientes com opções de WhatsApp, PDF e Link público"
        acoes={
          <Button asChild className="bg-primary hover:bg-primary/90 text-white font-bold shadow-xs">
            <Link to="/precificacao/orcamentos/novo">
              <Plus className="mr-2 h-4 w-4" />
              Novo Orçamento
            </Link>
          </Button>
        }
      />

      {/* Barra de Filtro e Busca */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, cliente ou tema..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(['todos', 'rascunho', 'enviado', 'aceito', 'recusado'] as const).map((st) => {
            const isSelected = statusFiltro === st
            return (
              <Button
                key={st}
                size="sm"
                variant={isSelected ? 'default' : 'outline'}
                onClick={() => setStatusFiltro(st)}
                className={`text-xs font-semibold capitalize ${
                  isSelected ? 'bg-primary text-white hover:bg-primary/90' : 'border-border'
                }`}
              >
                {st === 'todos' ? 'Todos' : STATUS_CONFIG[st as StatusOrcamento]?.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Lista de Orçamentos */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : orcamentosFiltrados.length === 0 ? (
        <Card className="shadow-xs border-border/80">
          <CardContent className="py-12 text-center text-muted-foreground space-y-3">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/30" />
            <div>
              <p className="font-bold text-base text-foreground">Nenhum orçamento encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">
                {busca || statusFiltro !== 'todos'
                  ? 'Nenhum registro coincide com os filtros aplicados.'
                  : 'Comece criando a primeira proposta comercial para um cliente.'}
              </p>
            </div>
            <Button asChild className="bg-primary text-white font-bold" size="sm">
              <Link to="/precificacao/orcamentos/novo">
                <Plus className="mr-1.5 h-4 w-4" />
                Criar Orçamento
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {orcamentosFiltrados.map((orc) => {
            const stInfo = STATUS_CONFIG[orc.status] || STATUS_CONFIG.rascunho
            const StIcon = stInfo.icon
            const orcNormalizado = normalizarOrcamentoRecord(orc)
            const canais = normalizarCanaisExpandidos(orcNormalizado.expand?.canais_comparados)
            const totais =
              orcNormalizado.totais_por_canal &&
              typeof orcNormalizado.totais_por_canal === 'object' &&
              !Array.isArray(orcNormalizado.totais_por_canal)
                ? orcNormalizado.totais_por_canal
                : {}

            return (
              <Card
                key={orc.id}
                className="hover:border-primary/40 transition-colors shadow-xs border-border/80 overflow-hidden"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Bloco Esquerdo: Identificação e Cliente */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200">
                          {orc.codigo}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold flex items-center gap-1 ${stInfo.cor}`}
                        >
                          <StIcon className="w-3 h-3" />
                          {stInfo.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Emissão: {formatarData(orc.data_orcamento)}
                        </span>
                        {orc.validade_data && (
                          <span className="text-xs font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                            Válido até: {formatarData(orc.validade_data)}
                          </span>
                        )}
                      </div>

                      <div className="pt-0.5">
                        <h3 className="font-bold text-base text-foreground truncate">
                          {orc.titulo || `Cotação para ${orc.cliente_nome}`}
                        </h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span className="font-medium text-foreground">{orc.cliente_nome}</span>
                          {orc.cliente_whatsapp && <span>• {orc.cliente_whatsapp}</span>}
                          {orc.tema_nome && (
                            <span className="text-primary font-semibold">
                              • Tema: {orc.tema_nome} {orc.cor ? `(${orc.cor})` : ''}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Bloco Central: Canais & Totais */}
                    <div className="flex flex-wrap gap-2 lg:gap-4 items-center">
                      {canais.map((canal) => {
                        const tot = totais[canal.id]
                        return (
                          <div
                            key={canal.id}
                            className="bg-muted/40 p-2.5 rounded-xl border border-border/60 text-right min-w-[120px]"
                          >
                            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block truncate">
                              {canal.nome}
                            </span>
                            <span className="text-sm font-black text-primary">
                              {formatarMoedaBR(tot?.total_geral || 0)}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Bloco Direito: Ações */}
                    <div className="flex items-center gap-2 self-end lg:self-center">
                      <Button asChild size="sm" variant="outline" className="border-border">
                        <Link to={`/precificacao/orcamentos/${orc.id}`}>
                          <Eye className="w-4 h-4 mr-1.5" />
                          Ver & Enviar
                        </Link>
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem asChild>
                            <Link to={`/precificacao/orcamentos/${orc.id}/editar`}>
                              <Edit className="w-3.5 h-3.5 mr-2" />
                              Editar Orçamento
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => imprimirOuBaixarOrcamentoPDF(orc)}>
                            <Printer className="w-3.5 h-3.5 mr-2" />
                            Imprimir / PDF
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase">
                            Mudar Status
                          </div>
                          {(['rascunho', 'enviado', 'aceito', 'recusado'] as const).map((st) => (
                            <DropdownMenuItem
                              key={st}
                              disabled={orc.status === st}
                              onClick={() => handleAlterarStatus(orc.id, st)}
                            >
                              <span className="capitalize">{STATUS_CONFIG[st].label}</span>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => handleExcluir(orc.id, orc.codigo)}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
