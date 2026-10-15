import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  FileText,
  Calendar,
  User,
  Clock,
  Printer,
  Share2,
  CheckCircle2,
  AlertCircle,
  Phone,
  Sparkles,
} from 'lucide-react'
import { orcamentosService } from '@/services/orcamentos'
import { OrcamentoRecord } from '@/types/orcamento'
import {
  formatarMoedaBR,
  formatarDataBR,
  normalizarCanaisExpandidos,
  normalizarOrcamentoRecord,
} from '@/lib/precificacao/orcamentoCalculo'
import { imprimirOuBaixarOrcamentoPDF } from '@/lib/precificacao/orcamentoPdf'
import { getFileUrl } from '@/lib/pocketbase/files'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export default function OrcamentoPublicoPage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [orcamento, setOrcamento] = useState<OrcamentoRecord | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let active = true

    async function carregar() {
      if (!token) {
        setErro('Link de orçamento inválido ou incompleto.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setErro(null)
        const data = await orcamentosService.getOrcamentoPublico(token)
        if (active) {
          setOrcamento(data)
        }
      } catch (err: any) {
        if (active) {
          console.warn('Erro ao abrir orçamento público:', err)
          setErro(
            err.message ||
              'Não foi possível encontrar este orçamento. O link pode ter sido desativado ou expirado.',
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    carregar()

    return () => {
      active = false
    }
  }, [token])

  const handleCopiarLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl shadow-lg border-border">
          <CardHeader>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (erro || !orcamento) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg border-red-200 text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Orçamento Indisponível</h2>
            <p className="text-sm text-muted-foreground">{erro}</p>
            <div className="pt-2">
              <Button asChild variant="outline">
                <Link to="/">Voltar ao Início</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
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
  // Usa normalizarCanaisExpandidos passando totais para resgatar nomes mesmo se expand vier vazio
  const canais = normalizarCanaisExpandidos(orcamentoNormalizado.expand?.canais_comparados, totais)
  const itens = Array.isArray(orcamentoNormalizado.expand?.itens)
    ? orcamentoNormalizado.expand.itens
    : []

  const formatarData = (dt?: string) => {
    return formatarDataBR(dt)
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Barra superior de identificação */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-primary">
                ERP GKza
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-semibold text-muted-foreground">
                Proposta Comercial
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-0.5">
              {orcamento.titulo || `Orçamento ${orcamento.codigo}`}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Código de referência:{' '}
              <span className="font-mono font-bold text-slate-700">{orcamento.codigo}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopiarLink}
              className="border-slate-300 font-medium"
            >
              {copiado ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" />
                  Copiado!
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-1.5 text-slate-600" />
                  Compartilhar
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => imprimirOuBaixarOrcamentoPDF(orcamento)}
              className="bg-primary hover:bg-primary/90 text-white font-bold shadow-xs"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Baixar / Imprimir PDF
            </Button>
          </div>
        </div>

        {/* Informações do Cliente e Validade */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="shadow-xs border-slate-200/80 bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary" />
                Cliente
              </CardDescription>
              <CardTitle className="text-base font-bold text-slate-900">
                {orcamento.cliente_nome}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              {orcamento.cliente_whatsapp ? (
                <div className="flex items-center gap-1 text-slate-700 font-medium">
                  <Phone className="w-3 h-3 text-emerald-600" />
                  {orcamento.cliente_whatsapp}
                </div>
              ) : (
                'Atendimento direto'
              )}
            </CardContent>
          </Card>

          <Card className="shadow-xs border-slate-200/80 bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Data de Emissão
              </CardDescription>
              <CardTitle className="text-base font-bold text-slate-900">
                {formatarData(orcamento.data_orcamento)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              {orcamento.validade_dias ? `Prazo de ${orcamento.validade_dias} dias` : 'Vigente'}
            </CardContent>
          </Card>

          <Card className="shadow-xs border-slate-200/80 bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                Validade da Proposta
              </CardDescription>
              <CardTitle className="text-base font-bold text-primary">
                {formatarData(orcamento.validade_data)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Valores garantidos até a data limite
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Modelos e Comparação de Canais */}
        <Card className="shadow-xs border-slate-200/80 bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-base font-bold text-slate-900">
              Itens da Cotação & Comparativo de Canais
            </CardTitle>
            <CardDescription className="text-xs">
              Confira os valores unitários, quantidades e opções de envio para cada canal
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/60 text-slate-700 text-xs uppercase font-semibold">
                  <th className="py-3 px-4">Item / Modelo</th>
                  <th className="py-3 px-3 text-center">Qtd</th>
                  {canais.map((canal) => (
                    <th key={canal.id} className="py-3 px-4 text-right">
                      {canal?.nome || 'Canal'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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
                      <tr key={item.id || idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {imagemExibir ? (
                              <img
                                src={imagemExibir}
                                alt={item.modelo_nome}
                                className="h-10 w-10 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-slate-100 border border-dashed border-slate-200 flex items-center justify-center shrink-0">
                                <Sparkles className="w-4 h-4 text-slate-400" />
                              </div>
                            )}

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">
                                  {item.modelo_nome || 'Item sem nome'}
                                </span>
                                {item.modelo_codigo && (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    Cód: {item.modelo_codigo}
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
                                <p className="text-xs text-slate-500 italic mt-0.5">
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
                        <td className="py-3 px-3 text-center font-bold text-slate-800">
                          {item.quantidade || 1}
                        </td>
                        {canais.map((canal) => {
                          const precoUnit = item.precos_canais?.[canal.id]?.preco_unitario || 0
                          const precoCheioGravado = item.precos_canais?.[canal.id]?.preco_cheio
                          const subtotal =
                            precoCheioGravado !== undefined && precoCheioGravado > 0
                              ? precoCheioGravado
                              : Math.round(precoUnit * (item.quantidade || 1) * 100) / 100
                          const freteObj = item.fretes_canais?.[canal.id]
                          const frete = Number(freteObj?.valor_frete) || 0
                          const modoFrete = freteObj?.modo_frete || 'pago_pelo_cliente'
                          return (
                            <td key={canal.id} className="py-3 px-4 text-right">
                              <div className="font-bold text-slate-900">
                                {formatarMoedaBR(subtotal)}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {formatarMoedaBR(precoUnit)} cada
                              </div>
                              {modoFrete === 'frete_gratis' ? (
                                <div className="text-[11px] font-semibold text-emerald-600 mt-0.5">
                                  Frete: Grátis
                                </div>
                              ) : frete > 0 ? (
                                <div className="text-[11px] font-medium text-orange-600 mt-0.5">
                                  + Frete {formatarMoedaBR(frete)} (pago pelo cliente)
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
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
                  <td colSpan={2} className="py-4 px-4 text-sm uppercase tracking-wide">
                    Total Final por Canal
                  </td>
                  {canais.length === 0 ? (
                    <td className="py-4 px-4 text-right text-xs text-muted-foreground">
                      Sem canais
                    </td>
                  ) : (
                    canais.map((canal) => {
                      const tot = totais[canal.id]
                      return (
                        <td key={canal.id} className="py-4 px-4 text-right">
                          <div className="text-lg font-black text-primary">
                            {formatarMoedaBR(tot?.total_geral || 0)}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-normal">
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

        {/* Resumo em Cards para Mobile / Destaque */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {canais.map((canal) => {
            const tot = totais[canal.id]
            return (
              <div
                key={canal.id}
                className="p-5 rounded-2xl bg-white border-2 border-primary/20 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-base text-slate-900">{canal.nome}</span>
                  <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                    Canal Selecionado
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>Subtotal dos itens:</span>
                    <span className="font-semibold text-slate-800">
                      {formatarMoedaBR(tot?.total_itens || 0)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>Frete / Envio:</span>
                    <span className="font-semibold text-slate-800">
                      {(tot?.total_fretes || 0) > 0
                        ? `${formatarMoedaBR(tot?.total_fretes || 0)} (pago pelo cliente)`
                        : 'Grátis'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-baseline">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Total:
                    </span>
                    <span className="text-xl font-black text-primary">
                      {formatarMoedaBR(tot?.total_geral || 0)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Observações */}
        {orcamento.observacoes && (
          <div className="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 space-y-1">
            <p className="font-bold text-slate-900">Observações adicionais:</p>
            <p className="whitespace-pre-line leading-relaxed">{orcamento.observacoes}</p>
          </div>
        )}

        {/* Rodapé institucional */}
        <div className="text-center pt-4 pb-8 text-xs text-muted-foreground">
          <p>Documento gerado com segurança pelo ERP GKza.</p>
          <p className="mt-1">
            Para dúvidas ou confirmação do pedido, entre em contato diretamente com nossa equipe.
          </p>
        </div>
      </div>
    </div>
  )
}
