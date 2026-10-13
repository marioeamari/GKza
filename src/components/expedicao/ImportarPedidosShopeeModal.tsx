import { useState, useRef } from 'react'
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Sparkles,
  HelpCircle,
  Package,
  FileUp,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import {
  parseShopeeColagem,
  parseShopeePlanilha,
  ResultadoParseShopee,
  ItemLinhaImportada,
  MapeamentoColunasShopee,
  normalizarTexto,
} from '@/lib/expedicaoShopeeParser'
import pb from '@/lib/pocketbase/client'
import { separacaoKitsService } from '@/services/separacaoKits'
import type { PrecProdutoRecord } from '@/types/precificacao'
import type { KitTema } from '@/types/separacaoKits'

interface ImportarPedidosShopeeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalogoProdutos: PrecProdutoRecord[]
  temas: KitTema[]
  modelos?: Array<{ id: string; codigo?: string; nome?: string; tema?: string }>
  onImportadoSucesso?: () => void
}

interface RelatorioImportacaoShopee {
  criados: number
  atualizados: number
  problemas: number
  detalhesProblemas: Array<{ orderSn: string; motivo: string }>
}

export function ImportarPedidosShopeeModal({
  open,
  onOpenChange,
  catalogoProdutos,
  temas,
  modelos = [],
  onImportadoSucesso,
}: ImportarPedidosShopeeModalProps) {
  const [tabAtiva, setTabAtiva] = useState<'planilha' | 'colagem'>('planilha')

  // Estado do Arquivo .xlsx
  const [arquivoNome, setArquivoNome] = useState<string>('')
  const [bufferArquivo, setBufferArquivo] = useState<ArrayBuffer | null>(null)
  const [isProcessandoArquivo, setIsProcessandoArquivo] = useState(false)
  const [mostrarAjusteColunas, setMostrarAjusteColunas] = useState(false)
  const [mapeamentoCustom, setMapeamentoCustom] = useState<MapeamentoColunasShopee>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estado da Colagem
  const [textoColado, setTextoColado] = useState('')

  // Resultado comum de prévia
  const [resultadoParse, setResultadoParse] = useState<ResultadoParseShopee | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [relatorioPosImportacao, setRelatorioPosImportacao] =
    useState<RelatorioImportacaoShopee | null>(null)

  // Limpa estados ao fechar ou reabrir
  const handleFechar = (aberto: boolean) => {
    if (!aberto) {
      setArquivoNome('')
      setBufferArquivo(null)
      setTextoColado('')
      setResultadoParse(null)
      setMostrarAjusteColunas(false)
      setMapeamentoCustom({})
      setRelatorioPosImportacao(null)
    }
    onOpenChange(aberto)
  }

  // Processa o arquivo .xlsx
  const processarArquivoBinario = (
    buffer: ArrayBuffer,
    nome: string,
    mapOverride?: MapeamentoColunasShopee,
  ) => {
    try {
      setIsProcessandoArquivo(true)
      setRelatorioPosImportacao(null)
      const res = parseShopeePlanilha(buffer, catalogoProdutos, temas, {
        nomeArquivo: nome,
        mapeamentoCustomizado: mapOverride || mapeamentoCustom,
        modelos,
      })
      setResultadoParse(res)
      if (res.detalheMapeamento) {
        setMapeamentoCustom(res.detalheMapeamento.mapeamento)
        // Se alguma coluna essencial não foi encontrada com certeza, abre o ajuste para o usuário
        const { confianca } = res.detalheMapeamento
        if (!confianca.numeroPedido || !confianca.produtoNome || !confianca.sku) {
          setMostrarAjusteColunas(true)
        }
      }
      toast({
        title: 'Planilha lida com sucesso!',
        description: `${res.itens.length} pedido(s) identificado(s) no arquivo ${nome}${
          res.formatoDetectado === 'lista_empacotamento_product_info'
            ? ' (Formato: Lista de Empacotamento / product_info)'
            : ''
        }.`,
      })
    } catch (err: any) {
      console.error('Erro ao ler planilha .xlsx:', err)
      toast({
        title: 'Erro ao ler arquivo .xlsx',
        description: err.message || 'Verifique se o arquivo é um Excel válido exportado da Shopee.',
        variant: 'destructive',
      })
      setResultadoParse(null)
    } finally {
      setIsProcessandoArquivo(false)
    }
  }

  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setArquivoNome(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer
      if (buffer) {
        setBufferArquivo(buffer)
        processarArquivoBinario(buffer, file.name)
      }
    }
    reader.onerror = () => {
      toast({
        title: 'Falha na leitura',
        description: 'Não foi possível ler os bytes do arquivo selecionado.',
        variant: 'destructive',
      })
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDropArquivo = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (
      !file.name.endsWith('.xlsx') &&
      !file.name.endsWith('.xls') &&
      !file.name.endsWith('.csv')
    ) {
      toast({
        title: 'Formato inválido',
        description: 'Por favor arraste um arquivo .xlsx, .xls ou .csv da Shopee.',
        variant: 'destructive',
      })
      return
    }

    setArquivoNome(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer
      if (buffer) {
        setBufferArquivo(buffer)
        processarArquivoBinario(buffer, file.name)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // Recalcular com mapeamento customizado ajustado manualmente na interface
  const handleAtualizarMapeamento = (campo: keyof MapeamentoColunasShopee, novaColuna: string) => {
    const novoMap = {
      ...mapeamentoCustom,
      [campo]: novaColuna === '__vazio__' ? undefined : novaColuna,
    }
    setMapeamentoCustom(novoMap)

    if (bufferArquivo && arquivoNome) {
      processarArquivoBinario(bufferArquivo, arquivoNome, novoMap)
    }
  }

  // Análise da colagem de texto
  const handleAnalisarColagem = () => {
    if (!textoColado.trim()) {
      setResultadoParse(null)
      return
    }
    setRelatorioPosImportacao(null)
    const res = parseShopeeColagem(textoColado, catalogoProdutos, temas, modelos)
    setResultadoParse(res)
  }

  // Salvar no PocketBase com deduplicação por order_sn (cria se novo, atualiza se existente)
  const handleConfirmarImportacao = async () => {
    if (!resultadoParse || resultadoParse.itens.length === 0) return

    setSalvando(true)
    let criados = 0
    let atualizados = 0
    let problemas = 0
    const detalhesProblemas: Array<{ orderSn: string; motivo: string }> = []

    const hoje = new Date().toISOString().split('T')[0]

    // 1. Obter o registro oficial do marketplace Shopee no catálogo marketplaces (relação obrigatória)
    let shopeeMpId = ''
    try {
      const { marketplacesService } = await import('@/services/marketplaces')
      const allMps = await marketplacesService.listMarketplaces()
      const shopeeMp = allMps.find(
        (m) =>
          (m.slug || '').toLowerCase() === 'shopee' ||
          (m.nome || '').toLowerCase().includes('shopee'),
      )
      if (shopeeMp) {
        shopeeMpId = shopeeMp.id
      }
    } catch {
      /* intentionally ignored */
    }

    // Fallback: se não encontrou por service, busca direto
    if (!shopeeMpId) {
      try {
        const mpRec = await pb
          .collection('marketplaces')
          .getFirstListItem('slug="shopee" || nome ~ "Shopee"')
        shopeeMpId = mpRec.id
      } catch {
        /* intentionally ignored */
      }
    }

    // Obter tema padrão de fallback ('A Vincular' ou primeiro ativo)
    const temaFallback =
      temas.find((t) => normalizarTexto(t.nome) === 'a vincular')?.id ||
      temas.find((t) => t.ativo)?.id ||
      temas[0]?.id ||
      ''

    for (const item of resultadoParse.itens) {
      const orderSn = (item.shopeeOrderId || item.numeroPedido || '').trim()

      // Validação de problema estrutural
      if (item.problema) {
        problemas++
        detalhesProblemas.push({
          orderSn: orderSn || '(Sem ID)',
          motivo: item.problema,
        })
        continue
      }

      if (!orderSn) {
        problemas++
        detalhesProblemas.push({
          orderSn: '(Vazio)',
          motivo: 'Número do pedido / order_sn não informado na linha.',
        })
        continue
      }

      const temaParaUsar = item.temaId || temaFallback

      // Observações combinando comprador + vendedor + variação
      const obsPartes: string[] = []
      if (item.observacaoComprador) obsPartes.push(item.observacaoComprador)
      if (item.notaVendedor) obsPartes.push(`Nota do vendedor: ${item.notaVendedor}`)
      if (item.variacao) obsPartes.push(`Variação: ${item.variacao}`)
      const observacoesTexto = obsPartes.join(' | ')

      try {
        // Regra (3): Deduplicação por order_sn: se já existe, atualiza em vez de duplicar
        const pedidoExistente = await separacaoKitsService.getPedidoByOrderSnOuNumero(orderSn)

        if (pedidoExistente) {
          // Atualiza pedido existente com os novos dados
          await separacaoKitsService.updatePedido(pedidoExistente.id, {
            shopee_order_id: orderSn,
            numero_pedido: orderSn,
            codigo_rastreio: item.codigoRastreio || pedidoExistente.codigo_rastreio || '',
            produto_nome: item.produtoNome || pedidoExistente.produto_nome,
            sku: item.sku || pedidoExistente.sku,
            quantidade_total: item.quantidade,
            tema: temaParaUsar || pedidoExistente.tema,
            marketplace: shopeeMpId || pedidoExistente.marketplace,
            cliente_nome: item.clienteNome || pedidoExistente.cliente_nome || '',
            observacoes: observacoesTexto || pedidoExistente.observacoes || '',
            pedido_especial: item.pedidoEspecial || pedidoExistente.pedido_especial || '',
            tem_pedido_especial:
              Boolean(item.pedidoEspecial) || pedidoExistente.tem_pedido_especial,
            variacao_anuncio: item.variacao || pedidoExistente.variacao_anuncio || '',
            produto_referencia:
              item.produtoEncontrado?.id || pedidoExistente.produto_referencia || undefined,
          })
          atualizados++
        } else {
          // Cria novo pedido
          await separacaoKitsService.createPedido({
            numero_pedido: orderSn,
            shopee_order_id: orderSn,
            marketplace: shopeeMpId,
            produto_nome: item.produtoNome,
            sku: item.sku || '',
            tema: temaParaUsar,
            quantidade_total: item.quantidade,
            codigo_rastreio: item.codigoRastreio || '',
            tipo_composicao: item.temPedidoEspecial ? 'personalizada' : 'padrao',
            status_separacao: 'aguardando',
            cliente_nome: item.clienteNome || '',
            observacoes: observacoesTexto,
            pedido_especial: item.pedidoEspecial || '',
            tem_pedido_especial: item.temPedidoEspecial,
            triagem_pedido_especial: item.triagemPedidoEspecial,
            origem_pedido_especial:
              resultadoParse.origem === 'planilha_xlsx' ? 'colagem_shopee' : 'colagem_shopee',
            data_expedicao: hoje,
            variacao_anuncio: item.variacao || '',
            produto_referencia: item.produtoEncontrado?.id || undefined,
          })
          criados++
        }
      } catch (err: any) {
        console.error(`Erro ao importar pedido ${orderSn}:`, err)
        problemas++
        detalhesProblemas.push({
          orderSn,
          motivo: err?.message || 'Erro inesperado ao salvar no banco.',
        })
      }
    }

    setSalvando(false)
    const relatorio: RelatorioImportacaoShopee = {
      criados,
      atualizados,
      problemas,
      detalhesProblemas,
    }
    setRelatorioPosImportacao(relatorio)

    toast({
      title: 'Importação Concluída!',
      description: `${criados} criado(s), ${atualizados} atualizado(s), ${problemas} com problema.`,
      variant: problemas > 0 && criados === 0 && atualizados === 0 ? 'destructive' : 'default',
    })

    if (onImportadoSucesso) {
      onImportadoSucesso()
    }
  }

  // Preencher exemplo de teste para colagem
  const handleExemploShopee = () => {
    const exemplo = `241014ABCD01\tRMickeyMinnie-20\t20 Toalhas de Rosto e Mão Personalizada Mickey Mouse Minnie Mouse\tSortido 5 Modelos\t1\tMariana Costa\tCliente pediu apenas modelo 1 e 2 no chat\tBR241014RASTREIO01
241014ABCD02\tKIT-TOALHA-MONICA-30\tKit Toalha de Rosto Mônica 30 un\tPadrão\t1\tJuliana Rios\t\tBR241014RASTREIO02
241014ABCD03\tComboBLeveBBanhao\tCombo Toalha Leve + Toalha Banhão\tAzul/Branco\t2\tRicardo Alves\t\tBR241014RASTREIO03`
    setTextoColado(exemplo)
    const res = parseShopeeColagem(exemplo, catalogoProdutos, temas)
    setResultadoParse(res)
  }

  const colunasDetectadas = resultadoParse?.detalheMapeamento?.colunasDetectadas || []

  return (
    <Dialog open={open} onOpenChange={handleFechar}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-black text-foreground">
                Importação de Pedidos da Shopee
              </DialogTitle>
              <DialogDescription className="text-xs">
                Importe a planilha <strong>.xlsx</strong> exportada do Seller Centre
                (&ldquo;Exportar Pedidos a Enviar&rdquo;) ou cole os dados em texto.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Tabs
            value={tabAtiva}
            onValueChange={(v) => {
              setTabAtiva(v as 'planilha' | 'colagem')
              setResultadoParse(null)
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="planilha" className="font-bold text-xs">
                <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />
                Upload de Planilha .XLSX (Recomendado)
              </TabsTrigger>
              <TabsTrigger value="colagem" className="font-bold text-xs">
                <Upload className="mr-1.5 h-4 w-4" />
                Colar Texto / Tabela
              </TabsTrigger>
            </TabsList>

            {/* ABA 1: UPLOAD DE ARQUIVO .XLSX */}
            <TabsContent value="planilha" className="space-y-3 pt-2">
              <div
                onDragOver={handleDragOver}
                onDrop={handleDropArquivo}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center transition hover:border-primary hover:bg-primary/10"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleSelecionarArquivo}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm text-primary">
                    <FileUp className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-black text-foreground">
                    {arquivoNome ? (
                      <span className="text-primary font-bold">
                        Arquivo selecionado: {arquivoNome}
                      </span>
                    ) : (
                      'Arraste o arquivo .xlsx aqui ou clique para selecionar'
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Export do Seller Centre Shopee (&ldquo;Pedidos a Enviar&rdquo; ou &ldquo;Meus
                    Pedidos&rdquo;). O leitor detecta as colunas automaticamente.
                  </p>
                </div>
              </div>

              {isProcessandoArquivo && (
                <div className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  Lendo e estruturando dados da planilha...
                </div>
              )}
            </TabsContent>

            {/* ABA 2: COLAGEM DE TEXTO */}
            <TabsContent value="colagem" className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Formato flexível: Aceita cópia de tabela (Tab), CSV (; ou ,) ou texto livre com
                  ID, SKU e Qtd.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExemploShopee}
                  className="h-7 text-xs font-bold border-amber-300 bg-amber-50/60 text-amber-900 hover:bg-amber-100"
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  Preencher Exemplo
                </Button>
              </div>

              <Textarea
                value={textoColado}
                onChange={(e) => {
                  setTextoColado(e.target.value)
                  if (!e.target.value.trim()) {
                    setResultadoParse(null)
                  }
                }}
                onBlur={handleAnalisarColagem}
                placeholder={`Cole aqui as linhas do painel da Shopee...\nExemplo:\n241014ABCD01\tKIT-40-BLeve\tKit 40 Toalha Leve\tSortido\t40\tCliente Nome\tEscolha no chat: modelo 1 e 2`}
                className="min-h-[130px] font-mono text-xs"
              />

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAnalisarColagem}
                  disabled={!textoColado.trim()}
                  className="font-bold text-xs"
                >
                  Analisar Linhas Coladas
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* RELATÓRIO PÓS-IMPORTAÇÃO (REGRA 4) */}
          {relatorioPosImportacao && (
            <div className="rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-foreground">
                      Relatório Pós-Importação Shopee
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Resultado do processamento da planilha / colagem no sistema.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFechar(false)}
                  className="font-bold text-xs"
                >
                  Concluir e Fechar
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-3 text-center">
                  <span className="text-xs font-semibold text-emerald-800 uppercase block">
                    Criados
                  </span>
                  <span className="text-2xl font-black text-emerald-700">
                    {relatorioPosImportacao.criados}
                  </span>
                  <p className="text-[10px] text-emerald-600 mt-0.5">Novos pedidos cadastrados</p>
                </div>
                <div className="rounded-xl border border-blue-300 bg-blue-50/70 p-3 text-center">
                  <span className="text-xs font-semibold text-blue-800 uppercase block">
                    Atualizados
                  </span>
                  <span className="text-2xl font-black text-blue-700">
                    {relatorioPosImportacao.atualizados}
                  </span>
                  <p className="text-[10px] text-blue-600 mt-0.5">Deduplicados por order_sn</p>
                </div>
                <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-center">
                  <span className="text-xs font-semibold text-amber-800 uppercase block">
                    Com Problema
                  </span>
                  <span className="text-2xl font-black text-amber-700">
                    {relatorioPosImportacao.problemas}
                  </span>
                  <p className="text-[10px] text-amber-600 mt-0.5">Ilegíveis ou recusados</p>
                </div>
              </div>

              {relatorioPosImportacao.detalhesProblemas.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-1.5 text-xs">
                  <span className="font-bold text-amber-900 block">
                    Detalhe dos pedidos com problema:
                  </span>
                  <ul className="list-disc pl-4 space-y-1 text-amber-800">
                    {relatorioPosImportacao.detalhesProblemas.map((d, i) => (
                      <li key={i}>
                        <strong>{d.orderSn}</strong>: {d.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* AJUSTE MANUAL DE COLUNAS (EXPANSÍVEL QUANDO É PLANILHA) */}
          {resultadoParse && colunasDetectadas.length > 0 && (
            <div className="rounded-xl border border-border/80 bg-background/50 p-3">
              <div
                className="flex cursor-pointer items-center justify-between"
                onClick={() => setMostrarAjusteColunas(!mostrarAjusteColunas)}
              >
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold text-foreground">
                    Mapeamento de Colunas da Shopee
                  </span>
                  {resultadoParse.detalheMapeamento?.confianca && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold ${
                        resultadoParse.detalheMapeamento.confianca.numeroPedido &&
                        resultadoParse.detalheMapeamento.confianca.produtoNome
                          ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                          : 'border-amber-500 text-amber-700 bg-amber-50'
                      }`}
                    >
                      {resultadoParse.detalheMapeamento.confianca.numeroPedido &&
                      resultadoParse.detalheMapeamento.confianca.produtoNome
                        ? 'Auto-detectado com sucesso ✓'
                        : 'Revisão recomendada ⚠'}
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs font-semibold">
                  {mostrarAjusteColunas ? (
                    <>
                      Recolher <ChevronUp className="ml-1 h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Revisar / Ajustar <ChevronDown className="ml-1 h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>

              {mostrarAjusteColunas && (
                <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2 md:grid-cols-3">
                  {/* ID DO PEDIDO */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">ID do Pedido (Obrigatório):</Label>
                    <Select
                      value={mapeamentoCustom.numeroPedido || '__vazio__'}
                      onValueChange={(v) => handleAtualizarMapeamento('numeroPedido', v)}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__vazio__">(Não mapeado)</SelectItem>
                        {colunasDetectadas.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* SKU DO PRODUTO */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">SKU do Produto:</Label>
                    <Select
                      value={mapeamentoCustom.sku || '__vazio__'}
                      onValueChange={(v) => handleAtualizarMapeamento('sku', v)}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__vazio__">(Não mapeado)</SelectItem>
                        {colunasDetectadas.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* NOME DO PRODUTO */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Nome do Produto:</Label>
                    <Select
                      value={mapeamentoCustom.produtoNome || '__vazio__'}
                      onValueChange={(v) => handleAtualizarMapeamento('produtoNome', v)}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__vazio__">(Não mapeado)</SelectItem>
                        {colunasDetectadas.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* QUANTIDADE */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Quantidade:</Label>
                    <Select
                      value={mapeamentoCustom.quantidade || '__vazio__'}
                      onValueChange={(v) => handleAtualizarMapeamento('quantidade', v)}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__vazio__">(Não mapeado)</SelectItem>
                        {colunasDetectadas.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* VARIAÇÃO */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Nome da Variação:</Label>
                    <Select
                      value={mapeamentoCustom.variacao || '__vazio__'}
                      onValueChange={(v) => handleAtualizarMapeamento('variacao', v)}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__vazio__">(Não mapeado)</SelectItem>
                        {colunasDetectadas.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* COMPRADOR */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Nome do Comprador:</Label>
                    <Select
                      value={mapeamentoCustom.clienteNome || '__vazio__'}
                      onValueChange={(v) => handleAtualizarMapeamento('clienteNome', v)}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__vazio__">(Não mapeado)</SelectItem>
                        {colunasDetectadas.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* CÓDIGO DE RASTREIO */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Código de Rastreio / Tracking:</Label>
                    <Select
                      value={mapeamentoCustom.codigoRastreio || '__vazio__'}
                      onValueChange={(v) => handleAtualizarMapeamento('codigoRastreio', v)}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__vazio__">(Não mapeado)</SelectItem>
                        {colunasDetectadas.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* OBSERVAÇÃO / PEDIDO ESPECIAL */}
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px] font-bold">
                      Observação do Comprador (Pedido Especial):
                    </Label>
                    <Select
                      value={mapeamentoCustom.pedidoEspecial || '__vazio__'}
                      onValueChange={(v) => handleAtualizarMapeamento('pedidoEspecial', v)}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__vazio__">(Não mapeado)</SelectItem>
                        {colunasDetectadas.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* PRODUCT INFO (LISTA DE EMPACOTAMENTO) */}
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px] font-bold">
                      Product Info (Lista de Empacotamento / Formato Shopee):
                    </Label>
                    <Select
                      value={mapeamentoCustom.productInfo || '__vazio__'}
                      onValueChange={(v) => handleAtualizarMapeamento('productInfo', v)}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__vazio__">(Não mapeado)</SelectItem>
                        {colunasDetectadas.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* SELLER NOTE */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Nota do Vendedor (seller_note):</Label>
                    <Select
                      value={mapeamentoCustom.sellerNote || '__vazio__'}
                      onValueChange={(v) => handleAtualizarMapeamento('sellerNote', v)}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__vazio__">(Não mapeado)</SelectItem>
                        {colunasDetectadas.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PRÉVIA DOS ITENS PARSEADOS COM MATCHING DE KITS */}
          {resultadoParse && (
            <div className="space-y-3 rounded-2xl border-2 border-primary/20 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase text-foreground">
                    Itens Identificados ({resultadoParse.totalLinhas})
                  </span>
                  {resultadoParse.formatoDetectado === 'lista_empacotamento_product_info' && (
                    <Badge className="bg-blue-600 text-white text-[10px] font-bold">
                      📦 Lista de Empacotamento Shopee
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="border-emerald-500 bg-emerald-50 text-emerald-800 text-[10px] font-bold"
                  >
                    ✓ {resultadoParse.reconhecidosCount} no catálogo
                  </Badge>
                  {resultadoParse.genericosCount > 0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-500 bg-amber-50 text-amber-800 text-[10px] font-bold"
                    >
                      ⚠ {resultadoParse.genericosCount} genéricos
                    </Badge>
                  )}
                  {resultadoParse.pedidosEspeciaisCount > 0 && (
                    <Badge className="bg-primary text-white text-[10px] font-black uppercase">
                      ★ {resultadoParse.pedidosEspeciaisCount} pedido especial
                    </Badge>
                  )}
                  {resultadoParse.problemasCount > 0 && (
                    <Badge variant="destructive" className="text-[10px] font-black uppercase">
                      ✕ {resultadoParse.problemasCount} com problema
                    </Badge>
                  )}
                </div>

                <Badge variant="secondary" className="text-[10px] font-semibold">
                  Origem:{' '}
                  {resultadoParse.origem === 'planilha_xlsx'
                    ? 'Planilha .xlsx'
                    : 'Colagem de Texto'}
                </Badge>
              </div>

              <div className="divide-y divide-border/60 max-h-64 overflow-y-auto pr-1">
                {resultadoParse.itens.map((item, idx) => (
                  <div key={idx} className="py-2.5 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[11px] font-bold">
                          #{item.numeroPedido}
                        </Badge>
                        <span className="font-bold text-xs text-foreground">
                          {item.produtoNome}
                        </span>
                        {item.sku && (
                          <span className="text-[11px] text-muted-foreground">({item.sku})</span>
                        )}
                        {item.precoUnitario !== undefined && item.precoUnitario > 0 && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            R$ {item.precoUnitario.toFixed(2)} un
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.quantidadeDeduzidaPorKit && item.quantidadePlanilhaOriginal === 1 ? (
                          <Badge className="bg-emerald-600 text-white font-black text-xs">
                            {item.quantidade} un (deduzido de 1 kit)
                          </Badge>
                        ) : item.quantidadeDeduzidaPorKit &&
                          item.quantidadePlanilhaOriginal &&
                          item.quantidadePlanilhaOriginal > 1 ? (
                          <Badge className="bg-emerald-600 text-white font-black text-xs">
                            {item.quantidade} un ({item.quantidadePlanilhaOriginal} kits ×{' '}
                            {item.quantidadeDeduzidaPorKit})
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="font-black text-xs">
                            {item.quantidade} un
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {item.reconhecido ? (
                        <span className="inline-flex items-center text-emerald-700 font-semibold">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Kit/Produto reconhecido ({item.produtoEncontrado?.tipo})
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-amber-700 font-semibold">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Não reconhecido no catálogo prec_produtos (item genérico)
                        </span>
                      )}

                      {item.origemDeducaoQuantidade &&
                        item.origemDeducaoQuantidade !== 'planilha' && (
                          <Badge
                            variant="outline"
                            className="border-emerald-400 bg-emerald-50 text-emerald-800 text-[10px] font-bold"
                          >
                            ★ Qtd corrigida via{' '}
                            {item.origemDeducaoQuantidade === 'catalogo'
                              ? 'catálogo'
                              : item.origemDeducaoQuantidade === 'sku'
                                ? 'SKU'
                                : 'nome'}
                          </Badge>
                        )}

                      {item.codigoRastreio && (
                        <span className="text-primary font-bold">
                          Rastreio: <strong className="font-mono">{item.codigoRastreio}</strong>
                        </span>
                      )}

                      {item.variacao && (
                        <span className="text-muted-foreground">
                          Variação: <strong>{item.variacao}</strong>
                        </span>
                      )}

                      {item.clienteNome && (
                        <span className="text-muted-foreground">
                          Cliente: <strong>{item.clienteNome}</strong>
                        </span>
                      )}
                    </div>

                    {item.temPedidoEspecial && (
                      <div className="mt-1 rounded bg-amber-100/70 p-2 text-xs font-bold text-amber-950 border border-amber-300">
                        ★ Pedido Especial do Cliente: {item.pedidoEspecial}
                      </div>
                    )}

                    {item.problema && (
                      <div className="mt-1 rounded bg-red-100/80 p-2 text-xs font-bold text-red-900 border border-red-300">
                        ⚠ Problema: {item.problema}
                      </div>
                    )}

                    {item.itensEmpacotados && item.itensEmpacotados.length > 1 && (
                      <div className="mt-1 pl-2 border-l-2 border-primary/40 space-y-0.5 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          Subitens empacotados ({item.itensEmpacotados.length}):
                        </span>
                        {item.itensEmpacotados.map((sub, sIdx) => (
                          <div key={sIdx} className="flex items-center justify-between gap-2">
                            <span>
                              • {sub.quantidade}x {sub.nome} {sub.sku ? `(SKU: ${sub.sku})` : ''}{' '}
                              {sub.variacao ? `[${sub.variacao}]` : ''}
                            </span>
                            {sub.precoUnitario ? (
                              <span>R$ {sub.precoUnitario.toFixed(2)}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleFechar(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirmarImportacao}
            disabled={salvando || !resultadoParse || resultadoParse.itens.length === 0}
            className="bg-primary font-black text-white hover:bg-primary/90"
          >
            {salvando
              ? 'Importando...'
              : `Confirmar e Criar ${resultadoParse?.itens.length || 0} Itens na Expedição`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
