import { useEffect, useState } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  Settings2,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  Layers,
} from 'lucide-react'
import { ExpedicaoHeader } from '@/components/expedicao/ExpedicaoHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import type { KitTema, KitModelo, KitRegra, ItemComposicaoModelo } from '@/types/separacaoKits'
import { cn } from '@/lib/utils'

export default function RegrasComposicaoPage() {
  const [temas, setTemas] = useState<KitTema[]>([])
  const [modelos, setModelos] = useState<KitModelo[]>([])
  const [regras, setRegras] = useState<KitRegra[]>([])
  const [temaFiltroId, setTemaFiltroId] = useState<string>('todos')
  const [loading, setLoading] = useState(true)

  // Dialog Regra Manual
  const [dialogOpen, setDialogOpen] = useState(false)
  const [regraEditando, setRegraEditando] = useState<KitRegra | null>(null)
  const [regraTemaId, setRegraTemaId] = useState<string>('')
  const [quantidadeKit, setQuantidadeKit] = useState<string>('10')
  const [descricao, setDescricao] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [quantidadesPorModelo, setQuantidadesPorModelo] = useState<Record<string, number>>({})
  const [salvando, setSalvando] = useState(false)

  // Confirmação de exclusão
  const [regraParaExcluir, setRegraParaExcluir] = useState<KitRegra | null>(null)

  const carregarDados = async () => {
    try {
      setLoading(true)
      const [temasData, modelosData, regrasData] = await Promise.all([
        separacaoKitsService.getTemas(),
        separacaoKitsService.getModelos(),
        separacaoKitsService.getRegras(),
      ])
      setTemas(temasData)
      setModelos(modelosData)
      setRegras(regrasData)
    } catch (err) {
      console.error('Erro ao carregar regras:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar as regras cadastradas.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Filtragem
  const regrasFiltradas = regras.filter((r) => {
    if (temaFiltroId !== 'todos' && r.tema !== temaFiltroId) return false
    return true
  })

  // Modelos do tema selecionado no modal
  const modelosDoTemaForm = modelos.filter((m) => m.tema === regraTemaId && m.ativo)

  // Soma das quantidades informadas na regra manual
  const somaAtualModal = Object.values(quantidadesPorModelo).reduce((acc, q) => acc + (q || 0), 0)
  const metaTotalKit = parseInt(quantidadeKit, 10) || 0
  const somaValida = metaTotalKit > 0 && somaAtualModal === metaTotalKit

  const abrirNovaRegraManual = (temaPadraoId?: string) => {
    const idTema = temaPadraoId || temas[0]?.id || ''
    setRegraEditando(null)
    setRegraTemaId(idTema)
    setQuantidadeKit('10')
    setDescricao('')
    setAtivo(true)

    // Inicializa quantidades zeradas
    const mods = modelos.filter((m) => m.tema === idTema && m.ativo)
    const initQtds: Record<string, number> = {}
    mods.forEach((m) => {
      initQtds[m.id] = 0
    })
    setQuantidadesPorModelo(initQtds)
    setDialogOpen(true)
  }

  const abrirEditarRegra = (r: KitRegra) => {
    setRegraEditando(r)
    setRegraTemaId(r.tema)
    setQuantidadeKit(String(r.quantidade_kit || 10))
    setDescricao(r.descricao || '')
    setAtivo(r.ativo)

    const initQtds: Record<string, number> = {}
    if (Array.isArray(r.composicao)) {
      r.composicao.forEach((item) => {
        if (item.modelo_id) {
          initQtds[item.modelo_id] = item.quantidade
        }
      })
    }
    setQuantidadesPorModelo(initQtds)
    setDialogOpen(true)
  }

  const handleTemaChangeNoModal = (novoTemaId: string) => {
    setRegraTemaId(novoTemaId)
    const mods = modelos.filter((m) => m.tema === novoTemaId && m.ativo)
    const initQtds: Record<string, number> = {}
    mods.forEach((m) => {
      initQtds[m.id] = 0
    })
    setQuantidadesPorModelo(initQtds)
  }

  const handleQtdChange = (modeloId: string, valorStr: string) => {
    const v = Math.max(0, parseInt(valorStr, 10) || 0)
    setQuantidadesPorModelo((prev) => ({
      ...prev,
      [modeloId]: v,
    }))
  }

  const salvarRegraManual = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!somaValida) {
      toast({
        title: 'Validação de Quantidade',
        description: `A soma dos modelos (${somaAtualModal}) deve ser exatamente igual à quantidade do kit (${metaTotalKit}).`,
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      // Monta composição
      const composicao: ItemComposicaoModelo[] = []
      modelosDoTemaForm.forEach((m) => {
        const qtd = quantidadesPorModelo[m.id] || 0
        if (qtd > 0) {
          composicao.push({
            modelo_id: m.id,
            codigo: m.codigo,
            nome: m.nome,
            quantidade: qtd,
          })
        }
      })

      const payload = {
        tema: regraTemaId,
        tipo: 'manual' as const,
        quantidade_kit: metaTotalKit,
        descricao: descricao.trim() || `Regra específica para Kit de ${metaTotalKit} unidades`,
        composicao,
        ativo,
      }

      if (regraEditando) {
        await separacaoKitsService.updateRegra(regraEditando.id, payload)
        toast({ title: 'Regra de composição atualizada!' })
      } else {
        await separacaoKitsService.createRegra(payload)
        toast({ title: 'Nova regra de composição salva!' })
      }

      setDialogOpen(false)
      carregarDados()
    } catch (err) {
      console.error('Erro ao salvar regra:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível registrar a regra.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const confirmarExclusao = async () => {
    if (!regraParaExcluir) return
    try {
      await separacaoKitsService.deleteRegra(regraParaExcluir.id)
      toast({ title: 'Regra removida com sucesso' })
      setRegraParaExcluir(null)
      carregarDados()
    } catch (err) {
      console.error('Erro ao excluir regra:', err)
      toast({ title: 'Erro ao excluir regra', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <ExpedicaoHeader
        title="Regras de Composição"
        description="Cada tema usa dois modos: Distribuição Automática Equilibrada por padrão, e Regras Manuais específicas por quantidade (que têm prioridade)."
      />

      {/* PAINEL DE EXPLICAÇÃO DA PRIORIDADE DAS REGRAS */}
      <Card className="border-primary/20 bg-primary/5 shadow-xs">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-black text-foreground">
                Hierarquia Obrigatória de Aplicação das Regras de Separação
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground sm:text-sm">
                <li>
                  <strong className="text-foreground">1. Pedido Personalizado:</strong> se o cliente
                  escolheu modelos e quantidades específicas no chat/marketplace.
                </li>
                <li>
                  <strong className="text-foreground">2. Regra Manual por Quantidade:</strong> se
                  houver uma regra cadastrada abaixo para o número exato de unidades (ex: Kit de 10
                  un).
                </li>
                <li>
                  <strong className="text-foreground">
                    3. Distribuição Automática Equilibrada:
                  </strong>{' '}
                  divide o total entre os modelos ativos; excedentes seguem a ordem do cadastro.
                </li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BARRA DE AÇÕES E FILTRO */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Label className="text-xs font-bold text-muted-foreground uppercase whitespace-nowrap">
            Filtrar Tema:
          </Label>
          <Select value={temaFiltroId} onValueChange={setTemaFiltroId}>
            <SelectTrigger className="h-10 w-52 font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Temas</SelectItem>
              {temas.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          onClick={() => abrirNovaRegraManual(temaFiltroId !== 'todos' ? temaFiltroId : undefined)}
          className="h-10 gap-1.5 bg-primary font-bold text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nova Regra Manual por Quantidade
        </Button>
      </div>

      {/* CARDS COM REGRAS AUTOMÁTICAS NATIVAS E REGRAS MANUAIS */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* BLOCO: MODO 1 — REGRAS AUTOMÁTICAS EQUILIBRADAS (PADRÃO DE TODOS OS TEMAS) */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-base font-bold">
                  Modo 1 — Distribuição Automática Equilibrada
                </CardTitle>
                <CardDescription className="text-xs">
                  Ativa em todos os temas quando não houver regra manual específica
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {temas
              .filter((t) => temaFiltroId === 'todos' || t.id === temaFiltroId)
              .map((t) => {
                const modsAtivos = modelos.filter((m) => m.tema === t.id && m.ativo)
                return (
                  <div
                    key={t.id}
                    className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">{t.nome}</span>
                      <Badge
                        variant="outline"
                        className="text-emerald-700 bg-emerald-50 border-emerald-300 font-bold text-xs"
                      >
                        Equilibrada Ativa
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Divide qualquer quantidade entre os{' '}
                      <strong>{modsAtivos.length} modelos ativos</strong>. Excedentes são
                      distribuídos sequencialmente aos primeiros modelos da lista.
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {modsAtivos.map((m, idx) => (
                        <span
                          key={m.id}
                          className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground"
                        >
                          #{idx + 1} {m.codigo}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
          </CardContent>
        </Card>

        {/* BLOCO: REGRAS MANUAIS CADASTRADAS POR QUANTIDADE ESPECÍFICA */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Settings2 className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-base font-bold">
                  Regras Manuais Cadastradas por Quantidade
                </CardTitle>
                <CardDescription className="text-xs">
                  Sobrepõem a regra automática para quantidades específicas
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {regrasFiltradas.filter((r) => r.tipo === 'manual').length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Nenhuma regra manual cadastrada para este filtro.
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      abrirNovaRegraManual(temaFiltroId !== 'todos' ? temaFiltroId : undefined)
                    }
                    className="text-xs font-semibold"
                  >
                    Cadastrar Regra Manual
                  </Button>
                </div>
              </div>
            ) : (
              regrasFiltradas
                .filter((r) => r.tipo === 'manual')
                .map((r) => {
                  const temaDoItem = temas.find((t) => t.id === r.tema)
                  const comp = Array.isArray(r.composicao) ? r.composicao : []

                  return (
                    <div
                      key={r.id}
                      className={cn(
                        'flex flex-col gap-2 rounded-xl border p-3.5 transition',
                        r.ativo
                          ? 'border-border/80 bg-card hover:border-primary/40'
                          : 'border-border/40 bg-muted/30 opacity-70',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary text-xs font-black text-white">
                            Kit {r.quantidade_kit} Unidades
                          </Badge>
                          <span className="text-xs font-bold text-muted-foreground">
                            {temaDoItem?.nome}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => abrirEditarRegra(r)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive/80 hover:text-destructive"
                            onClick={() => setRegraParaExcluir(r)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <p className="text-xs font-semibold text-foreground">{r.descricao}</p>

                      {/* Itens da Composição da Regra */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {comp.map((c, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="border border-border/80 text-[11px] font-bold"
                          >
                            {c.codigo}: <strong>{c.quantidade} un</strong>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )
                })
            )}
          </CardContent>
        </Card>
      </div>

      {/* DIALOG DE CRIAR / EDITAR REGRA MANUAL */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-bold">
              {regraEditando ? 'Editar Regra Manual' : 'Nova Regra Manual por Quantidade'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={salvarRegraManual} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="regTema">Tema do Produto *</Label>
                <Select value={regraTemaId} onValueChange={handleTemaChangeNoModal}>
                  <SelectTrigger id="regTema" className="font-semibold">
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
                <Label htmlFor="qtdKit">Quantidade do Kit *</Label>
                <Input
                  id="qtdKit"
                  type="number"
                  min="1"
                  step="1"
                  value={quantidadeKit}
                  onChange={(e) => setQuantidadeKit(e.target.value)}
                  placeholder="Ex: 10, 20, 30..."
                  required
                  className="font-bold text-base"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="regDesc">Descrição da Regra</Label>
              <Input
                id="regDesc"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Kit 10 unidades Mickey: M01 com 2 un, demais com 1 un"
              />
            </div>

            {/* TABELA DE DEFINIÇÃO EXATA DAS QUANTIDADES POR MODELO */}
            <div className="space-y-2 rounded-xl border border-border p-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    Composição dos Modelos para este Kit
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Informe quantas unidades de cada modelo compõem o kit
                  </p>
                </div>

                {/* Totalizador ao vivo com validação rigorosa */}
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-black border',
                    somaValida
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300',
                  )}
                >
                  {somaValida ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                  )}
                  <span>
                    Total: {somaAtualModal} / {metaTotalKit} un
                  </span>
                </div>
              </div>

              {modelosDoTemaForm.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Nenhum modelo ativo encontrado para o tema selecionado.
                </div>
              ) : (
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {modelosDoTemaForm.map((mod) => {
                    const qtd = quantidadesPorModelo[mod.id] ?? 0
                    return (
                      <div
                        key={mod.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block font-bold text-xs text-foreground truncate">
                            {mod.codigo} — {mod.nome}
                          </span>
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={qtd}
                            onChange={(e) => handleQtdChange(mod.id, e.target.value)}
                            className="h-9 text-center font-bold"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="regAtivo" className="text-sm font-semibold cursor-pointer">
                Regra Ativa
              </Label>
              <Switch id="regAtivo" checked={ativo} onCheckedChange={setAtivo} />
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
                disabled={salvando || !somaValida}
                className="bg-primary font-bold text-white hover:bg-primary/90"
              >
                {salvando ? 'Salvando...' : 'Salvar Regra'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAÇÃO DE EXCLUSÃO */}
      <AlertDialog
        open={Boolean(regraParaExcluir)}
        onOpenChange={(op) => !op && setRegraParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold text-destructive">
              Excluir Regra de Composição
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente remover esta regra manual para kit de{' '}
              <strong>{regraParaExcluir?.quantidade_kit} unidades</strong>?
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
    </div>
  )
}
