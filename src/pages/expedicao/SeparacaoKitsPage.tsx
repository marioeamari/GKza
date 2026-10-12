import { useEffect, useState, useRef } from 'react'
import {
  Barcode,
  Search,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ShoppingBag,
  Clock,
  Layers,
  ArrowRight,
  Boxes,
  SlidersHorizontal,
  History,
} from 'lucide-react'
import { ExpedicaoHeader } from '@/components/expedicao/ExpedicaoHeader'
import { ModeloSeparacaoCard } from '@/components/expedicao/ModeloSeparacaoCard'
import { ConsultaRapidaTab } from '@/components/expedicao/ConsultaRapidaTab'
import { CartaoPedidoEspecial } from '@/components/expedicao/CartaoPedidoEspecial'
import { ImportarPedidosShopeeModal } from '@/components/expedicao/ImportarPedidosShopeeModal'
import { MobileSubpagesMenu, MobileSubpageItem } from '@/components/MobileSubpagesMenu'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { separacaoKitsService } from '@/services/separacaoKits'
import { calcularComposicaoKit } from '@/lib/separacaoCalculo'
import type {
  KitTema,
  KitModelo,
  KitRegra,
  KitPedido,
  ResultadoComposicao,
  ItemSeparacaoCalculada,
} from '@/types/separacaoKits'

