import { useEffect, useState } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  Search,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  ShoppingBag,
  ExternalLink,
  RefreshCw,
  CheckSquare,
  Square,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Link } from 'react-router-dom'
import { ExpedicaoHeader } from '@/components/expedicao/ExpedicaoHeader'
import { ImportarPedidosShopeeModal } from '@/components/expedicao/ImportarPedidosShopeeModal'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { toast } from '@/hooks/use-toast'
import { separacaoKitsService } from '@/services/separacaoKits'
import type {
  KitTema,
  KitModelo,
  KitPedido,
  ItemComposicaoModelo,
  TipoComposicaoPedido,
} from '@/types/separacaoKits'
import { cn } from '@/lib/utils'

export default function PedidosPersonalizadosPage() {
  const [pedidos, setPedidos] = useState<KitPedido[]>([])
  const [temas, setTemas] = useState<KitTema[]>([])
  const [modelos, setModelos] = useState<KitModelo[]>([])
  const [catalogoProdutos, setCatalogoProdutos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modal de importação Shopee
  const [importarModalOpen, setImportarModalOpen] = useState(false)

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'personalizados'>('todos')

  // Dialog Criar / Editar Pedido
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pedidoEditando, setPedidoEditando] = useState<KitPedido | null>(null)
  const [numeroPedido, setNumeroPedido] = useState('')
  const [marketplace, setMarketplace] = useState('Shopee')
  const [produtoNome, setProdutoNome] = useState('Kit Toalha de Rosto Personagens')
  const [sku, setSku] = useState('')
  const [temaId, setTemaId] = useState('')
  const [quantidadeTotal, setQuantidadeTotal] = useState<string>('30')
  const [tipoComposicao, setTipoComposicao] = useState<TipoComposicaoPedido>('padrao')
  const [clienteNome, setClienteNome] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [pedidoEspecial, setPedidoEspecial] = useState('')
  const [variacaoAnuncio, setVariacaoAnuncio] = useState('')
  const [shopeeOrderId, setShopeeOrderId] = useState('')
  const [codigoRastreio, setCodigoRastreio] = useState('')
  const [quantidadesPersonalizadas, setQuantidadesPersonalizadas] = useState<
    Record<string, number>
  >({})
  const [salvando, setSalvando] = useState(false)

  // Confirmação de exclusão
  const [pedidoParaExcluir, setPedidoParaExcluir] = useState<KitPedido | null>(null)

  // Seleção em massa de pedidos
  const [pedidosSelecionados, setPedidosSelecionados] = useState<string[]>([])
  const [excluindoMassa, setExcluindoMassa] = useState(false)
  const [dialogExclusaoMassaOpen, setDialogExclusaoMassaOpen] = useState(false)

  // Recálculo / Reprocessamento de quantidades
  const [recalculando, setRecalculando] = useState(false)

  const carregarDados = async () => {
    try {
      setLoading(true)
      const [temasData, modelosData, pedidosData, prodsData] = await Promise.all([
        separacaoKitsService.getTemas(),
        separacaoKitsService.getModelos(),
        separacaoKitsService.getPedidos({
          status: filtroStatus,
          search: busca,
          apenasPersonalizados: filtroTipo === 'personalizados',
        }),
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
      setPedidos(pedidosData)
      setCatalogoProdutos(prodsData)
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err)
      toast({
        title: 'Erro ao carregar pedidos',
        description: 'Não foi possível buscar a lista de pedidos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [filtroStatus, filtroTipo])

  // Modelos do tema selecionado no modal
  const modelosDoTemaForm = modelos.filter((m) => m.tema === temaId)

  // Validação estrita para pedidos personalizados
  const totalPedidoNum = parseInt(quantidadeTotal, 10) || 0
  const somaPersonalizada = Object.values(quantidadesPersonalizadas).reduce(
    (acc, q) => acc + (q || 0),
    0,
  )
  const validacaoPersonalizadaOk =
    tipoComposicao === 'padrao' || (totalPedidoNum > 0 && somaPersonalizada === totalPedidoNum)

  const abrirNovoPedido = (modoPersonalizado = false) => {
    setPedidoEditando(null)
    setNumeroPedido(String(Math.floor(100000000 + Math.random() * 900000000)))
    setMarketplace('Shopee')
    setProdutoNome('Kit Toalha de Rosto Personagens')
    setSku('KIT-TOALHA-30')
    const tId = temas[0]?.id || ''
    setTemaId(tId)
    setQuantidadeTotal(modoPersonalizado ? '50' : '30')
    setTipoComposicao(modoPersonalizado ? 'personalizada' : 'padrao')
    setClienteNome('')
    setObservacoes('')
    setPedidoEspecial('')
    setVariacaoAnuncio('')
    setShopeeOrderId('')
    setCodigoRastreio('')

    const initQtds: Record<string, number> = {}
    modelos
      .filter((m) => m.tema === tId)
      .forEach((m) => {
        initQtds[m.id] = 0
      })
    setQuantidadesPersonalizadas(initQtds)
    setDialogOpen(true)
  }

  const abrirEditarPedido = (p: KitPedido) => {
    setPedidoEditando(p)
    setNumeroPedido(p.numero_pedido)
    setMarketplace(p.marketplace || 'Shopee')
    setProdutoNome(p.produto_nome)
    setSku(p.sku || '')
    setTemaId(p.tema)
    setQuantidadeTotal(String(p.quantidade_total))
    setTipoComposicao(p.tipo_composicao)
    setClienteNome(p.cliente_nome || '')
    setObservacoes(p.observacoes || '')
    setPedidoEspecial(p.pedido_especial || '')
    setVariacaoAnuncio(p.variacao_anuncio || '')
    setShopeeOrderId(p.shopee_order_id || p.numero_pedido || '')
    setCodigoRastreio(p.codigo_rastreio || '')

    const initQtds: Record<string, number> = {}
    if (Array.isArray(p.composicao_personalizada)) {
      p.composicao_personalizada.forEach((item) => {
        if (item.modelo_id) {
          initQtds[item.modelo_id] = item.quantidade
        }
      })
    }
    setQuantidadesPersonalizadas(initQtds)
    setDialogOpen(true)
  }

  const handleTemaChangeModal = (novoTemaId: string) => {
    setTemaId(novoTemaId)
    const initQtds: Record<string, number> = {}
    modelos
      .filter((m) => m.tema === novoTemaId)
      .forEach((m) => {
        initQtds[m.id] = 0
      })
    setQuantidadesPersonalizadas(initQtds)
  }

  const handleQtdPersonalizadaChange = (modeloId: string, val: string) => {
    const v = Math.max(0, parseInt(val, 10) || 0)
    setQuantidadesPersonalizadas((prev) => ({
      ...prev,
      [modeloId]: v,
    }))
  }

  const salvarPedido = async (e: React.FormEvent) => {
    e.preventDefault()

    if (tipoComposicao === 'personalizada' && !validacaoPersonalizadaOk) {
      toast({
        title: 'Validação de Quantidade Personalizada',
        description: `A soma dos modelos escolhidos (${somaPersonalizada}) deve ser rigorosamente igual à quantidade total comprada (${totalPedidoNum}).`,
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      let compPersonalizada: ItemComposicaoModelo[] | undefined = undefined

      if (tipoComposicao === 'personalizada') {
        compPersonalizada = []
        for (const mod of modelosDoTemaForm) {
          const qtd = quantidadesPersonalizadas[mod.id] || 0
          if (qtd > 0) {
            compPersonalizada.push({
              modelo_id: mod.id,
              codigo: mod.codigo,
              nome: mod.nome,
              quantidade: qtd,
            })
          }
        }
      }

      const payload = {
        numero_pedido: numeroPedido.trim(),
        marketplace: marketplace.trim(),
        produto_nome: produtoNome.trim(),
        sku: sku.trim(),
        tema: temaId,
        quantidade_total: totalPedidoNum,
        tipo_composicao: tipoComposicao,
        composicao_personalizada: compPersonalizada,
        status_separacao: pedidoEditando
          ? pedidoEditando.status_separacao
          : ('aguardando' as const),
        cliente_nome: clienteNome.trim(),
        observacoes: observacoes.trim(),
        pedido_especial: pedidoEspecial.trim(),
        tem_pedido_especial: Boolean(pedidoEspecial.trim()),
        shopee_order_id: (shopeeOrderId || numeroPedido).trim(),
        variacao_anuncio: variacaoAnuncio.trim(),
        codigo_rastreio: codigoRastreio.trim(),
      }

      if (pedidoEditando) {
        await separacaoKitsService.updatePedido(pedidoEditando.id, payload)
        toast({ title: 'Pedido atualizado com sucesso!' })
      } else {
        await separacaoKitsService.createPedido(payload)
        toast({ title: 'Novo pedido registrado na expedição!' })
      }

      setDialogOpen(false)
      carregarDados()
    } catch (err) {
      console.error('Erro ao salvar pedido:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Verifique se o número do pedido não está duplicado.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const confirmarExclusao = async () => {
    if (!pedidoParaExcluir) return
    try {
      await separacaoKitsService.deletePedido(pedidoParaExcluir.id)
      toast({ title: 'Pedido excluído com sucesso' })
      setPedidosSelecionados((prev) => prev.filter((id) => id !== pedidoParaExcluir.id))
      setPedidoParaExcluir(null)
      carregarDados()
    } catch (err) {
      console.error('Erro ao excluir pedido:', err)
      toast({ title: 'Erro ao excluir pedido', variant: 'destructive' })
    }
  }

  // Ações de seleção em massa
  const todosIds = pedidos.map((p) => p.id)
  const todosSelecionados = pedidos.length > 0 && pedidosSelecionados.length === pedidos.length
  const algumSelecionado = pedidosSelecionados.length > 0 && !todosSelecionados

  const toggleSelecionarTodos = () => {
    if (todosSelecionados) {
      setPedidosSelecionados([])
    } else {
      setPedidosSelecionados(todosIds)
    }
  }

  const toggleSelecionarUm = (id: string) => {
    setPedidosSelecionados((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const confirmarExclusaoEmMassa = async () => {
    if (pedidosSelecionados.length === 0) return
    setExcluindoMassa(true)
    try {
      const res = await separacaoKitsService.deletePedidosEmMassa(pedidosSelecionados)
      toast({
        title: 'Exclusão em Massa Concluída',
        description: `${res.sucesso} pedido(s) excluído(s) com sucesso.${res.falhas > 0 ? ` (${res.falhas} falharam)` : ''}`,
      })
      setPedidosSelecionados([])
      setDialogExclusaoMassaOpen(false)
      carregarDados()
    } catch (err) {
      console.error('Erro ao excluir pedidos em massa:', err)
      toast({
        title: 'Erro na exclusão em massa',
        description: 'Não foi possível concluir a remoção de todos os pedidos selecionados.',
        variant: 'destructive',
      })
    } finally {
      setExcluindoMassa(false)
    }
  }

  // Reprocessamento de quantidades
  const handleRecalcularQuantidades = async () => {
    setRecalculando(true)
    try {
      const res = await separacaoKitsService.recalcularQuantidadesPedidos(catalogoProdutos)
      toast({
        title: 'Recálculo de Quantidades Concluído!',
        description: `${res.atualizados} pedido(s) corrigido(s) com a quantidade real do kit; ${res.inalterados} já estavam corretos.`,
      })
      carregarDados()
    } catch (err) {
      console.error('Erro ao recalcular quantidades:', err)
      toast({
        title: 'Erro no recálculo',
        description: 'Ocorreu uma falha ao reprocessar os pedidos existentes.',
        variant: 'destructive',
      })
    } finally {
      setRecalculando(false)
    }
  }

  return (
    <div className="space-y-6">
      <ExpedicaoHeader
        title="Pedidos / Personalizações"
        description="Gerenciamento de pedidos para conferência na expedição. Cadastre pedidos personalizados do chat/marketplace com validação rígida de soma."
      />

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por número, SKU, produto ou cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') carregarDados()
              }}
              className="pl-9 h-10"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-36 h-10 text-xs font-semibold">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Status</SelectItem>
                <SelectItem value="aguardando">Aguardando</SelectItem>
                <SelectItem value="em_separacao">Em Separação</SelectItem>
                <SelectItem value="finalizado">Finalizados</SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant={filtroTipo === 'personalizados' ? 'default' : 'outline'}
              size="sm"
              onClick={() =>
                setFiltroTipo((prev) => (prev === 'personalizados' ? 'todos' : 'personalizados'))
              }
              className={cn(
                'h-10 text-xs font-bold',
                filtroTipo === 'personalizados' && 'bg-amber-600 text-white hover:bg-amber-700',
              )}
            >
              ★ Apenas Personalizados
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão de Reprocessar / Recalcular Quantidades de Kits */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRecalcularQuantidades}
            disabled={recalculando || pedidos.length === 0}
            className="h-10 gap-1.5 border-emerald-500/50 bg-emerald-50 text-emerald-900 font-bold hover:bg-emerald-100"
            title="Recalcula a quantidade real dos pedidos pelo SKU/nome do kit caso tenham sido importados com 1 un"
          >
            <RefreshCw className={cn('h-4 w-4 text-emerald-700', recalculando && 'animate-spin')} />
            {recalculando ? 'Recalculando...' : 'Recalcular Quantidades dos Kits'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setImportarModalOpen(true)}
            className="h-10 gap-1.5 border-primary/40 bg-orange-50 text-primary font-bold hover:bg-orange-100"
          >
            <FileSpreadsheet className="h-4 w-4" /> Colar / Importar Shopee
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => abrirNovoPedido(true)}
            className="h-10 gap-1.5 border-amber-400 bg-amber-50 text-amber-900 font-bold hover:bg-amber-100"
          >
            ★ Pedido Personalizado
          </Button>

          <Button
            type="button"
            onClick={() => abrirNovoPedido(false)}
            className="h-10 gap-1.5 bg-primary font-bold text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Novo Pedido
          </Button>
        </div>
      </div>

      {/* BARRA DE AÇÕES EM MASSA (QUANDO HOUVER SELEÇÃO) */}
      {pedidosSelecionados.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-destructive/40 bg-destructive/10 p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Badge className="bg-destructive text-white font-bold text-xs">
              {pedidosSelecionados.length} selecionado(s)
            </Badge>
            <span className="text-xs font-semibold text-destructive">
              Ações disponíveis para os pedidos marcados:
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPedidosSelecionados([])}
              className="h-8 text-xs font-semibold"
            >
              Desmarcar Todos
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDialogExclusaoMassaOpen(true)}
              className="h-8 gap-1.5 text-xs font-bold"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir Selecionados ({pedidosSelecionados.length})
            </Button>
          </div>
        </div>
      )}

      {/* LISTA DE PEDIDOS */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* CHECKBOX NO CABEÇALHO PARA SELEÇÃO DE TODOS OS PEDIDOS (PEDIDO DO USUÁRIO) */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="selecionarTodosPedidos"
                  checked={todosSelecionados ? true : algumSelecionado ? 'indeterminate' : false}
                  onCheckedChange={toggleSelecionarTodos}
                  aria-label="Selecionar todos os pedidos"
                  className="data-[state=checked]:bg-primary"
                />
                <Label
                  htmlFor="selecionarTodosPedidos"
                  className="cursor-pointer text-xs font-bold text-foreground select-none"
                >
                  Selecionar Todos ({pedidos.length})
                </Label>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              {pedidosSelecionados.length > 0 ? (
                <strong className="text-foreground">
                  {pedidosSelecionados.length} de {pedidos.length} selecionado(s)
                </strong>
              ) : (
                `${pedidos.length} pedido(s) listado(s)`
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pedidos.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nenhum pedido encontrado com os filtros selecionados.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {pedidos.map((p) => {
                const temaDoPedido = temas.find((t) => t.id === p.tema)
                const isPersonalizado = p.tipo_composicao === 'personalizada'
                const isFinalizado = p.status_separacao === 'finalizado'
                const isSelecionado = pedidosSelecionados.includes(p.id)

                return (
                  <div
                    key={p.id}
                    className={cn(
                      'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between transition',
                      isSelecionado && 'bg-primary/5 border-l-4 border-l-primary',
                      !isSelecionado && isPersonalizado && 'bg-amber-50/30 hover:bg-amber-50/60',
                      !isSelecionado && !isPersonalizado && 'hover:bg-muted/30',
                    )}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* CHECKBOX INDIVIDUAL DO PEDIDO */}
                      <div className="pt-1">
                        <Checkbox
                          checked={isSelecionado}
                          onCheckedChange={() => toggleSelecionarUm(p.id)}
                          aria-label={`Selecionar pedido ${p.numero_pedido}`}
                        />
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-primary/40 bg-primary/10 text-xs font-black text-primary"
                          >
                            #{p.numero_pedido}
                          </Badge>
                          {p.marketplace && (
                            <Badge variant="secondary" className="text-[11px] font-bold">
                              {p.marketplace}
                            </Badge>
                          )}
                          <Badge
                            className={cn(
                              'text-[10px] font-black uppercase',
                              isPersonalizado
                                ? 'bg-amber-600 text-white'
                                : 'bg-muted text-foreground',
                            )}
                          >
                            {isPersonalizado ? '★ Personalizado' : 'Padrão'}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] font-bold',
                              p.status_separacao === 'aguardando' &&
                                'border-amber-400 text-amber-800 bg-amber-50',
                              p.status_separacao === 'em_separacao' &&
                                'border-blue-400 text-blue-800 bg-blue-50',
                              p.status_separacao === 'finalizado' &&
                                'border-emerald-500 text-emerald-800 bg-emerald-50',
                            )}
                          >
                            {p.status_separacao === 'aguardando' && 'Aguardando Bipagem'}
                            {p.status_separacao === 'em_separacao' && 'Em Separação'}
                            {p.status_separacao === 'finalizado' && 'Finalizado'}
                          </Badge>
                        </div>

                        <h4 className="text-sm font-black text-foreground truncate">
                          {p.produto_nome}
                        </h4>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {p.sku && (
                            <span>
                              SKU: <strong>{p.sku}</strong>
                            </span>
                          )}
                          {temaDoPedido && (
                            <span>
                              Tema: <strong>{temaDoPedido.nome}</strong>
                            </span>
                          )}
                          {p.cliente_nome && (
                            <span>
                              Cliente: <strong>{p.cliente_nome}</strong>
                            </span>
                          )}
                          <span className="font-bold text-foreground">
                            Total: {p.quantidade_total} un
                          </span>
                          {p.codigo_rastreio && (
                            <span className="text-primary font-bold">
                              Rastreio: <strong className="font-mono">{p.codigo_rastreio}</strong>
                            </span>
                          )}
                        </div>

                        {/* Pedido especial do cliente em destaque */}
                        {p.pedido_especial && (
                          <div className="mt-1 rounded-lg border border-amber-300 bg-amber-100/80 px-2.5 py-1 text-xs font-black text-amber-950">
                            ★ Pedido especial: {p.pedido_especial}
                          </div>
                        )}

                        {/* Modelos personalizados resumidos */}
                        {isPersonalizado && Array.isArray(p.composicao_personalizada) && (
                          <div className="mt-1 flex flex-wrap gap-1.5 pt-1">
                            {p.composicao_personalizada.map((item, idx) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="border-amber-400 bg-white text-[10px] font-bold text-amber-900"
                              >
                                {item.codigo}: {item.quantidade} un
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => abrirEditarPedido(p)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive/80 hover:text-destructive"
                        onClick={() => setPedidoParaExcluir(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIALOG DE CRIAR / EDITAR PEDIDO */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-bold">
              {pedidoEditando ? 'Editar Pedido' : 'Cadastrar Pedido para Expedição'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={salvarPedido} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="pedNum">Número do Pedido *</Label>
                <Input
                  id="pedNum"
                  value={numeroPedido}
                  onChange={(e) => setNumeroPedido(e.target.value)}
                  placeholder="Ex: 123456789"
                  required
                  className="font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pedMarketplace">Marketplace</Label>
                <Select value={marketplace} onValueChange={setMarketplace}>
                  <SelectTrigger id="pedMarketplace">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Shopee">Shopee</SelectItem>
                    <SelectItem value="Mercado Livre">Mercado Livre</SelectItem>
                    <SelectItem value="Amazon">Amazon</SelectItem>
                    <SelectItem value="Magalu">Magazine Luiza</SelectItem>
                    <SelectItem value="Site Próprio">Site Próprio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pedSku">SKU</Label>
                <Input
                  id="pedSku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Ex: KIT-MONICA-30"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pedProd">Nome do Produto *</Label>
                <Input
                  id="pedProd"
                  value={produtoNome}
                  onChange={(e) => setProdutoNome(e.target.value)}
                  placeholder="Ex: Kit Toalha de Rosto Personagens"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pedCli">Nome do Cliente</Label>
                <Input
                  id="pedCli"
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  placeholder="Ex: Maria Oliveira"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pedTema">Tema do Produto *</Label>
                <Select value={temaId} onValueChange={handleTemaChangeModal}>
                  <SelectTrigger id="pedTema" className="font-semibold">
                    <SelectValue placeholder="Selecione um tema..." />
                  </SelectTrigger>
                  <SelectContent>
                    {temas.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pedQtd">Quantidade Total Comprada *</Label>
                <Input
                  id="pedQtd"
                  type="number"
                  min="1"
                  step="1"
                  value={quantidadeTotal}
                  onChange={(e) => setQuantidadeTotal(e.target.value)}
                  placeholder="Ex: 30, 50..."
                  required
                  className="font-bold text-base"
                />
              </div>
            </div>

            {/* SELEÇÃO DO TIPO DE COMPOSIÇÃO: PADRÃO VS PERSONALIZADA */}
            <div className="rounded-xl border p-3.5 space-y-2 bg-muted/20">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Tipo de Composição
              </Label>
              <RadioGroup
                value={tipoComposicao}
                onValueChange={(val) => setTipoComposicao(val as TipoComposicaoPedido)}
                className="grid grid-cols-2 gap-3"
              >
                <div
                  className={cn(
                    'flex items-center space-x-2 rounded-lg border p-3 cursor-pointer',
                    tipoComposicao === 'padrao'
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card',
                  )}
                >
                  <RadioGroupItem value="padrao" id="compPadrao" />
                  <Label htmlFor="compPadrao" className="font-bold cursor-pointer">
                    Padrão (Automática / Regra Manual)
                  </Label>
                </div>

                <div
                  className={cn(
                    'flex items-center space-x-2 rounded-lg border p-3 cursor-pointer',
                    tipoComposicao === 'personalizada'
                      ? 'border-amber-500 bg-amber-50 text-amber-950 font-bold'
                      : 'border-border bg-card',
                  )}
                >
                  <RadioGroupItem value="personalizada" id="compPers" />
                  <Label htmlFor="compPers" className="font-bold cursor-pointer">
                    ★ Personalizada pelo Cliente
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* SE FOR PERSONALIZADA: TABELA COM QUANTIDADE POR MODELO E VALIDAÇÃO DE SOMA */}
            {tipoComposicao === 'personalizada' && (
              <div className="space-y-3 rounded-2xl border-2 border-amber-400 bg-amber-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-amber-950">
                      Seleção de Modelos Escolhidos pelo Cliente
                    </h4>
                    <p className="text-xs text-amber-900">
                      Informe apenas as quantidades dos modelos solicitados pelo cliente.
                    </p>
                  </div>

                  {/* Validador ao vivo */}
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-black border',
                      validacaoPersonalizadaOk
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300',
                    )}
                  >
                    {validacaoPersonalizadaOk ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-600" />
                    )}
                    <span>
                      {somaPersonalizada} / {totalPedidoNum} un
                    </span>
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">
                  {modelosDoTemaForm.map((mod) => {
                    const qtd = quantidadesPersonalizadas[mod.id] ?? 0
                    return (
                      <div
                        key={mod.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-2.5"
                      >
                        <span className="font-bold text-xs text-foreground truncate">
                          {mod.codigo} — {mod.nome} {!mod.ativo && '(Inativo)'}
                        </span>
                        <div className="w-24">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={qtd}
                            onChange={(e) => handleQtdPersonalizadaChange(mod.id, e.target.value)}
                            className="h-8 text-center font-bold"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="rounded-xl border-2 border-primary/30 bg-orange-50/50 p-3 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pedEsp" className="text-xs font-black uppercase text-primary">
                  ★ Pedido Especial do Cliente (Destaque na Bipagem)
                </Label>
                <Input
                  id="pedEsp"
                  value={pedidoEspecial}
                  onChange={(e) => setPedidoEspecial(e.target.value)}
                  placeholder="Ex: Cliente escolheu modelos 1 e 4 no chat Shopee"
                  className="font-bold text-sm bg-white"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="pedVar" className="text-xs">
                    Variação do anúncio original
                  </Label>
                  <Input
                    id="pedVar"
                    value={variacaoAnuncio}
                    onChange={(e) => setVariacaoAnuncio(e.target.value)}
                    placeholder="Ex: Sortido 5 modelos"
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pedShpId" className="text-xs">
                    ID do Pedido Shopee (Webchat)
                  </Label>
                  <Input
                    id="pedShpId"
                    value={shopeeOrderId}
                    onChange={(e) => setShopeeOrderId(e.target.value)}
                    placeholder="Ex: 241014ABCD99"
                    className="bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pedRastreio" className="text-xs font-bold text-foreground">
                  Código de Rastreio (Transportadora / Shopee)
                </Label>
                <Input
                  id="pedRastreio"
                  value={codigoRastreio}
                  onChange={(e) => setCodigoRastreio(e.target.value)}
                  placeholder="Ex: BR241014ABCD99, NL123456789BR..."
                  className="bg-white font-mono text-xs font-bold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pedObs">Observações Gerais</Label>
              <Input
                id="pedObs"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Outras notas operacionais"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  salvando || (tipoComposicao === 'personalizada' && !validacaoPersonalizadaOk)
                }
                className="bg-primary font-bold text-white hover:bg-primary/90"
              >
                {salvando ? 'Salvando...' : 'Salvar Pedido'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAÇÃO DE EXCLUSÃO INDIVIDUAL */}
      <AlertDialog
        open={Boolean(pedidoParaExcluir)}
        onOpenChange={(op) => !op && setPedidoParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold text-destructive">
              Excluir Pedido da Expedição
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente remover o pedido <strong>#{pedidoParaExcluir?.numero_pedido}</strong>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRMAÇÃO DE EXCLUSÃO EM MASSA (PEDIDO DO USUÁRIO) */}
      <AlertDialog open={dialogExclusaoMassaOpen} onOpenChange={setDialogExclusaoMassaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Excluir {pedidosSelecionados.length} Pedido(s) em Massa
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Tem certeza que deseja remover <strong>{pedidosSelecionados.length}</strong>{' '}
                pedido(s) da fila de expedição?
              </p>
              <p className="text-xs text-muted-foreground">
                Esta ação é definitiva e removerá os pedidos selecionados do banco de dados.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoMassa}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusaoEmMassa}
              disabled={excluindoMassa}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
            >
              {excluindoMassa
                ? 'Excluindo...'
                : `Sim, Excluir ${pedidosSelecionados.length} Pedido(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MODAL DE IMPORTAÇÃO SHOPEE */}
      <ImportarPedidosShopeeModal
        open={importarModalOpen}
        onOpenChange={setImportarModalOpen}
        catalogoProdutos={catalogoProdutos}
        temas={temas}
        onImportadoSucesso={() => carregarDados()}
      />
    </div>
  )
}
