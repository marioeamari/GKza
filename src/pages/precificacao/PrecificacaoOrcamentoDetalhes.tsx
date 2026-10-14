import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  Edit,
  Trash2,
  Calendar,
  User,
  Clock,
  Sparkles,
  Store,
  Printer,
  Share2,
  CheckCircle2,
  Phone,
  FileText,
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
import { OrcamentoSaidasPanel } from '@/components/precificacao/OrcamentoSaidasPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'

const STATUS_CONFIG: Record<StatusOrcamento, { label: string; cor: string }> = {
  rascunho: { label: 'Rascunho', cor: 'bg-slate-100 text-slate-700 border-slate-300' },
  enviado: { label: 'Enviado', cor: 'bg-blue-100 text-blue-700 border-blue-300' },
  aceito: { label: 'Aceito', cor: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  recusado: { label: 'Recusado', cor: 'bg-rose-100 text-rose-800 border-rose-300' },
}

export default function PrecificacaoOrcamentoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [orcamento, setOrcamento] = useState<OrcamentoRecord | null>(null)

  const carregarOrcamento = async () => {
    if (!id) return
    try {
      setLoading(true)
      const data = await orcamentosService.getOrcamento(id)
      setOrcamento(data)
    } catch (err: any) {
      console.warn('Erro ao carregar orçamento:', err)
      toast({
        title: 'Erro ao abrir orçamento',
        description: err.message || 'Orçamento não encontrado.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarOrcamento()
  }, [id])

  const handleExcluir = async () => {
    if (!orcamento) return
    if (!window.confirm(`Tem certeza que deseja excluir o orçamento ${orcamento.codigo}?`)) return

    try {
      await orcamentosService.deleteOrcamento(orcamento.id)
      toast({
        title: 'Orçamento excluído',
        description: `O orçamento ${orcamento.codigo} foi removido com sucesso.`,
      })
      navigate('/precificacao/orcamentos')
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (!orcamento) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-base font-bold text-foreground">Orçamento não encontrado</p>
        <Button asChild variant="outline">
          <Link to="/precificacao/orcamentos">Voltar para a Lista</Link>
        </Button>
      </div>
    )
  }

  const orcamentoNormalizado = normalizarOrcamentoRecord(orcamento)
  const totais =
    orcamentoNormalizado.totais_por_canal &&
    typeof orcamentoNormalizado.totais_por_canal === 'object' &&
    !Array.isArray(orcamentoNormalizado.totais_por_canal)
      ? orcamentoNormalizado.totais_por_canal
      : {}
  const canais = normalizarCanaisExpandidos(orcamentoNormalizado.expand?.canais_comparados, totais)
  const itens = Array.isArray(orcamentoNormalizado.expand?.itens)
    ? orcamentoNormalizado.expand.itens
    : []
  const stInfo = STATUS_CONFIG[orcamentoNormalizado.status] || STATUS_CONFIG.rascunho

  const formatarData = (dt?: string) => {
    if (!dt) return '-'
    const parte = String(dt).split('T')[0]
    if (!parte) return '-'
    const [ano, mes, dia] = parte.split('-')
    if (!dia || !mes || !ano) return parte
    return `${dia}/${mes}/${ano}`
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
            <Link
              to="/precificacao/orcamentos"
              className="text-primary hover:underline flex items-center gap-1 font-bold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Orçamentos
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-mono">{orcamento.codigo}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-foreground">
              {orcamento.titulo || `Cotação ${orcamento.codigo}`}
            </h1>
            <Badge variant="outline" className={`text-xs font-bold ${stInfo.cor}`}>
              {stInfo.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cliente: <strong className="text-foreground">{orcamento.cliente_nome}</strong>
            {orcamento.cliente_whatsapp && ` • WhatsApp: ${orcamento.cliente_whatsapp}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/precificacao/orcamentos/${orcamento.id}/editar`}>
              <Edit className="w-3.5 h-3.5 mr-1.5" />
              Editar
            </Link>
          </Button>

          <Button
            size="sm"
            onClick={() => imprimirOuBaixarOrcamentoPDF(orcamento)}
            className="bg-primary hover:bg-primary/90 text-white font-bold shadow-xs"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Imprimir / PDF
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleExcluir}
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* PAINEL DAS 3 SAÍDAS (WhatsApp, PDF e Link) */}
      <OrcamentoSaidasPanel orcamento={orcamento} onAtualizar={(novo) => setOrcamento(novo)} />

      {/* METADADOS E ESPECIFICAÇÃO */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-xs border-border/80">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              Datas da Proposta
            </CardDescription>
            <CardTitle className="text-sm font-bold text-foreground">
              Emissão: {formatarData(orcamento.data_orcamento)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            {orcamento.validade_data && (
              <span className="text-orange-600 font-semibold">
                Validade: {formatarData(orcamento.validade_data)} ({orcamento.validade_dias || 7}{' '}
                dias)
              </span>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Especificação do Pedido
            </CardDescription>
            <CardTitle className="text-sm font-bold text-foreground">
              Tema: {orcamento.tema_nome || 'Livre / Múltiplos'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            {orcamento.cor ? `Cor: ${orcamento.cor.toUpperCase()}` : 'Cores variadas'}
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-primary" />
              Canais Analisados
            </CardDescription>
            <CardTitle className="text-sm font-bold text-foreground">
              {canais.length} {canais.length === 1 ? 'canal comparado' : 'canais comparados'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            {canais.length > 0
              ? canais
                  .map((c) => c?.nome || c?.id || 'Canal')
                  .filter(Boolean)
                  .join(', ')
              : 'Nenhum canal selecionado'}
          </CardContent>
        </Card>
      </div>

      {/* TABELA DE ITENS E TOTAIS COMPARADOS */}
      <Card className="shadow-xs border-border/80 overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-muted/20">
          <CardTitle className="text-base font-bold">Detalhamento dos Itens & Canais</CardTitle>
          <CardDescription className="text-xs">
            Subtotais por modelo e fretes individuais comparados lado a lado
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="py-3 px-4">Item / Modelo</th>
                <th className="py-3 px-3 text-center">Qtd</th>
                {canais.map((canal) => (
                  <th key={canal.id} className="py-3 px-4 text-right">
                    {canal?.nome || 'Canal'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {itens.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + Math.max(1, canais.length)}
                    className="py-6 text-center text-xs text-muted-foreground"
                  >
                    Nenhum item cadastrado neste orçamento.
                  </td>
                </tr>
              ) : (
                itens.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-muted/10">
                    <td className="py-3 px-4">
                      <span className="font-bold text-foreground">
                        {item.modelo_nome || 'Item sem nome'}
                      </span>
                      {item.modelo_codigo && (
                        <span className="text-xs text-muted-foreground ml-2 font-mono">
                          ({item.modelo_codigo})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center font-bold">{item.quantidade || 1}</td>
                    {canais.map((canal) => {
                      const precoUnit = item.precos_canais?.[canal.id]?.preco_unitario || 0
                      const subtotal = Math.round(precoUnit * (item.quantidade || 1) * 100) / 100
                      const frete = item.fretes_canais?.[canal.id]?.valor_frete || 0
                      return (
                        <td key={canal.id} className="py-3 px-4 text-right">
                          <div className="font-bold text-foreground">
                            {formatarMoedaBR(subtotal)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatarMoedaBR(precoUnit)}/un
                          </div>
                          {frete > 0 && (
                            <div className="text-[11px] font-semibold text-orange-600 mt-0.5">
                              + Frete: {formatarMoedaBR(frete)}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                <td colSpan={2} className="py-4 px-4 text-xs uppercase tracking-wide">
                  Total Final por Canal
                </td>
                {canais.length === 0 ? (
                  <td className="py-4 px-4 text-right text-xs text-muted-foreground">Sem canais</td>
                ) : (
                  canais.map((canal) => {
                    const tot = totais[canal.id]
                    return (
                      <td key={canal.id} className="py-4 px-4 text-right">
                        <div className="text-base sm:text-lg font-black text-primary">
                          {formatarMoedaBR(tot?.total_geral || 0)}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-normal">
                          Itens: {formatarMoedaBR(tot?.total_itens || 0)}
                          {(tot?.total_fretes || 0) > 0 &&
                            ` + Frete: ${formatarMoedaBR(tot?.total_fretes || 0)}`}
                        </div>
                      </td>
                    )
                  })
                )}
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* OBSERVAÇÕES */}
      {orcamento.observacoes && (
        <Card className="shadow-xs border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-foreground">
              Observações da Proposta
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground whitespace-pre-line">
            {orcamento.observacoes}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
