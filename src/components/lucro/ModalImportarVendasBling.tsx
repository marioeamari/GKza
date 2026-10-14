import React, { useState, useRef, useMemo } from 'react'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Plus,
  Save,
  Check,
  ShoppingBag,
  Info,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/format'
import {
  lerPlanilhaBling,
  processarRelatorioBling,
  adicionarApelidoCanal,
  ResultadoParseBling,
  LinhaBlingBruta,
} from '@/lib/blingVendasParser'
import { precificacaoService } from '@/services/precificacao'
import type { PrecProdutoRecord } from '@/types/precificacao'
import type { CanalLojaLucro } from '@/lib/lucro'

export interface PreenchimentoGradeItem {
  produtoId: string
  quantidade: number
  valorTotal: number
}

export interface ModalImportarVendasBlingProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canaisDisponiveis: CanalLojaLucro[]
  catalogoProdutos: PrecProdutoRecord[]
  competenciaAtual: string
  semanaAtivaRotulo?: string
  /**
   * Valores atualmente lançados na grade para o canal (para detectar conflito/sobrescrita)
   */
  valoresAtuaisGradeCanal?: Record<string, number>
  /**
   * Callback quando a importação é confirmada e aplicada na grade do período
   */
  onAplicarGrade: (
    canalId: string,
    itens: PreenchimentoGradeItem[],
    modo: 'mesclar' | 'substituir',
  ) => void
  /**
   * Notifica que produtos tiveram seus apelidos salvos no banco para atualizar catálogo local
   */
  onCatalogoAtualizado?: () => void
}