export default function SeparacaoKitsPage() {
  const { user } = useAuth()

  // Dados mestres
  const [temas, setTemas] = useState<KitTema[]>([])
  const [modelos, setModelos] = useState<KitModelo[]>([])
  const [regras, setRegras] = useState<KitRegra[]>([])
  const [loading, setLoading] = useState(true)

  // Estado da bipagem / busca
  const [modoConsulta, setModoConsulta] = useState<'id_pedido' | 'codigo_rastreio'>('id_pedido')
  const [buscaTermo, setBuscaTermo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Pedido ativo em separação
  const [pedidoAtivo, setPedidoAtivo] = useState<KitPedido | null>(null)
  const [resultadoComposicao, setResultadoComposicao] = useState<ResultadoComposicao | null>(null)
  const [itensSeparacao, setItensSeparacao] = useState<ItemSeparacaoCalculada[]>([])
  const [dataInicio, setDataInicio] = useState<string>('')
  const [finalizando, setFinalizando] = useState(false)
  const [finalizadoSucesso, setFinalizadoSucesso] = useState(false)

  // Catálogo e modal de importação
  const [catalogoProdutos, setCatalogoProdutos] = useState<any[]>([])
  const [modalImportarOpen, setModalImportarOpen] = useState(false)

  // Carrega dados iniciais
  const loadData = async () => {
    try {
      setLoading(true)
      const [temasData, modelosData, regrasData, prodsData] = await Promise.all([
        separacaoKitsService.getTemas(),
        separacaoKitsService.getModelos(),
        separacaoKitsService.getRegras(),
        (async () => {
          try {
            const { precificacaoService } = await import('@/services/precificacao')
            return await precificacaoService.listProdutos()
          } catch {
            return []
          }
        })(),
      ])
      setTemas(temasData)
      setModelos(modelosData)
      setRegras(regrasData)
      setCatalogoProdutos(prodsData)
    } catch (err) {
      console.error('Erro ao carregar dados de separação:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar a base de temas e modelos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Foco automático no campo de bipagem
  useEffect(() => {
    if (!pedidoAtivo && inputRef.current) {
      inputRef.current.focus()
    }
  }, [pedidoAtivo])

  // Processa a seleção ou busca de um pedido
  const handleCarregarPedido = async (
    termoParaBuscar: string,
    modoSobrescrito?: 'id_pedido' | 'codigo_rastreio',
  ) => {
    const q = termoParaBuscar.trim()
    if (!q) return

    const modo = modoSobrescrito || modoConsulta

    setBuscando(true)
    try {
      let pedido: KitPedido | null = null

      if (modo === 'codigo_rastreio') {
        pedido = await separacaoKitsService.getPedidoByCodigoRastreio(q)
      } else {
        pedido = await separacaoKitsService.getPedidoByNumeroOuSku(q)
      }

      if (!pedido) {
        toast({
          title: 'Pedido não encontrado',
          description:
            modo === 'codigo_rastreio'
              ? `Nenhum pedido localizado com o código de rastreio exato "${q}".`
              : `Nenhum pedido localizado com o número, shopee order ID ou SKU "${q}".`,
          variant: 'destructive',
        })
        return
      }

      iniciarFluxoPedido(pedido)
    } catch (err) {
      console.error('Erro ao buscar pedido:', err)
      toast({
        title: 'Erro na busca',
        description: 'Ocorreu uma falha ao buscar o pedido.',
        variant: 'destructive',
      })
    } finally {
      setBuscando(false)
    }
  }

  const iniciarFluxoPedido = (pedido: KitPedido) => {
    setPedidoAtivo(pedido)
    setFinalizadoSucesso(false)
    const agora = new Date().toISOString()
    setDataInicio(agora)

    // Se o pedido estava 'aguardando', atualiza para 'em_separacao'
    if (pedido.status_separacao === 'aguardando') {
      separacaoKitsService.registrarInicioSeparacao(pedido, user?.id, user?.name).catch(() => {})
    }

    // Identificar tema do pedido
    const tema = temas.find((t) => t.id === pedido.tema)
    const modelosDoTema = modelos.filter((m) => m.tema === pedido.tema)
    const regrasDoTema = regras.filter((r) => r.tema === pedido.tema)

    if (!tema) {
      toast({
        title: 'Tema não localizado',
        description: 'O tema vinculado a este pedido não foi encontrado.',
        variant: 'destructive',
      })
      return
    }

    const calc = calcularComposicaoKit({
      tema,
      modelos: modelosDoTema,
      quantidadeTotal: pedido.quantidade_total,
      regrasDoTema,
      pedidoPersonalizado: pedido.tipo_composicao === 'personalizada' ? pedido : null,
    })

    setResultadoComposicao(calc)
    setItensSeparacao(calc.itens.map((i) => ({ ...i, separado: false })))

    toast({
      title: 'Pedido carregado!',
      description: `Pedido #${pedido.numero_pedido} pronto para conferência.`,
    })
  }

  const handleBiparSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleCarregarPedido(buscaTermo)
  }

  const toggleModeloSeparado = (codigo: string) => {
    setItensSeparacao((prev) =>
      prev.map((item) => {
        if (item.codigo === codigo) {
          return { ...item, separado: !item.separado }
        }
        return item
      }),
    )
  }

  // Cálculos de progresso
  const totalModelosNecessarios = itensSeparacao.length
  const modelosSeparadosCount = itensSeparacao.filter((i) => i.separado).length

  const totalUnidadesNecessarias =
    resultadoComposicao?.totalGeral || pedidoAtivo?.quantidade_total || 0
  const unidadesSeparadasCount = itensSeparacao
    .filter((i) => i.separado)
    .reduce((acc, i) => acc + i.quantidade, 0)

  const todosSeparados =
    totalModelosNecessarios > 0 &&
    modelosSeparadosCount === totalModelosNecessarios &&
    unidadesSeparadasCount === totalUnidadesNecessarias

  const pctProgresso =
    totalUnidadesNecessarias > 0
      ? Math.min(100, Math.round((unidadesSeparadasCount / totalUnidadesNecessarias) * 100))
      : 0

  const handleFinalizarSeparacao = async () => {
    if (!pedidoAtivo || !resultadoComposicao || !todosSeparados) {
      toast({
        title: 'Separação incompleta',
        description: 'Todos os modelos e quantidades devem ser separados antes de finalizar.',
        variant: 'destructive',
      })
      return
    }

    setFinalizando(true)
    try {
      const temaAtual = temas.find((t) => t.id === pedidoAtivo.tema)

      await separacaoKitsService.finalizarSeparacao({
        pedidoId: pedidoAtivo.id,
        numeroPedido: pedidoAtivo.numero_pedido,
        marketplace: pedidoAtivo.marketplace,
        produtoNome: pedidoAtivo.produto_nome,
        sku: pedidoAtivo.sku,
        temaId: pedidoAtivo.tema,
        temaNome: temaAtual?.nome || '',
        quantidadeTotal: pedidoAtivo.quantidade_total,
        tipoComposicao: pedidoAtivo.tipo_composicao,
        regraOrigem: resultadoComposicao.origem,
        composicaoUtilizada: itensSeparacao,
        funcionarioId: user?.id,
        funcionarioNome: user?.name,
        dataInicio,
        pedidoEspecial: pedidoAtivo.pedido_especial,
        shopeeOrderId: pedidoAtivo.shopee_order_id || pedidoAtivo.numero_pedido,
        codigoRastreio: pedidoAtivo.codigo_rastreio || '',
      })

      setFinalizadoSucesso(true)
      toast({
        title: 'Separação Finalizada com Sucesso! ✓',
        description: `Pedido #${pedidoAtivo.numero_pedido} separado e conferido sem divergências.`,
      })
    } catch (err) {
      console.error('Erro ao finalizar separação:', err)
      toast({
        title: 'Erro ao registrar separação',
        description: 'Não foi possível salvar o histórico da separação.',
        variant: 'destructive',
      })
    } finally {
      setFinalizando(false)
    }
  }

  const handleNovoPedido = () => {
    setPedidoAtivo(null)
    setResultadoComposicao(null)
    setItensSeparacao([])
    setBuscaTermo('')
    setFinalizadoSucesso(false)
    setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
  }

  const temaDoPedido = temas.find((t) => t.id === pedidoAtivo?.tema)

  const subpaginasExpedicao: MobileSubpageItem[] = [
    {
      to: '/expedicao/separacao',
      label: 'Separação de Kits (Atual)',
      description: 'Bipagem e conferência operacional de kits',
      icon: Boxes,
    },
    {
      to: '/expedicao/temas-modelos',
      label: 'Temas e Modelos',
      description: 'Modelos e quantidades padrão por tema',
      icon: Layers,
    },
    {
      to: '/expedicao/regras',
      label: 'Regras de Composição',
      description: 'Cálculo analítico e parametrização',
      icon: SlidersHorizontal,
    },
    {
      to: '/expedicao/pedidos',
      label: 'Pedidos / Personalizações',
      description: 'Importações Shopee e pedidos especiais',
      icon: FileSpreadsheet,
    },
    {
      to: '/expedicao/historico',
      label: 'Histórico de Separação',
      description: 'Registro de kits já finalizados',
      icon: History,
    },
  ]

  return (
    <div className="space-y-6">
      <ExpedicaoHeader
        title="Expedição → Separação de Kits"
        description="Painel operacional com cálculo exato de modelos e checklist visual para empacotamento rápido."
      />

      {/* Menu Vertical de Subpáginas exclusivo Mobile na raiz da expedição */}
      <MobileSubpagesMenu
        titulo="Áreas da Expedição"
        descricao="Navegue entre as ferramentas do fluxo de separação:"
        subpaginas={subpaginasExpedicao}
      />

      <Tabs defaultValue="separacao" className="w-full">
        <TabsList className="mb-6 grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="separacao" className="font-bold">
            Bipar Pedido (Operação)
          </TabsTrigger>
          <TabsTrigger value="consulta" className="font-bold">
            Consulta Rápida / Treinamento
          </TabsTrigger>
        </TabsList>

        {/* ABA PRINCIPAL: BIPAGEM E SEPARAÇÃO */}
        <TabsContent value="separacao" className="space-y-6">
          {/* CAMPO GIGANTE DE BIPAGEM NO TOPO */}
          {!pedidoAtivo ? (
            <Card className="border-2 border-primary/30 bg-card shadow-sm transition hover:border-primary/60">
              <CardContent className="p-6 sm:p-8">
                <form onSubmit={handleBiparSubmit} className="space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Barcode className="h-6 w-6" />
                      </span>
                      <div>
                        <h2 className="text-lg font-black text-foreground">
                          Bipar etiqueta ou digitar número do pedido
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Selecione o modo de consulta abaixo para bipagem com leitor ou digitação
                        </p>
                      </div>
                    </div>

                    {/* SELETOR DE MODO DE CONSULTA (PEDIDO DO USUÁRIO) */}
                    <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-muted/40 p-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={modoConsulta === 'id_pedido' ? 'default' : 'ghost'}
                        onClick={() => {
                          setModoConsulta('id_pedido')
                          inputRef.current?.focus()
                        }}
                        className={cn(
                          'h-9 px-3 text-xs font-bold transition-all',
                          modoConsulta === 'id_pedido' && 'bg-primary text-white shadow-sm',
                        )}
                      >
                        ID do Pedido (Padrão)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={modoConsulta === 'codigo_rastreio' ? 'default' : 'ghost'}
                        onClick={() => {
                          setModoConsulta('codigo_rastreio')
                          inputRef.current?.focus()
                        }}
                        className={cn(
                          'h-9 px-3 text-xs font-bold transition-all',
                          modoConsulta === 'codigo_rastreio' &&
                            'bg-emerald-700 text-white shadow-sm',
                        )}
                      >
                        Código de Rastreio
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <Barcode className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={inputRef}
                        type="text"
                        value={buscaTermo}
                        onChange={(e) => setBuscaTermo(e.target.value)}
                        placeholder={
                          modoConsulta === 'codigo_rastreio'
                            ? 'Bipe ou digite o código de rastreio (ex: BR241014..., NL123456789BR)...'
                            : 'Bipe ou digite o ID do pedido, shopee order ID ou SKU (ex: 2610108R4K8K0C)...'
                        }
                        className={cn(
                          'h-16 pl-14 text-lg font-bold tracking-wider placeholder:text-muted-foreground/50 sm:text-xl transition-colors',
                          modoConsulta === 'codigo_rastreio' &&
                            'border-emerald-500/60 focus-visible:ring-emerald-500',
                        )}
                        autoFocus
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={buscando || !buscaTermo.trim()}
                      className={cn(
                        'h-16 px-8 text-base font-black text-white shadow-sm transition-colors',
                        modoConsulta === 'codigo_rastreio'
                          ? 'bg-emerald-700 hover:bg-emerald-800'
                          : 'bg-primary hover:bg-primary/90',
                      )}
                    >
                      {buscando ? (
                        'Buscando...'
                      ) : (
                        <>
                          <Search className="mr-2 h-5 w-5" />
                          {modoConsulta === 'codigo_rastreio' ? 'BUSCAR RASTREIO' : 'BUSCAR PEDIDO'}
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setModalImportarOpen(true)}
                      className="h-16 px-5 border-emerald-500/40 bg-emerald-50 text-emerald-900 font-bold hover:bg-emerald-100 shadow-sm"
                    >
                      <FileSpreadsheet className="mr-2 h-5 w-5 text-emerald-600" />
                      Importar .XLSX / Pedidos Shopee
                    </Button>
                  </div>

                  {/* Atalhos rápidos para testar imediatamente com os dados de exemplo */}
                  <div className="pt-2">
                    <span className="text-xs font-bold text-muted-foreground">
                      Exemplos rápidos cadastrados para teste:
                    </span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-semibold"
                        onClick={() => {
                          setBuscaTermo('123456789')
                          handleCarregarPedido('123456789')
                        }}
                      >
                        Pedido #123456789 (Mônica 30 un - Padrão)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-semibold border-amber-400 bg-amber-50/50 text-amber-900 hover:bg-amber-100"
                        onClick={() => {
                          setBuscaTermo('987654321')
                          handleCarregarPedido('987654321')
                        }}
                      >
                        ★ Pedido #987654321 (Mickey 50 un - Personalizado)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-semibold"
                        onClick={() => {
                          setBuscaTermo('SHP-456123')
                          handleCarregarPedido('SHP-456123')
                        }}
                      >
                        Pedido #SHP-456123 (Mickey 10 un - Regra Manual)
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            /* PEDIDO ATIVO CARREGADO */
            <div className="space-y-6">
              {/* CABEÇALHO DO PEDIDO IDENTIFICADO */}
              <div className="overflow-hidden rounded-2xl border-2 border-border/80 bg-card shadow-sm">
                {/* AVISO ULTRA DESTACADO SE FOR PEDIDO PERSONALIZADO */}
                {pedidoAtivo.tipo_composicao === 'personalizada' && (
                  <div className="flex items-center justify-between bg-amber-500 px-5 py-3 text-white shadow-inner animate-pulse">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-6 w-6 stroke-[2.5]" />
                      <span className="text-sm font-black tracking-wide uppercase sm:text-base">
                        ⚠️ ATENÇÃO: PEDIDO PERSONALIZADO — NÃO UTILIZAR DISTRIBUIÇÃO PADRÃO!
                      </span>
                    </div>
                    <Badge className="bg-white text-xs font-black text-amber-900">
                      ESCOLHA DO CLIENTE
                    </Badge>
                  </div>
                )}

                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Dados Básicos do Pedido */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-primary/40 bg-primary/10 px-3 py-1 text-sm font-black text-primary"
                        >
                          Pedido #{pedidoAtivo.numero_pedido}
                        </Badge>
                        {pedidoAtivo.marketplace && (
                          <Badge variant="secondary" className="px-2.5 py-0.5 font-bold">
                            {pedidoAtivo.marketplace}
                          </Badge>
                        )}
                        <Badge
                          variant={
                            pedidoAtivo.tipo_composicao === 'personalizada' ? 'default' : 'outline'
                          }
                          className={
                            pedidoAtivo.tipo_composicao === 'personalizada'
                              ? 'bg-amber-600 font-bold text-white'
                              : 'font-semibold'
                          }
                        >
                          Composição:{' '}
                          {pedidoAtivo.tipo_composicao === 'personalizada'
                            ? 'Personalizada'
                            : 'Padrão'}
                        </Badge>
                      </div>

                      <h2 className="text-xl font-black text-foreground sm:text-2xl">
                        {pedidoAtivo.produto_nome}
                      </h2>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {pedidoAtivo.sku && (
                          <span>
                            SKU: <strong className="text-foreground">{pedidoAtivo.sku}</strong>
                          </span>
                        )}
                        {pedidoAtivo.codigo_rastreio && (
                          <span className="text-primary font-bold">
                            Rastreio:{' '}
                            <strong className="font-mono text-foreground">
                              {pedidoAtivo.codigo_rastreio}
                            </strong>
                          </span>
                        )}
                        {temaDoPedido && (
                          <span>
                            Tema: <strong className="text-foreground">{temaDoPedido.nome}</strong>
                          </span>
                        )}
                        {pedidoAtivo.cliente_nome && (
                          <span>
                            Cliente:{' '}
                            <strong className="text-foreground">{pedidoAtivo.cliente_nome}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Destaque da Quantidade Total do Pedido */}
                    <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:px-6">
                      <ShoppingBag className="h-8 w-8 text-primary" />
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Quantidade Comprada
                        </div>
                        <div className="text-3xl font-black text-primary sm:text-4xl">
                          {pedidoAtivo.quantidade_total}{' '}
                          <span className="text-base font-bold text-foreground">unidades</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* NOVO CARTÃO ESTRUTURADO: PEDIDO ESPECIAL DO CLIENTE + ATALHOS SHOPEE */}
                  <div className="mt-5">
                    <CartaoPedidoEspecial
                      pedido={pedidoAtivo}
                      onAtualizarPedidoEspecial={async (novoTexto) => {
                        if (!pedidoAtivo) return
                        await separacaoKitsService.updatePedido(pedidoAtivo.id, {
                          pedido_especial: novoTexto,
                          tem_pedido_especial: Boolean(novoTexto.trim()),
                        })
                        setPedidoAtivo({
                          ...pedidoAtivo,
                          pedido_especial: novoTexto,
                          tem_pedido_especial: Boolean(novoTexto.trim()),
                        })
                      }}
                    />
                  </div>

                  {pedidoAtivo.observacoes && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs font-semibold text-amber-900">
                      <strong>Observação do cliente:</strong> {pedidoAtivo.observacoes}
                    </div>
                  )}
                  {/* Avisos do Cálculo */}
                  {resultadoComposicao?.avisos && resultadoComposicao.avisos.length > 0 && (
                    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
                      <ul className="list-inside list-disc space-y-1">
                        {resultadoComposicao.avisos.map((av, idx) => (
                          <li key={idx} className="font-medium">
                            {av}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* BARRA DE PROGRESSO E STATUS DE SEPARAÇÃO */}
                <div className="border-t border-border/80 bg-muted/30 p-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-foreground">
                          Separação: {unidadesSeparadasCount} / {totalUnidadesNecessarias} unidades
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          ({modelosSeparadosCount} de {totalModelosNecessarios} modelos concluídos)
                        </span>
                      </div>
                      <Progress value={pctProgresso} className="h-3 w-full sm:w-72" />
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleNovoPedido}
                        disabled={finalizando}
                        className="text-xs font-semibold"
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Trocar Pedido
                      </Button>

                      <Button
                        type="button"
                        size="lg"
                        disabled={!todosSeparados || finalizando || finalizadoSucesso}
                        onClick={handleFinalizarSeparacao}
                        className={cn(
                          'h-12 px-6 font-black text-white transition-all shadow-md',
                          todosSeparados
                            ? 'bg-emerald-600 hover:bg-emerald-700 animate-bounce'
                            : 'bg-muted-foreground/60 cursor-not-allowed',
                        )}
                      >
                        {finalizadoSucesso ? (
                          <>
                            <CheckCircle2 className="mr-2 h-5 w-5" />
                            PEDIDO FINALIZADO ✓
                          </>
                        ) : finalizando ? (
                          'Finalizando...'
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-5 w-5" />
                            FINALIZAR SEPARAÇÃO ({unidadesSeparadasCount}/{totalUnidadesNecessarias}
                            )
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* MENSAGEM DE SUCESSO APÓS FINALIZAR */}
              {finalizadoSucesso && (
                <Alert className="border-emerald-500 bg-emerald-50 p-6">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  <div className="ml-3">
                    <AlertTitle className="text-lg font-black text-emerald-900">
                      Separação Concluída e Registrada no Histórico!
                    </AlertTitle>
                    <AlertDescription className="mt-1 text-sm text-emerald-800">
                      O kit do Pedido #{pedidoAtivo.numero_pedido} foi totalmente conferido e já
                      pode seguir para empacotamento e expedição.
                    </AlertDescription>
                    <div className="mt-4">
                      <Button
                        type="button"
                        onClick={handleNovoPedido}
                        className="bg-emerald-700 font-bold text-white hover:bg-emerald-800"
                      >
                        Bipar Próximo Pedido <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Alert>
              )}

              {/* GRID OPERACIONAL DE MODELOS A SEPARAR */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-foreground">
                      Modelos para Pegar ({itensSeparacao.length} modelos)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Clique em cada card ou botão para confirmar que pegou a quantidade exata
                    </p>
                  </div>
                  <Badge variant="outline" className="font-bold text-xs">
                    Origem: {resultadoComposicao?.origem.toUpperCase()}
                  </Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {itensSeparacao.map((item) => (
                    <ModeloSeparacaoCard
                      key={item.codigo}
                      item={item}
                      onToggleSeparado={() => toggleModeloSeparado(item.codigo)}
                      disabled={finalizadoSucesso}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ABA DE CONSULTA RÁPIDA */}
        <TabsContent value="consulta">
          <ConsultaRapidaTab temas={temas} modelos={modelos} regras={regras} />
        </TabsContent>
      </Tabs>

      {/* MODAL DE IMPORTAÇÃO/COLAGEM SHOPEE */}
      <ImportarPedidosShopeeModal
        open={modalImportarOpen}
        onOpenChange={setModalImportarOpen}
        catalogoProdutos={catalogoProdutos}
        temas={temas}
        onImportadoSucesso={() => {
          loadData()
          toast({
            title: 'Expedição Atualizada',
            description: 'Os pedidos da Shopee já podem ser bipados pelo leitor ou código.',
          })
        }}
      />
    </div>
  )
}
