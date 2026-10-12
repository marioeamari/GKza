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
} from '@/lib/expedicaoShopeeParser'
import { separacaoKitsService } from '@/services/separacaoKits'
import type { PrecProdutoRecord } from '@/types/precificacao'
import type { KitTema } from '@/types/separacaoKits'

interface ImportarPedidosShopeeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalogoProdutos: PrecProdutoRecord[]
  temas: KitTema[]
  onImportadoSucesso?: () => void
}

export function ImportarPedidosShopeeModal({
  open,
  onOpenChange,
  catalogoProdutos,
  temas,
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

  // Limpa estados ao fechar ou reabrir
  const handleFechar = (aberto: boolean) => {
    if (!aberto) {
      setArquivoNome('')
      setBufferArquivo(null)
      setTextoColado('')
      setResultadoParse(null)
      setMostrarAjusteColunas(false)
      setMapeamentoCustom({})
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
      const res = parseShopeePlanilha(buffer, catalogoProdutos, temas, {
        nomeArquivo: nome,
        mapeamentoCustomizado: mapOverride || mapeamentoCustom,
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
        description: `${res.itens.length} pedido(s) identificado(s) no arquivo ${nome}.`,
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
    const res = parseShopeeColagem(textoColado, catalogoProdutos, temas)
    setResultadoParse(res)
  }

  // Salvar no PocketBase (criação / atualização com shopee_order_id garantido)
  const handleConfirmarImportacao = async () => {
    if (!resultadoParse || resultadoParse.itens.length === 0) return

    setSalvando(true)
    let criados = 0
    let falhas = 0

    const hoje = new Date().toISOString().split('T')[0]

    let shopeeMpId = 'shopee'
    try {
      const { marketplacesService } = await import('@/services/marketplaces')
      const allMps = await marketplacesService.listMarketplaces()
      const shopeeMp = allMps.find((m) => m.slug === 'shopee')
      if (shopeeMp) {
        shopeeMpId = shopeeMp.id
      }
    } catch {
      /* intentionally ignored */
    }

    for (const item of resultadoParse.itens) {
      try {
        const orderIdLimpo = item.numeroPedido || ''
        await separacaoKitsService.createPedido({
          numero_pedido: orderIdLimpo,
          marketplace: shopeeMpId,
          produto_nome: item.produtoNome,
          sku: item.sku || '',
          tema: item.temaId || temas[0]?.id || '',
          quantidade_total: item.quantidade,
          tipo_composicao: item.temPedidoEspecial ? 'personalizada' : 'padrao',
          status_separacao: 'aguardando',
          cliente_nome: item.clienteNome || '',
          observacoes: item.variacao ? `Variação: ${item.variacao}` : '',
          pedido_especial: item.pedidoEspecial || '',
          tem_pedido_especial: item.temPedidoEspecial,
          triagem_pedido_especial: item.triagemPedidoEspecial,
          origem_pedido_especial:
            resultadoParse.origem === 'planilha_xlsx' ? 'colagem_shopee' : 'colagem_shopee',
          data_expedicao: hoje,
          variacao_anuncio: item.variacao || '',
          produto_referencia: item.produtoEncontrado?.id || undefined,
          shopee_order_id: orderIdLimpo,
          codigo_rastreio: item.codigoRastreio || '',
        })
        criados++
      } catch (err: any) {
        console.warn(`Erro ao criar pedido ${item.numeroPedido}:`, err)
        // Se já existia, atualiza também a quantidade corrigida e o código de rastreio
        try {
          const existente = await separacaoKitsService.getPedidoByNumeroOuSku(item.numeroPedido)
          if (existente) {
            await separacaoKitsService.updatePedido(existente.id, {
              quantidade_total: item.quantidade,
              codigo_rastreio: item.codigoRastreio || existente.codigo_rastreio,
              pedido_especial: item.pedidoEspecial || existente.pedido_especial,
              tem_pedido_especial: Boolean(item.pedidoEspecial) || existente.tem_pedido_especial,
              shopee_order_id: item.numeroPedido,
              variacao_anuncio: item.variacao || existente.variacao_anuncio,
              cliente_nome: item.clienteNome || existente.cliente_nome,
              produto_referencia: item.produtoEncontrado?.id || existente.produto_referencia,
            })
            criados++
          } else {
            falhas++
          }
        } catch {
          falhas++
        }
      }
    }

    setSalvando(false)
    toast({
      title: 'Importação Concluída!',
      description: `${criados} pedido(s) processado(s) com sucesso na expedição.${falhas > 0 ? ` (${falhas} falharam)` : ''}`,
    })

    handleFechar(false)
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
