import { useEffect, useState, useMemo } from 'react'
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
  formatarDataBR,
  normalizarCanaisExpandidos,
  normalizarOrcamentoRecord,
} from '@/lib/precificacao/orcamentoCalculo'
import { imprimirOuBaixarOrcamentoPDF } from '@/lib/precificacao/orcamentoPdf'
import { OrcamentoSaidasPanel } from '@/components/precificacao/OrcamentoSaidasPanel'
import { DecisaoAprovacaoItemPanel } from '@/components/precificacao/DecisaoAprovacaoItemPanel'
import { MontanteOrcamentoPanel } from '@/components/precificacao/MontanteOrcamentoPanel'
import { calcularMontanteConsolidadoPorCanal } from '@/lib/precificacao/orcamentoCalculo'
import { getFileUrl } from '@/lib/pocketbase/files'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const [canalSelecionadoId, setCanalSelecionadoId] = useState<string>('')
  const [itemSelecionadoIdx, setItemSelecionadoIdx] = useState<number>(0)
  const [precificacaoAprovadaCarregada, setPrecificacaoAprovadaCarregada] = useState<any | null>(
    null,
  )
  const [loadingPrecificacao, setLoadingPrecificacao] = useState(false)
  const [simPrecoUnitario, setSimPrecoUnitario] = useState<number | undefined>(undefined)
  const [simPrecoCheio, setSimPrecoCheio] = useState<number | undefined>(undefined)
  const [simQuantidade, setSimQuantidade] = useState<number | undefined>(undefined)
  const [simFrete, setSimFrete] = useState<number | undefined>(undefined)
  const [simModoFrete, setSimModoFrete] = useState<
    'pago_pelo_cliente' | 'frete_gratis' | undefined
  >(undefined)

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

  const orcamentoNormalizado = useMemo(() => {
    return orcamento ? normalizarOrcamentoRecord(orcamento) : null
  }, [orcamento])

  const totais = useMemo(() => {
    if (!orcamentoNormalizado?.totais_por_canal) return {}
    return typeof orcamentoNormalizado.totais_por_canal === 'object' &&
      !Array.isArray(orcamentoNormalizado.totais_por_canal)
      ? orcamentoNormalizado.totais_por_canal
      : {}
  }, [orcamentoNormalizado])

  const canais = useMemo(() => {
    return normalizarCanaisExpandidos(orcamentoNormalizado?.expand?.canais_comparados, totais)
  }, [orcamentoNormalizado, totais])

  const itens = useMemo(() => {
    return Array.isArray(orcamentoNormalizado?.expand?.itens)
      ? orcamentoNormalizado.expand.itens
      : []
  }, [orcamentoNormalizado])

  const totalUnidadesGeral = useMemo(() => {
    return itens.reduce((acc, it) => acc + (Number(it.quantidade) || 0), 0)
  }, [itens])

  const montantesPorCanal = useMemo(() => {
    return calcularMontanteConsolidadoPorCanal({
      canais: canais.map((c) => ({ id: c.id, nome: c.nome || c.id, tipo: (c as any).tipo })),
      itens,
    })
  }, [canais, itens])

  const stInfo = orcamentoNormalizado
    ? STATUS_CONFIG[orcamentoNormalizado.status] || STATUS_CONFIG.rascunho
    : STATUS_CONFIG.rascunho

  const formatarData = (dt?: string) => {
    return formatarDataBR(dt)
  }

  // Define canal inicial se não definido
  useEffect(() => {
    if (canais.length > 0 && !canalSelecionadoId) {
      setCanalSelecionadoId(canais[0].id)
    }
  }, [canais, canalSelecionadoId])

  // Ajusta item selecionado se índice extrapolar
  useEffect(() => {
    if (itens.length > 0 && itemSelecionadoIdx >= itens.length) {
      setItemSelecionadoIdx(0)
    }
  }, [itens, itemSelecionadoIdx])

  const itemAtual = itens[itemSelecionadoIdx] || itens[0]
  const canalAtual = canais.find((c) => c.id === canalSelecionadoId) || canais[0]

  // Carrega precificação aprovada detalhada para o item e canal selecionados
  // e inicializa as variáveis de simulação local
  useEffect(() => {
    let ativo = true
    if (!itemAtual || !canalAtual) {
      setPrecificacaoAprovadaCarregada(null)
      setSimPrecoUnitario(undefined)
      setSimPrecoCheio(undefined)
      setSimQuantidade(undefined)
      setSimFrete(undefined)
      return
    }

    const precoUnitItem = itemAtual.precos_canais?.[canalAtual.id]?.preco_unitario || 0
    const precoCheioItem = itemAtual.precos_canais?.[canalAtual.id]?.preco_cheio
    const qtdItem = itemAtual.quantidade || 1
    const freteItem = itemAtual.fretes_canais?.[canalAtual.id]?.valor_frete || 0

    setSimPrecoUnitario(precoUnitItem)
    setSimPrecoCheio(
      precoCheioItem !== undefined
        ? precoCheioItem
        : Math.round(precoUnitItem * qtdItem * 100) / 100,
    )
    setSimQuantidade(qtdItem)
    setSimFrete(freteItem)
    setSimModoFrete(itemAtual.fretes_canais?.[canalAtual.id]?.modo_frete || 'pago_pelo_cliente')

    const precCanal = itemAtual.precos_canais?.[canalAtual.id]
    const prodCanal = itemAtual.produtos_canais?.[canalAtual.id]
    const precId = precCanal?.precificacao_id || prodCanal?.precificacao_id
    const prodId = prodCanal?.produto_id

    setLoadingPrecificacao(true)
    const carregarPrec = async () => {
      try {
        const prec = await orcamentosService.getPrecificacaoAprovadaDetalhada(
          precId,
          prodId,
          canalAtual.id,
        )
        if (ativo) {
          setPrecificacaoAprovadaCarregada(prec)
        }
      } catch {
        if (ativo) setPrecificacaoAprovadaCarregada(null)
      } finally {
        if (ativo) setLoadingPrecificacao(false)
      }
    }

    carregarPrec()
    return () => {
      ativo = false
    }
  }, [itemAtual, canalAtual])

  const handleSimAlterarPrecoUnitario = (novoPrecoUnit: number) => {
    setSimPrecoUnitario(novoPrecoUnit)
    const qtd = simQuantidade ?? itemAtual?.quantidade ?? 1
    setSimPrecoCheio(Math.round(novoPrecoUnit * qtd * 100) / 100)
  }

  const handleSimAlterarPrecoCheio = (novoPrecoCheio: number) => {
    setSimPrecoCheio(novoPrecoCheio)
    const qtd = simQuantidade ?? itemAtual?.quantidade ?? 1
    if (qtd > 0) {
      setSimPrecoUnitario(Math.round((novoPrecoCheio / qtd) * 100) / 100)
    }
  }

  const handleSimAlterarQuantidade = (novaQtd: number) => {
    const qtd = Math.max(1, novaQtd)
    setSimQuantidade(qtd)
    const pUnit =
      simPrecoUnitario ?? itemAtual?.precos_canais?.[canalAtual?.id || '']?.preco_unitario ?? 0
    setSimPrecoCheio(Math.round(pUnit * qtd * 100) / 100)
  }

  const handleSimAlterarFrete = (novoFrete: number) => {
    setSimFrete(novoFrete)
  }

  const handleSimAlterarModoFrete = (novoModo: 'pago_pelo_cliente' | 'frete_gratis') => {
    setSimModoFrete(novoModo)
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

      {/* RESUMO DO MONTANTE DO ORÇAMENTO (SOMA DE TODOS OS ITENS) */}
      <MontanteOrcamentoPanel
        montantesPorCanal={montantesPorCanal}
        totalItensQtd={totalUnidadesGeral}
        qtdModelos={itens.length}
      />

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
              Especificação por Item
            </CardDescription>
            <CardTitle className="text-sm font-bold text-foreground">
              {itens.length} {itens.length === 1 ? 'modelo configurado' : 'modelos configurados'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            Temas e variações configurados individualmente por item abaixo
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
                itens.map((item, idx) => {
                  const isPersonalizado = item.tipo_item === 'personalizado'
                  const fotoModelo = (item.expand as any)?.modelo?.foto
                    ? getFileUrl((item.expand as any).modelo, (item.expand as any).modelo.foto)
                    : ''
                  const fotoAnexo = item.imagem_anexo ? getFileUrl(item, item.imagem_anexo) : ''
                  const imagemExibir = fotoAnexo || item.foto_url || fotoModelo

                  return (
                    <tr key={item.id || idx} className="hover:bg-muted/10">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {imagemExibir ? (
                            <img
                              src={imagemExibir}
                              alt={item.modelo_nome}
                              className="h-9 w-9 rounded-md object-cover border border-border/80 shrink-0"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-md bg-muted/40 border border-dashed border-border/80 flex items-center justify-center shrink-0">
                              <Sparkles className="w-3.5 h-3.5 text-muted-foreground/40" />
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground">
                                {item.modelo_nome || 'Item sem nome'}
                              </span>
                              {item.modelo_codigo && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  ({item.modelo_codigo})
                                </span>
                              )}
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1 py-0 ${
                                  isPersonalizado
                                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {isPersonalizado ? 'Personalizado' : 'Cadastrado'}
                              </Badge>
                            </div>

                            {item.descricao && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">
                                {item.descricao}
                              </p>
                            )}

                            {(item.tema_nome || item.cor) && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {item.tema_nome && (
                                  <span className="text-primary font-medium">
                                    Tema: {item.tema_nome}
                                  </span>
                                )}
                                {item.tema_nome && item.cor && <span> • </span>}
                                {item.cor && <span>Cor: {item.cor}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-bold">{item.quantidade || 1}</td>
                      {canais.map((canal) => {
                        const precoUnit = item.precos_canais?.[canal.id]?.preco_unitario || 0
                        const subtotal = Math.round(precoUnit * (item.quantidade || 1) * 100) / 100
                        const freteObj = item.fretes_canais?.[canal.id]
                        const frete = Number(freteObj?.valor_frete) || 0
                        const modoFrete = freteObj?.modo_frete || 'pago_pelo_cliente'
                        return (
                          <td key={canal.id} className="py-3 px-4 text-right">
                            <div className="font-bold text-foreground">
                              {formatarMoedaBR(subtotal)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatarMoedaBR(precoUnit)}/un
                            </div>
                            {modoFrete === 'frete_gratis' ? (
                              <div className="text-[11px] font-semibold text-emerald-600 mt-0.5">
                                Frete: Grátis
                              </div>
                            ) : frete > 0 ? (
                              <div className="text-[11px] font-semibold text-orange-600 mt-0.5">
                                + Frete: {formatarMoedaBR(frete)} (pago pelo cliente)
                              </div>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
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

      {/* PAINEL DE DECISÃO DE APROVAÇÃO (ITEM POR CANAL) */}
      {itens.length > 0 && canais.length > 0 && itemAtual && canalAtual && (
        <Card className="shadow-xs border-border/80">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Decisão de Aprovação & Rentabilidade (Simulador por Item e Canal)
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Analise o Lucro Líquido, Margem Real, Ponto de Equilíbrio e Preço Meta ajustando
                  preços e quantidades em tempo real.
                </CardDescription>
              </div>

              {/* Seletores de Item e Canal */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Item:</span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={itemSelecionadoIdx}
                    onChange={(e) => setItemSelecionadoIdx(Number(e.target.value))}
                  >
                    {itens.map((it, idx) => (
                      <option key={it.id || idx} value={idx}>
                        #{idx + 1} - {it.modelo_nome || 'Item sem nome'} (qtd: {it.quantidade || 1})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Canal:</span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={canalSelecionadoId}
                    onChange={(e) => setCanalSelecionadoId(e.target.value)}
                  >
                    {canais.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome || c.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {/* Controles de edição e recálculo em tempo real */}
            <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">
                    Simulador de Valores (Item: {itemAtual.modelo_nome || 'Item'} &bull; Canal:{' '}
                    {canalAtual.nome})
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1 py-0 ${
                      itemAtual.tipo_item === 'personalizado'
                        ? 'bg-violet-50 text-violet-700 border-violet-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {itemAtual.tipo_item === 'personalizado' ? 'Personalizado' : 'Cadastrado'}
                  </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Altere os campos abaixo para ver o recálculo em tempo real no painel de decisão
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">
                    Preço Unit. (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={
                      simPrecoUnitario ??
                      (itemAtual.precos_canais?.[canalAtual.id]?.preco_unitario || 0)
                    }
                    onChange={(e) => handleSimAlterarPrecoUnitario(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">
                    Preço Cheio (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={
                      simPrecoCheio ??
                      itemAtual.precos_canais?.[canalAtual.id]?.preco_cheio ??
                      Math.round(
                        (itemAtual.precos_canais?.[canalAtual.id]?.preco_unitario || 0) *
                          (itemAtual.quantidade || 1) *
                          100,
                      ) / 100
                    }
                    onChange={(e) => handleSimAlterarPrecoCheio(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs font-semibold text-primary"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">
                    Quantidade (un)
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={simQuantidade ?? (itemAtual.quantidade || 1)}
                    onChange={(e) => handleSimAlterarQuantidade(parseInt(e.target.value, 10) || 1)}
                    className="h-8 text-xs font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">
                    Frete do Item (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={simFrete ?? (itemAtual.fretes_canais?.[canalAtual.id]?.valor_frete || 0)}
                    onChange={(e) => handleSimAlterarFrete(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs font-semibold text-orange-600"
                  />
                  <div className="flex gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSimAlterarModoFrete('pago_pelo_cliente')}
                      className={`text-[10px] px-2 py-0.5 rounded font-medium border transition-colors ${
                        (simModoFrete ??
                          itemAtual.fretes_canais?.[canalAtual.id]?.modo_frete ??
                          'pago_pelo_cliente') === 'pago_pelo_cliente'
                          ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                          : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Pago Cliente
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimAlterarModoFrete('frete_gratis')}
                      className={`text-[10px] px-2 py-0.5 rounded font-medium border transition-colors ${
                        (simModoFrete ??
                          itemAtual.fretes_canais?.[canalAtual.id]?.modo_frete ??
                          'pago_pelo_cliente') === 'frete_gratis'
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-900 font-bold'
                          : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Frete Grátis
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {loadingPrecificacao ? (
              <div className="py-8 space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <DecisaoAprovacaoItemPanel
                canalNome={canalAtual.nome}
                quantidadeItem={simQuantidade ?? (itemAtual.quantidade || 1)}
                precoUnitarioEditado={
                  simPrecoUnitario ??
                  (itemAtual.precos_canais?.[canalAtual.id]?.preco_unitario || 0)
                }
                precoCheioEditado={
                  simPrecoCheio ?? (itemAtual.precos_canais?.[canalAtual.id]?.preco_cheio || 0)
                }
                freteItemEditado={
                  simFrete ?? (itemAtual.fretes_canais?.[canalAtual.id]?.valor_frete || 0)
                }
                modoFreteItem={
                  simModoFrete ??
                  (itemAtual.fretes_canais?.[canalAtual.id]?.modo_frete || 'pago_pelo_cliente')
                }
                precificacaoAprovadaRecord={precificacaoAprovadaCarregada}
                produtoVinculado={itemAtual.produtos_canais?.[canalAtual.id]}
              />
            )}
          </CardContent>
        </Card>
      )}

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