export function ModalImportarVendasBling({
  open,
  onOpenChange,
  canaisDisponiveis = [],
  catalogoProdutos = [],
  competenciaAtual,
  semanaAtivaRotulo,
  valoresAtuaisGradeCanal = {},
  onAplicarGrade,
  onCatalogoAtualizado,
}: ModalImportarVendasBlingProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estado do fluxo de importação
  const [canalSelecionadoId, setCanalSelecionadoId] = useState<string>('')
  const [arquivoCarregado, setArquivoCarregado] = useState<File | null>(null)
  const [lendoArquivo, setLendoArquivo] = useState(false)
  const [linhasBrutas, setLinhasBrutas] = useState<LinhaBlingBruta[]>([])
  const [resultadoParse, setResultadoParse] = useState<ResultadoParseBling | null>(null)

  // Fila A Classificar: mapa de seleções temporárias do usuário (codigoBling -> produtoId)
  const [classificacoesManuais, setClassificacoesManuais] = useState<Record<string, string>>({})
  const [gravandoApelidos, setGravandoApelidos] = useState(false)

  // Diálogo de confirmação de sobrescrita de valores manuais já lançados
  const [confirmacaoSobrescritaAberta, setConfirmacaoSobrescritaAberta] = useState(false)
  const [itensComConflito, setItensComConflito] = useState<
    Array<{ produtoNome: string; valorAtual: number; novoValor: number }>
  >([])

  // Modal pós-importação / status final
  const [relatorioFinal, setRelatorioFinal] = useState<{
    produtosClassificados: number
    unidadesSomadas: number
    codigosAguardando: number
    canalNome: string
  } | null>(null)

  const canalObjeto = useMemo(() => {
    return canaisDisponiveis.find((c) => c.id === canalSelecionadoId)
  }, [canaisDisponiveis, canalSelecionadoId])

  // Reset ao abrir modal
  const resetEstado = () => {
    setArquivoCarregado(null)
    setLinhasBrutas([])
    setResultadoParse(null)
    setClassificacoesManuais({})
    setRelatorioFinal(null)
    setItensComConflito([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const extensao = file.name.split('.').pop()?.toLowerCase()
    if (extensao !== 'xls' && extensao !== 'xlsx' && extensao !== 'csv') {
      toast({
        variant: 'destructive',
        title: 'Formato não suportado',
        description: 'Selecione um arquivo de relatório Bling (.xls ou .xlsx).',
      })
      return
    }

    setLendoArquivo(true)
    setArquivoCarregado(file)
    try {
      const buffer = await file.arrayBuffer()
      const linhas = lerPlanilhaBling(buffer)

      if (linhas.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Planilha vazia ou sem cabeçalho reconhecido',
          description: 'Não foi possível encontrar as colunas "Código" ou "Quantidade" no arquivo.',
        })
        setLendoArquivo(false)
        return
      }

      setLinhasBrutas(linhas)

      // Executa o processamento confrontando com o catálogo de produtos e canal selecionado
      const parse = processarRelatorioBling(
        linhas,
        catalogoProdutos,
        canalSelecionadoId,
        canalObjeto?.nome,
        file.name,
      )

      setResultadoParse(parse)

      toast({
        title: 'Relatório Bling lido com sucesso!',
        description: `${parse.totalLinhasLidas} linhas processadas. ${parse.resumo.totalProdutosClassificados} produtos identificados.`,
      })
    } catch (err) {
      console.error('Erro ao ler planilha Bling:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao ler arquivo',
        description: 'Verifique se o arquivo está corrompido ou protegido por senha.',
      })
    } finally {
      setLendoArquivo(false)
    }
  }

  // Se o usuário mudar o canal após ter feito o upload, reprocessa o arquivo com o novo canal
  const handleCanalChange = (novoCanalId: string) => {
    setCanalSelecionadoId(novoCanalId)
    if (linhasBrutas.length > 0) {
      const canalObj = canaisDisponiveis.find((c) => c.id === novoCanalId)
      const novoParse = processarRelatorioBling(
        linhasBrutas,
        catalogoProdutos,
        novoCanalId,
        canalObj?.nome,
        arquivoCarregado?.name,
      )
      setResultadoParse(novoParse)
      setClassificacoesManuais({})
    }
  }

  // Quando o usuário seleciona um produto para um código da fila 'A Classificar'
  const handleVincularProdutoFila = (codigoBling: string, produtoId: string) => {
    setClassificacoesManuais((prev) => ({
      ...prev,
      [codigoBling]: produtoId,
    }))
  }

  // Grava definitivamente os apelidos apontados manualmente no banco de dados e recalcula
  const handleSalvarApelidosFila = async () => {
    const codigosSelecionados = Object.entries(classificacoesManuais).filter(([, prodId]) =>
      Boolean(prodId),
    )
    if (codigosSelecionados.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum produto selecionado',
        description: 'Aponte o produto correspondente para os códigos antes de salvar.',
      })
      return
    }

    setGravandoApelidos(true)
    try {
      let salvos = 0
      for (const [codigoBling, prodId] of codigosSelecionados) {
        const prod = catalogoProdutos.find((p) => p.id === prodId)
        if (!prod) continue

        // Atualiza a lista sku_por_canal do produto adicionando este apelido para o canal selecionado (ou global)
        const listaAtual = Array.isArray(prod.sku_por_canal) ? prod.sku_por_canal : []
        const novaLista = adicionarApelidoCanal(
          listaAtual,
          canalSelecionadoId || 'todos',
          codigoBling,
        )

        // Salvar apelidos NÃO deve invalidar precificações (opcoes: marcarDesatualizada=false)
        await precificacaoService.updateProduto(
          prod.id,
          {
            sku_por_canal: novaLista,
          },
          { marcarDesatualizada: false },
        )
        prod.sku_por_canal = novaLista
        salvos++
      }

      toast({
        title: 'Apelidos gravados definitivamente!',
        description: `${salvos} apelido(s) registrado(s) no cadastro do produto.`,
      })

      // Limpa seleções manuais e reprocessa o relatório com os novos apelidos ativos
      setClassificacoesManuais({})
      if (onCatalogoAtualizado) {
        onCatalogoAtualizado()
      }

      if (linhasBrutas.length > 0) {
        const parseAtualizado = processarRelatorioBling(
          linhasBrutas,
          catalogoProdutos,
          canalSelecionadoId,
          canalObjeto?.nome,
          arquivoCarregado?.name,
        )
        setResultadoParse(parseAtualizado)
      }
    } catch (err) {
      console.error('Erro ao gravar apelidos:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao gravar apelidos',
        description: 'Não foi possível persistir os apelidos no banco de dados.',
      })
    } finally {
      setGravandoApelidos(false)
    }
  }

  // Prepara aplicação na grade com checagem de conflitos
  const handleIniciarAplicacaoNaGrade = () => {
    if (!canalSelecionadoId) {
      toast({
        variant: 'destructive',
        title: 'Selecione o canal',
        description: 'É necessário selecionar o canal de venda de destino.',
      })
      return
    }

    if (!resultadoParse) return

    // Verifica se já existem valores manuais na grade para este canal que seriam sobrescritos
    const conflitos: Array<{ produtoNome: string; valorAtual: number; novoValor: number }> = []

    for (const itemAgrupado of Object.values(resultadoParse.agrupadosPorProduto)) {
      const valorAtual = valoresAtuaisGradeCanal[itemAgrupado.produtoId]
      if (typeof valorAtual === 'number' && valorAtual > 0) {
        conflitos.push({
          produtoNome: itemAgrupado.produtoNome,
          valorAtual,
          novoValor: Math.round(itemAgrupado.quantidadeTotal),
        })
      }
    }

    if (conflitos.length > 0) {
      setItensComConflito(conflitos)
      setConfirmacaoSobrescritaAberta(true)
    } else {
      executarAplicacao('substituir')
    }
  }

  const executarAplicacao = (modo: 'mesclar' | 'substituir') => {
    if (!resultadoParse || !canalSelecionadoId) return

    const itensParaGrade: PreenchimentoGradeItem[] = Object.values(
      resultadoParse.agrupadosPorProduto,
    ).map((ag) => ({
      produtoId: ag.produtoId,
      quantidade: Math.round(ag.quantidadeTotal),
      valorTotal: Math.round(ag.valorTotal * 100) / 100,
    }))

    onAplicarGrade(canalSelecionadoId, itensParaGrade, modo)

    setConfirmacaoSobrescritaAberta(false)

    // Exibe relatório final pós-importação
    setRelatorioFinal({
      produtosClassificados: resultadoParse.resumo.totalProdutosClassificados,
      unidadesSomadas: resultadoParse.resumo.totalUnidadesClassificadas,
      codigosAguardando: resultadoParse.resumo.totalCodigosNaoClassificados,
      canalNome: canalObjeto?.nome || 'Canal Selecionado',
    })

    toast({
      title: 'Grade pré-preenchida com sucesso!',
      description: `${itensParaGrade.length} produtos atualizados no canal ${canalObjeto?.nome || ''}.`,
    })
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(op) => {
          if (!op) resetEstado()
          onOpenChange(op)
        }}
      >
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  Importador de Vendas do Bling
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Carregue a planilha (.xls / .xlsx) de vendas do Bling para pré-preencher a grade
                  de <strong className="text-foreground">{competenciaAtual}</strong>{' '}
                  {semanaAtivaRotulo ? `(${semanaAtivaRotulo})` : ''}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* RELATÓRIO PÓS-IMPORTAÇÃO (QUANDO CONCLUÍDO) */}
          {relatorioFinal ? (
            <div className="py-6 space-y-5 text-center">
              <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-10 w-10" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">
                  Importação Aplicada com Sucesso!
                </h3>
                <p className="text-xs text-muted-foreground">
                  Os valores foram pré-preenchidos na grade do canal{' '}
                  <strong className="text-foreground">{relatorioFinal.canalNome}</strong>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
                <Card className="border-border/80 bg-slate-50/50">
                  <CardContent className="p-3 text-center">
                    <span className="text-2xl font-bold font-mono text-purple-700 block">
                      {relatorioFinal.produtosClassificados}
                    </span>
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Produtos Classificados
                    </span>
                  </CardContent>
                </Card>

                <Card className="border-border/80 bg-slate-50/50">
                  <CardContent className="p-3 text-center">
                    <span className="text-2xl font-bold font-mono text-emerald-700 block">
                      {relatorioFinal.unidadesSomadas}
                    </span>
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Unidades Somadas
                    </span>
                  </CardContent>
                </Card>

                <Card className="border-border/80 bg-slate-50/50">
                  <CardContent className="p-3 text-center">
                    <span
                      className={`text-2xl font-bold font-mono block ${
                        relatorioFinal.codigosAguardando > 0 ? 'text-amber-600' : 'text-slate-600'
                      }`}
                    >
                      {relatorioFinal.codigosAguardando}
                    </span>
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Códigos a Classificar
                    </span>
                  </CardContent>
                </Card>
              </div>

              <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                A grade permanece totalmente editável à mão. Se reimportar este mesmo período e
                canal, os valores serão atualizados em vez de duplicar.
              </p>

              <div className="pt-3 flex justify-center gap-2">
                <Button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs"
                >
                  Concluir e Ver Grade
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2 text-xs">
              {/* PASSO 1: SELEÇÃO DO CANAL DE DESTINO */}
              <div className="rounded-xl border border-border p-3.5 space-y-2 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-xs text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <ShoppingBag className="h-4 w-4 text-purple-600" />
                    <span>Passo 1: Selecione o Canal / Loja de Destino *</span>
                  </label>
                  {canalObjeto && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-semibold border-purple-200 bg-purple-50 text-purple-700"
                    >
                      Marketplace: {canalObjeto.marketplace_nome || 'Canal Próprio'}
                    </Badge>
                  )}
                </div>

                <Select value={canalSelecionadoId} onValueChange={handleCanalChange}>
                  <SelectTrigger className="bg-white h-9 text-xs font-semibold">
                    <SelectValue placeholder="Selecione o canal correspondente à planilha..." />
                  </SelectTrigger>
                  <SelectContent>
                    {canaisDisponiveis.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.nome} {c.marketplace_nome ? `(${c.marketplace_nome})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* PASSO 2: UPLOAD DA PLANILHA BLING (.XLS / .XLSX) */}
              <div className="rounded-xl border border-border p-3.5 space-y-3 bg-white">
                <label className="font-bold text-xs text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <Upload className="h-4 w-4 text-purple-600" />
                  <span>Passo 2: Arquivo do Relatório de Vendas (.xls / .xlsx)</span>
                </label>

                <div
                  className="border-2 border-dashed border-border/80 hover:border-purple-300 rounded-xl p-5 text-center cursor-pointer transition-colors bg-purple-50/20"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  {lendoArquivo ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-purple-700 py-2">
                      <RefreshCw className="h-6 w-6 animate-spin" />
                      <span className="font-bold text-xs">Processando planilha SheetJS...</span>
                    </div>
                  ) : arquivoCarregado ? (
                    <div className="flex items-center justify-center gap-2 text-foreground py-1">
                      <FileSpreadsheet className="h-6 w-6 text-purple-600" />
                      <div className="text-left">
                        <p className="font-bold text-xs">{arquivoCarregado.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(arquivoCarregado.size / 1024).toFixed(1)} KB • Clique para trocar de
                          arquivo
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5 py-1">
                      <FileSpreadsheet className="h-7 w-7 text-purple-600/60 mx-auto" />
                      <p className="font-semibold text-xs text-foreground">
                        Clique aqui para selecionar o arquivo .xls ou .xlsx exportado do Bling
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Reconhece colunas: Código, Quantidade, Valor total FCP ST, Frete, NCM, etc.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* RESUMO DO PROCESSAMENTO */}
              {resultadoParse && (
                <div className="space-y-3">
                  {/* Cards de Métricas */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg border border-border bg-slate-50">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                        Linhas Lidas
                      </span>
                      <span className="text-sm font-bold font-mono text-foreground">
                        {resultadoParse.totalLinhasLidas}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50">
                      <span className="text-[10px] text-emerald-800 uppercase font-semibold block">
                        Match Exato (SKU)
                      </span>
                      <span className="text-sm font-bold font-mono text-emerald-700">
                        {resultadoParse.resumo.totalProdutosClassificados} prod. (
                        {resultadoParse.resumo.totalUnidadesClassificadas} un)
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border border-border bg-slate-50">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                        Faturamento Classif.
                      </span>
                      <span className="text-sm font-bold font-mono text-foreground">
                        {formatCurrency(resultadoParse.resumo.totalValorClassificado)}
                      </span>
                    </div>

                    <div
                      className={`p-2.5 rounded-lg border ${
                        resultadoParse.aClassificar.length > 0
                          ? 'border-amber-300 bg-amber-50/60'
                          : 'border-border bg-slate-50'
                      }`}
                    >
                      <span className="text-[10px] text-amber-900 uppercase font-semibold block">
                        A Classificar
                      </span>
                      <span
                        className={`text-sm font-bold font-mono ${
                          resultadoParse.aClassificar.length > 0
                            ? 'text-amber-700'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {resultadoParse.resumo.totalCodigosNaoClassificados} cód. (
                        {resultadoParse.resumo.totalUnidadesNaoClassificadas} un)
                      </span>
                    </div>
                  </div>

                  {/* PRODUTOS CLASSIFICADOS (PRÉVIA DA GRADE) */}
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="bg-slate-100/80 px-3 py-2 border-b border-border flex items-center justify-between">
                      <span className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Produtos Classificados (
                        {Object.keys(resultadoParse.agrupadosPorProduto).length})
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Somatória exata por produto (tema/modelo preservados)
                      </span>
                    </div>

                    <div className="max-h-44 overflow-y-auto divide-y divide-border/60">
                      {Object.values(resultadoParse.agrupadosPorProduto).length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          Nenhum código teve match direto com os SKUs ou apelidos cadastrados.
                        </div>
                      ) : (
                        Object.values(resultadoParse.agrupadosPorProduto).map((ag) => (
                          <div
                            key={ag.produtoId}
                            className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-foreground block truncate">
                                {ag.produtoNome}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                                <span>SKU: {ag.produtoSku}</span>
                                <span>•</span>
                                <span title="Códigos do Bling somados para este produto">
                                  Códigos Bling: {ag.codigosBling.join(', ')}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-bold font-mono text-emerald-700 block">
                                {ag.quantidadeTotal} un
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {formatCurrency(ag.valorTotal)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* FILA 'A CLASSIFICAR' */}
                  {resultadoParse.aClassificar.length > 0 && (
                    <div className="rounded-xl border border-amber-300/80 bg-amber-50/20 overflow-hidden space-y-2 p-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5">
                          <HelpCircle className="h-4 w-4 text-amber-600" />
                          <span className="font-bold text-xs text-amber-950 uppercase tracking-wider">
                            Fila 'A Classificar' ({resultadoParse.aClassificar.length} códigos sem
                            match)
                          </span>
                        </div>
                        <span className="text-[10px] text-amber-800 font-medium">
                          Aponte o produto exato. A escolha grava o apelido definitivamente no
                          sistema.
                        </span>
                      </div>

                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {resultadoParse.aClassificar.map((itemNC) => {
                          const prodSelecionado = classificacoesManuais[itemNC.codigoBling] || ''
                          return (
                            <div
                              key={itemNC.codigoBling}
                              className="p-2.5 rounded-lg border border-amber-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-mono text-[11px] font-bold">
                                    {itemNC.codigoBling}
                                  </Badge>
                                  <span className="text-xs font-bold text-foreground">
                                    {itemNC.quantidade} un
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    ({formatCurrency(itemNC.valorTotal)})
                                  </span>
                                </div>
                              </div>

                              <div className="sm:w-72">
                                <Select
                                  value={prodSelecionado}
                                  onValueChange={(val) =>
                                    handleVincularProdutoFila(itemNC.codigoBling, val)
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs bg-slate-50">
                                    <SelectValue placeholder="Apontar produto do sistema..." />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-56">
                                    {catalogoProdutos.map((prod) => (
                                      <SelectItem key={prod.id} value={prod.id} className="text-xs">
                                        {prod.nome} [SKU: {prod.sku}]
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Botão para persistir apelidos apontados */}
                      {Object.keys(classificacoesManuais).length > 0 && (
                        <div className="pt-2 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            disabled={gravandoApelidos}
                            onClick={handleSalvarApelidosFila}
                            className="bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs gap-1.5"
                          >
                            {gravandoApelidos ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            <span>Gravar Apelidos Definitivamente & Reprocessar</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancelar
            </Button>

            {!relatorioFinal && (
              <Button
                type="button"
                disabled={!resultadoParse || !canalSelecionadoId || lendoArquivo}
                onClick={handleIniciarAplicacaoNaGrade}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs gap-1.5"
              >
                <span>Pré-preencher Grade do Período</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO DE CONFIRMAÇÃO DE SOBRESCRITA / MESCLAGEM */}
      <AlertDialog
        open={confirmacaoSobrescritaAberta}
        onOpenChange={setConfirmacaoSobrescritaAberta}
      >
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle className="text-base">
                Valores Já Lançados na Grade
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs space-y-3 pt-2 text-foreground leading-relaxed">
              <p>
                Identificamos que{' '}
                <strong className="text-foreground">{itensComConflito.length}</strong> produto(s) já
                possuem quantidades preenchidas manualmente neste canal ({canalObjeto?.nome}):
              </p>

              <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-border bg-slate-50 p-2 text-xs">
                {itensComConflito.map((c, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center py-1 border-b border-border/40 last:border-0"
                  >
                    <span className="truncate pr-2 font-medium">{c.produtoNome}</span>
                    <span className="font-mono text-muted-foreground shrink-0">
                      Atual: <strong className="text-foreground">{c.valorAtual}</strong> ➔ Bling:{' '}
                      <strong className="text-purple-700">{c.novoValor}</strong>
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-muted-foreground text-[11px]">
                Como deseja proceder com o preenchimento da grade?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              className="text-xs border-purple-200 text-purple-800 hover:bg-purple-50"
              onClick={() => executarAplicacao('mesclar')}
            >
              Somar / Manter
            </Button>
            <AlertDialogAction
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs"
              onClick={() => executarAplicacao('substituir')}
            >
              Atualizar com Bling
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
