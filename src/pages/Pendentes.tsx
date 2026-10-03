import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Image as ImageIcon,
  Inbox,
  Landmark,
  Layers,
  LoaderCircle,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState, LoadingState } from '@/components/LoadingState'
import { PageHeader } from '@/components/PageHeader'
import { TriagemPendenteDialog } from '@/components/TriagemPendenteDialog'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { formatCurrency, formatDate } from '@/lib/format'
import { getFileUrl } from '@/lib/pocketbase/files'
import { can } from '@/lib/permissions'
import pb from '@/lib/pocketbase/client'
import { cadastrosService } from '@/services/cadastros'
import { despesasService } from '@/services/despesas'
import { financeService } from '@/services/finance'
import { pluggyService } from '@/services/pluggy'
import { telegramPendentesService } from '@/services/telegramPendentes'
import type {
  Categoria,
  Conta,
  Empresa,
  MetodoPagamento,
  Pessoa,
  TagItem,
  TelegramRegistroPendente,
  TipoDespesa,
  TipoDizimo,
} from '@/types/domain'

export default function Pendentes() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { activeContext } = useAppContext()

  const [pendentes, setPendentes] = useState<TelegramRegistroPendente[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'all' | 'receita' | 'despesa'>('all')
  const [filtroOrigem, setFiltroOrigem] = useState<'all' | 'telegram' | 'open_finance' | 'pwa'>(
    'all',
  )
  const [syncingPluggy, setSyncingPluggy] = useState(false)

  // Dados auxiliares para o formulário de triagem
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [tags, setTags] = useState<TagItem[]>([])
  const [tiposDespesa, setTiposDespesa] = useState<TipoDespesa[]>([])
  const [metodosPagamento, setMetodosPagamento] = useState<MetodoPagamento[]>([])
  const [tiposDizimo, setTiposDizimo] = useState<TipoDizimo[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])

  // Diálogos
  const [itemParaTriar, setItemParaTriar] = useState<TelegramRegistroPendente | null>(null)
  const [dialogTriagem, setDialogTriagem] = useState(false)
  const [itemParaDescartar, setItemParaDescartar] = useState<TelegramRegistroPendente | null>(null)
  const [descartando, setDescartando] = useState(false)
  const [fotoVisualizar, setFotoVisualizar] = useState<string | null>(null)

  const canEdit = can(user?.role, 'writeFinance')

  const loadPendentes = useCallback(async () => {
    setLoading(true)
    try {
      const items = await telegramPendentesService.listPendentes()
      setPendentes(items)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao buscar pendentes',
        description: apiMessage(err),
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  const handleSyncOpenFinance = async () => {
    try {
      setSyncingPluggy(true)
      const res = await pluggyService.syncItem()
      toast({
        title: 'Sincronização Open Finance realizada!',
        description: `${res.imported_pendentes} novas transações importadas para triagem (${res.skipped_duplicates} duplicadas ignoradas).`,
      })
      await loadPendentes()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Falha na sincronização Open Finance',
        description: apiMessage(err),
      })
    } finally {
      setSyncingPluggy(false)
    }
  }

  useEffect(() => {
    loadPendentes()

    // Carrega entidades auxiliares para alimentar a triagem
    Promise.all([
      financeService.listContas(),
      financeService.listCategorias(),
      cadastrosService.listEmpresas(),
      cadastrosService.listPessoas(),
      despesasService.listTags().catch(() => []),
      despesasService.listTiposDespesa().catch(() => []),
      despesasService.listMetodosPagamento().catch(() => []),
      despesasService.listTiposDizimo().catch(() => []),
    ])
      .then(([cList, catList, empList, pessList, tList, tdList, mpList, dizList]) => {
        setContas(cList)
        setCategorias(catList)
        setEmpresas(empList)
        setPessoas(pessList)
        setTags(tList)
        setTiposDespesa(tdList)
        setMetodosPagamento(mpList)
        setTiposDizimo(dizList)
      })
      .catch(() => {})

    // Subscrição em tempo real para atualizações na coleção de pendentes
    let active = true
    let unsubscribeFn: (() => Promise<void>) | undefined

    pb.collection('telegram_registros_pendentes')
      .subscribe('*', (e) => {
        if (e.action === 'create' || e.action === 'update' || e.action === 'delete') {
          if (active) loadPendentes()
        }
      })
      .then((unsub) => {
        if (!active) {
          unsub().catch(() => {})
        } else {
          unsubscribeFn = unsub
        }
      })
      .catch(() => {})

    return () => {
      active = false
      if (unsubscribeFn) {
        unsubscribeFn().catch(() => {})
      }
    }
  }, [loadPendentes])

  // Descartar registro pendente
  const handleConfirmarDescarte = async () => {
    if (!itemParaDescartar) return
    setDescartando(true)
    try {
      await telegramPendentesService.descartarPendente(itemParaDescartar.id)
      setPendentes((current) => current.filter((i) => i.id !== itemParaDescartar.id))
      toast({
        title: 'Registro descartado com sucesso',
        description: 'O comprovante foi removido da lista de pendentes.',
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao descartar',
        description: apiMessage(err),
      })
    } finally {
      setDescartando(false)
      setItemParaDescartar(null)
    }
  }

  // Filtragem local por texto, tipo e origem
  const filteredPendentes = pendentes.filter((item) => {
    if (filtroTipo !== 'all' && item.tipo !== filtroTipo) return false
    if (filtroOrigem !== 'all') {
      const isOF = item.origem_tipo === 'open_finance' || item.external_id?.startsWith('pluggy_')
      const isPWA = item.origem_tipo === 'pwa'
      if (filtroOrigem === 'open_finance' && !isOF) return false
      if (filtroOrigem === 'pwa' && !isPWA) return false
      if (filtroOrigem === 'telegram' && (isOF || isPWA)) return false
    }
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      item.descricao?.toLowerCase().includes(term) ||
      item.comprovante_texto?.toLowerCase().includes(term) ||
      item.contexto_nome?.toLowerCase().includes(term) ||
      item.banco_nome?.toLowerCase().includes(term) ||
      item.expand?.conta?.nome?.toLowerCase().includes(term) ||
      item.expand?.categoria?.nome?.toLowerCase().includes(term)
    )
  })

  return (
    <>
      <PageHeader
        title="Triagem de Comprovantes & Open Finance"
        description="Transações do Open Finance e comprovantes do Telegram aguardando definição de destino: Lançamento de Caixa ou Despesa Recorrente."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncOpenFinance}
              disabled={syncingPluggy || loading}
              className="font-bold text-xs"
              title="Buscar transações recentes de bancos conectados"
            >
              <Landmark className="mr-1.5 h-3.5 w-3.5 text-primary" />
              {syncingPluggy ? 'Sincronizando...' : 'Puxar Open Finance'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadPendentes}
              disabled={loading}
              className="font-bold text-xs"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar lista
            </Button>
          </div>
        }
      />

      {/* Banner explicativo do fluxo */}
      <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-soft">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Destino flexível definido por você na plataforma
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tanto os comprovantes enviados no Telegram quanto as transações conectadas pelo{' '}
              <strong className="text-foreground">Open Finance (Pluggy)</strong> entram nesta mesma
              esteira de triagem. Nada entra direto no caixa: você escolhe se o item vira um{' '}
              <strong className="text-foreground">Lançamento de Caixa</strong> (/lancamentos), uma{' '}
              <strong className="text-foreground">Despesa Recorrente</strong> (/despesas) ou{' '}
              <strong className="text-foreground">Ambos</strong>.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild className="h-8 text-xs font-bold">
              <Link to="/lancamentos">
                <BadgeDollarSign className="mr-1 h-3.5 w-3.5 text-primary" />
                Ir ao Caixa
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="h-8 text-xs font-bold">
              <Link to="/despesas">
                <Receipt className="mr-1 h-3.5 w-3.5 text-primary" />
                Ir a Despesas
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="mb-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por descrição, texto ou contexto..."
            className="pl-9 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={filtroOrigem}
            onValueChange={(v) => setFiltroOrigem(v as 'all' | 'telegram' | 'open_finance' | 'pwa')}
          >
            <SelectTrigger className="w-[170px] bg-white">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value="open_finance">🏦 Open Finance</SelectItem>
              <SelectItem value="telegram">💬 Telegram</SelectItem>
              <SelectItem value="pwa">⚡ PWA / Móvel</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filtroTipo}
            onValueChange={(v) => setFiltroTipo(v as 'all' | 'receita' | 'despesa')}
          >
            <SelectTrigger className="w-[150px] bg-white">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="despesa">🔴 Despesas</SelectItem>
              <SelectItem value="receita">🟢 Receitas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista de Registros Pendentes */}
      {loading ? (
        <LoadingState />
      ) : filteredPendentes.length === 0 ? (
        <EmptyState
          title={
            pendentes.length === 0
              ? 'Nenhum comprovante pendente'
              : 'Nenhum resultado para os filtros'
          }
          description={
            pendentes.length === 0
              ? 'Tudo em dia! Quando você ou sua equipe enviarem comprovantes pelo Telegram e confirmarem no chat, eles aparecerão aqui para triagem.'
              : 'Tente alterar os termos de busca ou remover os filtros aplicados.'
          }
          action={
            pendentes.length === 0 ? (
              <Button variant="outline" asChild className="font-bold">
                <Link to="/lancamentos">
                  <Inbox className="mr-2 h-4 w-4" />
                  Ver lançamentos do caixa
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3.5">
          {filteredPendentes.map((item) => {
            const foto = item.comprovante_foto
              ? getFileUrl(item, item.comprovante_foto)
              : item.comprovante_foto_url || ''

            const isOpenFinance =
              item.origem_tipo === 'open_finance' || item.external_id?.startsWith('pluggy_')

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-border bg-white p-4 sm:p-5 shadow-soft hover:border-primary/50 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Lado Esquerdo: Dados Extraídos + Miniatura da foto se houver */}
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  {foto ? (
                    <button
                      type="button"
                      onClick={() => setFotoVisualizar(foto)}
                      className="group relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary/50 shadow-sm"
                      title="Clique para ampliar o comprovante"
                    >
                      <img
                        src={foto}
                        alt="Comprovante"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                      <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                        <Eye className="h-4 w-4" />
                      </span>
                    </button>
                  ) : isOpenFinance ? (
                    <div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                      <Landmark className="h-7 w-7 text-primary" />
                    </div>
                  ) : (
                    <div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground border border-border">
                      <FileText className="h-7 w-7 text-primary/70" />
                    </div>
                  )}

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-extrabold ${
                          item.tipo === 'receita'
                            ? 'bg-success/10 text-success'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {item.tipo === 'receita' ? '🟢 Receita' : '🔴 Despesa'}
                      </span>

                      {/* Badge de Origem */}
                      {item.origem_tipo === 'pwa' ? (
                        <Badge
                          variant="outline"
                          className="border-[#DF5830]/40 bg-[#DF5830]/10 text-[#DF5830] font-bold text-xs"
                        >
                          <Sparkles className="mr-1 h-3 w-3" />
                          PWA / Móvel
                        </Badge>
                      ) : isOpenFinance ? (
                        <Badge
                          variant="outline"
                          className="border-primary/40 bg-primary/10 text-primary font-bold text-xs"
                        >
                          <Landmark className="mr-1 h-3 w-3" />
                          {item.banco_nome || 'Open Finance'}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-bold text-xs"
                        >
                          <Send className="mr-1 h-3 w-3" />
                          Telegram
                        </Badge>
                      )}

                      <span className="text-base font-extrabold text-foreground truncate">
                        {item.descricao ||
                          (isOpenFinance ? 'Transação Open Finance' : 'Comprovante Telegram')}
                      </span>

                      {item.contexto_nome && (
                        <Badge variant="outline" className="text-xs bg-secondary/40 font-semibold">
                          🏢 {item.contexto_nome}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <strong className="text-foreground">Data:</strong>{' '}
                        {item.data ? formatDate(item.data) : 'Hoje'}
                      </span>
                      <span>
                        <strong className="text-foreground">Conta sugerida:</strong>{' '}
                        {item.expand?.conta?.nome || 'A definir na triagem'}
                      </span>
                      <span>
                        <strong className="text-foreground">Categoria:</strong>{' '}
                        {item.expand?.categoria?.nome || 'A definir na triagem'}
                      </span>
                      <span>
                        <strong className="text-foreground">Recebido em:</strong>{' '}
                        {formatDate(item.created, {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {item.comprovante_texto && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1 italic bg-secondary/30 px-2.5 py-1 rounded-md border border-border/40 font-mono">
                        "{item.comprovante_texto}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Lado Direito: Valor + Ações de Triagem */}
                <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-border">
                  <div className="text-left lg:text-right pr-2">
                    <span className="block text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                      Valor Apurado
                    </span>
                    <span
                      className={`text-xl font-black tabular-nums ${
                        item.tipo === 'receita' ? 'text-success' : 'text-primary'
                      }`}
                    >
                      {formatCurrency(item.valor)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive font-bold h-9 px-3"
                        onClick={() => setItemParaDescartar(item)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Descartar
                      </Button>
                    )}

                    <Button
                      size="sm"
                      className="text-xs bg-primary hover:bg-primary/90 text-white font-extrabold h-9 px-4 shadow-sm"
                      disabled={!canEdit}
                      onClick={() => {
                        setItemParaTriar(item)
                        setDialogTriagem(true)
                      }}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Definir Destino
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Diálogo de Triagem Completa */}
      <TriagemPendenteDialog
        open={dialogTriagem}
        onOpenChange={(open) => {
          setDialogTriagem(open)
          if (!open) setItemParaTriar(null)
        }}
        item={itemParaTriar}
        contas={contas}
        categorias={categorias}
        tags={tags}
        tiposDespesa={tiposDespesa}
        metodosPagamento={metodosPagamento}
        tiposDizimo={tiposDizimo}
        empresas={empresas}
        pessoas={pessoas}
        onTriado={loadPendentes}
      />

      {/* Confirmação de Descarte */}
      <AlertDialog
        open={!!itemParaDescartar}
        onOpenChange={(open) => !open && setItemParaDescartar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar comprovante?</AlertDialogTitle>
            <AlertDialogDescription>
              O comprovante “{itemParaDescartar?.descricao}” no valor de{' '}
              {itemParaDescartar && formatCurrency(itemParaDescartar.valor)} será marcado como
              descartado e não entrará em Lançamentos nem em Despesas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={descartando}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarDescarte}
              disabled={descartando}
              className="bg-destructive hover:bg-destructive/90"
            >
              {descartando && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              Sim, descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de visualização de foto em alta resolução */}
      <AlertDialog
        open={!!fotoVisualizar}
        onOpenChange={(open) => !open && setFotoVisualizar(null)}
      >
        <AlertDialogContent className="max-w-3xl p-4">
          <AlertDialogHeader className="pb-2">
            <AlertDialogTitle>Comprovante Original</AlertDialogTitle>
            <AlertDialogDescription>
              Visualização da imagem enviada pelo Telegram.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-center max-h-[70vh] overflow-hidden rounded-xl bg-black/5">
            {fotoVisualizar && (
              <img
                src={fotoVisualizar}
                alt="Comprovante ampliado"
                className="max-h-[68vh] w-auto object-contain rounded-lg"
              />
            )}
          </div>
          <AlertDialogFooter className="pt-2">
            <AlertDialogAction onClick={() => setFotoVisualizar(null)}>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
