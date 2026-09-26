import { useEffect, useState } from 'react'
import {
  Store,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Percent,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { precificacaoService } from '@/services/precificacao'
import { PrecCanalModalidadeRecord, PrecCanalRecord, PrecTaxaRecord } from '@/types/precificacao'
import { formatarResumoCondicao } from '@/lib/precificacao/calculo'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'

export default function PrecificacaoCanais() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [canais, setCanais] = useState<PrecCanalRecord[]>([])
  const [modalidades, setModalidades] = useState<PrecCanalModalidadeRecord[]>([])
  const [taxas, setTaxas] = useState<PrecTaxaRecord[]>([])

  // Filtro de canal selecionado
  const [canalAtivoId, setCanalAtivoId] = useState<string>('')

  // Modal de Canal
  const [openCanalDialog, setOpenCanalDialog] = useState(false)
  const [canalEditando, setCanalEditando] = useState<Partial<PrecCanalRecord> | null>(null)

  // Modal de Modalidade
  const [openModDialog, setOpenModDialog] = useState(false)
  const [modEditando, setModEditando] = useState<Partial<PrecCanalModalidadeRecord> | null>(null)

  // Modal de Taxa
  const [openTaxaDialog, setOpenTaxaDialog] = useState(false)
  const [taxaEditando, setTaxaEditando] = useState<Partial<PrecTaxaRecord> | null>(null)

  async function carregarDados() {
    try {
      setLoading(true)
      const [chans, mods, txs] = await Promise.all([
        precificacaoService.listCanais(),
        precificacaoService.listModalidades(),
        precificacaoService.listTaxas(),
      ])
      setCanais(chans)
      setModalidades(mods)
      setTaxas(txs)
      if (chans.length > 0 && !canalAtivoId) {
        setCanalAtivoId(chans[0].id)
      }
    } catch (err) {
      console.error('Erro ao carregar canais e taxas:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  const canalSelecionado = canais.find((c) => c.id === canalAtivoId)
  const modalidadesDoCanal = modalidades.filter((m) => m.canal === canalAtivoId)
  const taxasDoCanal = taxas.filter((t) => t.canal === canalAtivoId)

  // Salvar Canal
  async function handleSalvarCanal(e: React.FormEvent) {
    e.preventDefault()
    if (!canalEditando?.nome) return
    try {
      if (canalEditando.id) {
        await precificacaoService.updateCanal(canalEditando.id, canalEditando)
        toast({ title: 'Canal atualizado com sucesso' })
      } else {
        const created = await precificacaoService.createCanal({
          nome: canalEditando.nome,
          tipo: canalEditando.tipo || 'marketplace',
          ativo: true,
          cor: canalEditando.cor || '#DF5830',
        })
        setCanalAtivoId(created.id)
        toast({ title: 'Novo canal criado com sucesso' })
      }
      setOpenCanalDialog(false)
      carregarDados()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao salvar canal' })
    }
  }

  // Salvar Modalidade
  async function handleSalvarModalidade(e: React.FormEvent) {
    e.preventDefault()
    if (!modEditando?.nome || !canalAtivoId) return
    try {
      if (modEditando.id) {
        await precificacaoService.updateModalidade(modEditando.id, modEditando)
        toast({ title: 'Modalidade atualizada' })
      } else {
        await precificacaoService.createModalidade({
          ...modEditando,
          canal: canalAtivoId,
          ativo: true,
        })
        toast({ title: 'Modalidade adicionada' })
      }
      setOpenModDialog(false)
      carregarDados()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao salvar modalidade' })
    }
  }

  // Salvar Taxa
  async function handleSalvarTaxa(e: React.FormEvent) {
    e.preventDefault()
    if (!taxaEditando?.nome || !canalAtivoId) return

    // Limpar valores vazios da condição para não salvar chaves undefined/NaN
    const cond = taxaEditando.condicao
    let condicaoLimpa: typeof cond | undefined = undefined

    if (cond) {
      const c: Record<string, unknown> = {}
      if (typeof cond.faixa_preco_min === 'number' && !isNaN(cond.faixa_preco_min)) {
        c.faixa_preco_min = cond.faixa_preco_min
      }
      if (typeof cond.faixa_preco_max === 'number' && !isNaN(cond.faixa_preco_max)) {
        c.faixa_preco_max = cond.faixa_preco_max
      }
      if (typeof cond.peso_min_kg === 'number' && !isNaN(cond.peso_min_kg)) {
        c.peso_min_kg = cond.peso_min_kg
        c.peso_min_g = cond.peso_min_kg * 1000
      }
      if (typeof cond.peso_max_kg === 'number' && !isNaN(cond.peso_max_kg)) {
        c.peso_max_kg = cond.peso_max_kg
        c.peso_max_g = cond.peso_max_kg * 1000
      }
      if (typeof cond.volume_min_cm3 === 'number' && !isNaN(cond.volume_min_cm3)) {
        c.volume_min_cm3 = cond.volume_min_cm3
      }
      if (typeof cond.volume_max_cm3 === 'number' && !isNaN(cond.volume_max_cm3)) {
        c.volume_max_cm3 = cond.volume_max_cm3
      }
      if (typeof cond.dimensao_max_cm === 'number' && !isNaN(cond.dimensao_max_cm)) {
        c.dimensao_max_cm = cond.dimensao_max_cm
      }
      if (cond.categoria && cond.categoria.trim() !== '') {
        c.categoria = cond.categoria.trim()
      }

      if (Object.keys(c).length > 0) {
        condicaoLimpa = c as typeof cond
      }
    }

    try {
      const payload: Partial<PrecTaxaRecord> = {
        ...taxaEditando,
        condicao: condicaoLimpa,
      }

      if (taxaEditando.id) {
        await precificacaoService.updateTaxa(taxaEditando.id, payload)
        toast({ title: 'Taxa atualizada' })
      } else {
        await precificacaoService.createTaxa({
          ...payload,
          canal: canalAtivoId,
          base_calculo: taxaEditando.base_calculo || 'preco_anunciado',
          tipo_valor: taxaEditando.tipo_valor || 'percentual',
          valor: Number(taxaEditando.valor) || 0,
          responsavel: taxaEditando.responsavel || 'marketplace',
          tipo_regra: taxaEditando.tipo_regra || 'comissao',
          financiado_por: taxaEditando.financiado_por || 'marketplace',
          status_conferencia: 'conferido', // Criada pelo usuário -> já conferida
        })
        toast({ title: 'Taxa adicionada com sucesso' })
      }
      setOpenTaxaDialog(false)
      carregarDados()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao salvar taxa' })
    }
  }

  // Conferir Taxa (marca pendente -> conferido)
  async function handleConferirTaxa(taxaId: string) {
    try {
      await precificacaoService.conferirTaxa(taxaId)
      toast({
        title: 'Taxa Conferida!',
        description: 'Vigência e valores homologados para simulações oficiais.',
      })
      carregarDados()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao conferir taxa' })
    }
  }

  // Excluir Taxa
  async function handleExcluirTaxa(taxaId: string) {
    if (!confirm('Deseja realmente excluir esta regra de taxa?')) return
    try {
      await precificacaoService.deleteTaxa(taxaId)
      toast({ title: 'Taxa removida' })
      carregarDados()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao excluir taxa' })
    }
  }

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Canais de Venda, Modalidades & Taxas"
        subtitulo="Gestão cadastral de marketplaces e canais próprios. Novos marketplaces criados aqui entram automaticamente no comparador."
        acoes={
          <Button
            className="bg-primary text-white font-bold"
            onClick={() => {
              setCanalEditando({
                nome: '',
                tipo: 'marketplace',
                cor: '#DF5830',
                vigencia: 'Vigente',
              })
              setOpenCanalDialog(true)
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Novo Canal / Marketplace
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Lista Lateral de Canais */}
        <Card className="lg:col-span-1 shadow-xs border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">Canais Cadastrados</CardTitle>
            <CardDescription className="text-xs">
              Selecione para gerenciar modalidades e regras
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {loading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              canais.map((c) => {
                const isSelected = c.id === canalAtivoId
                const countTaxas = taxas.filter((t) => t.canal === c.id).length
                const pendentes = taxas.filter(
                  (t) => t.canal === c.id && t.status_conferencia === 'pendente_conferencia',
                ).length

                return (
                  <button
                    key={c.id}
                    onClick={() => setCanalAtivoId(c.id)}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between border ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                        : 'border-transparent hover:bg-secondary/60 text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: c.cor || '#DF5830' }}
                      />
                      <div>
                        <span className="block text-xs font-semibold">{c.nome}</span>
                        <span className="text-[10px] text-muted-foreground block capitalize">
                          {c.tipo.replace('_', ' ')} • {countTaxas} taxas
                        </span>
                      </div>
                    </div>

                    {pendentes > 0 && (
                      <Badge
                        variant="outline"
                        className="text-amber-600 border-amber-300 text-[9px] h-5 px-1.5"
                      >
                        {pendentes} pend.
                      </Badge>
                    )}
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Detalhes do Canal Ativo */}
        <div className="lg:col-span-3 space-y-6">
          {!canalSelecionado ? (
            <Card className="p-8 text-center text-muted-foreground">
              Selecione um canal à esquerda para gerenciar modalidades e regras de comissão.
            </Card>
          ) : (
            <>
              {/* Header do Canal Selecionado */}
              <Card className="shadow-xs border-border/80">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: canalSelecionado.cor || '#DF5830' }}
                    >
                      <Store className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-black text-foreground">
                          {canalSelecionado.nome}
                        </CardTitle>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {canalSelecionado.tipo.replace('_', ' ')}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs mt-0.5">
                        Vigência: {canalSelecionado.vigencia || 'Valores da Planilha'}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCanalEditando(canalSelecionado)
                        setOpenCanalDialog(true)
                      }}
                    >
                      <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                      Editar Canal
                    </Button>
                    <Button
                      size="sm"
                      className="bg-primary text-white font-bold"
                      onClick={() => {
                        setModEditando({
                          canal: canalSelecionado.id,
                          nome: '',
                          prazo_recebimento_dias: 7,
                          ativo: true,
                        })
                        setOpenModDialog(true)
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Adicionar Modalidade
                    </Button>
                  </div>
                </CardHeader>

                {/* Lista de Modalidades do Canal */}
                <CardContent className="border-t border-border pt-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Modalidades / Operações ({modalidadesDoCanal.length})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {modalidadesDoCanal.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-xl border border-border p-3 bg-secondary/20 flex flex-col justify-between"
                      >
                        <div>
                          <span className="font-bold text-xs text-foreground block">{m.nome}</span>
                          <span className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Prazo: {m.prazo_recebimento_dias || 0} dias
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-3 pt-2 border-t border-border/40">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              setModEditando(m)
                              setOpenModDialog(true)
                            }}
                          >
                            <Edit2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {modalidadesDoCanal.length === 0 && (
                      <p className="text-xs text-muted-foreground italic col-span-full">
                        Nenhuma modalidade cadastrada. Clique acima para adicionar (ex: FULL, MEI,
                        Clássico).
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Tabela de Taxas & Comissões */}
              <Card className="shadow-xs border-border/80">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-3">
                  <div>
                    <CardTitle className="text-base font-bold">
                      Regras de Taxas & Comissões
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Linhas declaradas e auditáveis aplicadas ao preço de venda
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    className="bg-primary text-white font-bold"
                    onClick={() => {
                      setTaxaEditando({
                        canal: canalSelecionado.id,
                        nome: '',
                        base_calculo: 'preco_anunciado',
                        tipo_valor: 'percentual',
                        valor: 0,
                        responsavel: 'marketplace',
                        tipo_regra: 'comissao',
                        financiado_por: 'marketplace',
                      })
                      setOpenTaxaDialog(true)
                    }}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Nova Regra de Taxa
                  </Button>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-y border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-4 font-bold">Nome da Taxa</th>
                        <th className="py-2.5 px-3 font-bold">Modalidade</th>
                        <th className="py-2.5 px-3 font-bold">Base de Cálculo</th>
                        <th className="py-2.5 px-3 font-bold">Tipo / Valor</th>
                        <th className="py-2.5 px-3 font-bold">Responsável</th>
                        <th className="py-2.5 px-3 font-bold">Conferência</th>
                        <th className="py-2.5 px-4 font-bold text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {taxasDoCanal.map((tx) => {
                        const mod = modalidades.find((m) => m.id === tx.modalidade)
                        const pendente = tx.status_conferencia === 'pendente_conferencia'

                        const resumoCond = formatarResumoCondicao(tx.condicao)

                        return (
                          <tr key={tx.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-foreground block">{tx.nome}</span>
                                {resumoCond && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] bg-amber-500/10 text-amber-700 border-amber-300 font-normal px-1.5 py-0"
                                  >
                                    Condicional
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground uppercase font-mono block">
                                {tx.tipo_regra}
                              </span>
                              {resumoCond && (
                                <span className="text-[11px] text-amber-700 font-medium block mt-0.5">
                                  {resumoCond}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              {mod ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {mod.nome}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground italic text-[11px]">
                                  Todas as Modalidades
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 capitalize text-muted-foreground">
                              {tx.base_calculo.replace('_', ' ')}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold">
                              {tx.tipo_valor === 'percentual'
                                ? `${tx.valor}%`
                                : formatCurrency(tx.valor)}
                            </td>
                            <td className="py-3 px-3 capitalize">
                              <Badge variant="outline" className="text-[10px]">
                                {tx.responsavel}
                              </Badge>
                            </td>
                            <td className="py-3 px-3">
                              {pendente ? (
                                <div className="flex items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className="text-amber-600 border-amber-300 text-[10px] bg-amber-50"
                                  >
                                    Pendente Planilha
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[10px] font-bold text-emerald-600 hover:text-emerald-700"
                                    onClick={() => handleConferirTaxa(tx.id)}
                                  >
                                    <ShieldCheck className="mr-1 h-3 w-3" />
                                    Homologar
                                  </Button>
                                </div>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-emerald-600 border-emerald-300 text-[10px] bg-emerald-50"
                                >
                                  Conferido
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setTaxaEditando(tx)
                                    setOpenTaxaDialog(true)
                                  }}
                                >
                                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => handleExcluirTaxa(tx.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* DIALOG DE CANAL */}
      <Dialog open={openCanalDialog} onOpenChange={setOpenCanalDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleSalvarCanal}>
            <DialogHeader>
              <DialogTitle>
                {canalEditando?.id ? 'Editar Canal' : 'Novo Canal / Marketplace'}
              </DialogTitle>
              <DialogDescription>
                Informe o nome e características operacionais do canal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4 text-xs">
              <div className="space-y-1">
                <Label>Nome do Canal / Plataforma</Label>
                <Input
                  required
                  placeholder="Ex: Shopee, Amazon, Site Oficial..."
                  value={canalEditando?.nome || ''}
                  onChange={(e) => setCanalEditando((prev) => ({ ...prev, nome: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Tipo de Canal</Label>
                <Select
                  value={canalEditando?.tipo || 'marketplace'}
                  onValueChange={(v) =>
                    setCanalEditando((prev) => ({
                      ...prev,
                      tipo: v as 'site_proprio' | 'marketplace',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketplace">Marketplace</SelectItem>
                    <SelectItem value="site_proprio">Site Próprio (E-commerce)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Cor de Destaque (Hex)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-8 w-12 p-0.5"
                    value={canalEditando?.cor || '#DF5830'}
                    onChange={(e) => setCanalEditando((prev) => ({ ...prev, cor: e.target.value }))}
                  />
                  <Input
                    placeholder="#DF5830"
                    value={canalEditando?.cor || ''}
                    onChange={(e) => setCanalEditando((prev) => ({ ...prev, cor: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenCanalDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary text-white font-bold">
                Salvar Canal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE MODALIDADE */}
      <Dialog open={openModDialog} onOpenChange={setOpenModDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleSalvarModalidade}>
            <DialogHeader>
              <DialogTitle>{modEditando?.id ? 'Editar Modalidade' : 'Nova Modalidade'}</DialogTitle>
              <DialogDescription>
                Exemplos: Shopee FULL, Clássico, Padrão 30 dias.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4 text-xs">
              <div className="space-y-1">
                <Label>Nome da Modalidade</Label>
                <Input
                  required
                  placeholder="Ex: FULL, Clássico, Pix Imediato..."
                  value={modEditando?.nome || ''}
                  onChange={(e) => setModEditando((prev) => ({ ...prev, nome: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Prazo Previsto de Recebimento (dias)</Label>
                <Input
                  type="number"
                  min="0"
                  value={modEditando?.prazo_recebimento_dias ?? 7}
                  onChange={(e) =>
                    setModEditando((prev) => ({
                      ...prev,
                      prazo_recebimento_dias: parseInt(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenModDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary text-white font-bold">
                Salvar Modalidade
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE TAXA */}
      <Dialog open={openTaxaDialog} onOpenChange={setOpenTaxaDialog}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSalvarTaxa}>
            <DialogHeader>
              <DialogTitle>
                {taxaEditando?.id ? 'Editar Regra de Taxa' : 'Nova Regra de Taxa'}
              </DialogTitle>
              <DialogDescription>
                Configure a regra auditável que será calculada sobre o preço de venda.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="space-y-1">
                <Label>Nome da Taxa</Label>
                <Input
                  required
                  placeholder="Ex: Comissão Shopee < R$ 80, Taxa Logística > 5kg..."
                  value={taxaEditando?.nome || ''}
                  onChange={(e) => setTaxaEditando((prev) => ({ ...prev, nome: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Modalidade Específica</Label>
                  <Select
                    value={taxaEditando?.modalidade || 'todas'}
                    onValueChange={(v) =>
                      setTaxaEditando((prev) => ({
                        ...prev,
                        modalidade: v === 'todas' ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as modalidades" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as Modalidades</SelectItem>
                      {modalidadesDoCanal.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Tipo de Regra</Label>
                  <Select
                    value={taxaEditando?.tipo_regra || 'comissao'}
                    onValueChange={(v) =>
                      setTaxaEditando((prev) => ({
                        ...prev,
                        tipo_regra: v as PrecTaxaRecord['tipo_regra'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comissao">Comissão</SelectItem>
                      <SelectItem value="tarifa_fixa">Tarifa Fixa</SelectItem>
                      <SelectItem value="transacao">Transação</SelectItem>
                      <SelectItem value="frete">Frete</SelectItem>
                      <SelectItem value="operacao">Operacional</SelectItem>
                      <SelectItem value="servico">Serviço</SelectItem>
                      <SelectItem value="afiliado">Afiliado</SelectItem>
                      <SelectItem value="campanha">Campanha</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Base de Cálculo</Label>
                  <Select
                    value={taxaEditando?.base_calculo || 'preco_anunciado'}
                    onValueChange={(v) =>
                      setTaxaEditando((prev) => ({
                        ...prev,
                        base_calculo: v as PrecTaxaRecord['base_calculo'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preco_anunciado">Preço Anunciado</SelectItem>
                      <SelectItem value="preco_pago_cliente">Preço Pago pelo Cliente</SelectItem>
                      <SelectItem value="prestacao_fixa">Por Pedido / Fixo</SelectItem>
                      <SelectItem value="faixa_preco">Por Faixa de Preço</SelectItem>
                      <SelectItem value="peso">Por Peso (kg)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Tipo de Cobrança</Label>
                  <Select
                    value={taxaEditando?.tipo_valor || 'percentual'}
                    onValueChange={(v) =>
                      setTaxaEditando((prev) => ({
                        ...prev,
                        tipo_valor: v as 'percentual' | 'fixo',
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentual">Percentual (%)</SelectItem>
                      <SelectItem value="fixo">Fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Valor {taxaEditando?.tipo_valor === 'percentual' ? '(%)' : '(R$)'}</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={taxaEditando?.valor ?? 0}
                  onChange={(e) =>
                    setTaxaEditando((prev) => ({
                      ...prev,
                      valor: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              {/* SEÇÃO DE CONDIÇÕES CONDICIONAIS */}
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-bold text-foreground">
                      Condição de Aplicação (Opcional)
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Em branco = sem restrição (aplica sempre em todas as vendas).
                    </p>
                  </div>
                  {(taxaEditando?.condicao?.faixa_preco_min !== undefined ||
                    taxaEditando?.condicao?.faixa_preco_max !== undefined ||
                    taxaEditando?.condicao?.peso_min_kg !== undefined ||
                    taxaEditando?.condicao?.peso_max_kg !== undefined ||
                    taxaEditando?.condicao?.volume_min_cm3 !== undefined ||
                    taxaEditando?.condicao?.volume_max_cm3 !== undefined ||
                    taxaEditando?.condicao?.categoria) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setTaxaEditando((prev) => ({
                          ...prev,
                          condicao: undefined,
                        }))
                      }
                    >
                      Limpar condições
                    </Button>
                  )}
                </div>

                {/* Faixa de Preço */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Faixa de Preço do Produto (R$)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Mínimo (ex: 80.00)"
                        value={taxaEditando?.condicao?.faixa_preco_min ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseFloat(e.target.value)
                          setTaxaEditando((prev) => ({
                            ...prev,
                            condicao: {
                              ...prev?.condicao,
                              faixa_preco_min: val,
                            },
                          }))
                        }}
                      />
                      <span className="text-[9px] text-muted-foreground mt-0.5 block">
                        Aplica se preço ≥ mínimo
                      </span>
                    </div>
                    <div>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Máximo (ex: 79.99)"
                        value={taxaEditando?.condicao?.faixa_preco_max ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseFloat(e.target.value)
                          setTaxaEditando((prev) => ({
                            ...prev,
                            condicao: {
                              ...prev?.condicao,
                              faixa_preco_max: val,
                            },
                          }))
                        }}
                      />
                      <span className="text-[9px] text-muted-foreground mt-0.5 block">
                        Aplica se preço ≤ máximo
                      </span>
                    </div>
                  </div>
                </div>

                {/* Faixa de Peso */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Faixa de Peso do Produto (kg)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Mínimo kg (ex: 5.0)"
                        value={
                          taxaEditando?.condicao?.peso_min_kg ??
                          (taxaEditando?.condicao?.peso_min_g !== undefined
                            ? taxaEditando.condicao.peso_min_g / 1000
                            : '')
                        }
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseFloat(e.target.value)
                          setTaxaEditando((prev) => ({
                            ...prev,
                            condicao: {
                              ...prev?.condicao,
                              peso_min_kg: val,
                              peso_min_g: val !== undefined ? val * 1000 : undefined,
                            },
                          }))
                        }}
                      />
                      <span className="text-[9px] text-muted-foreground mt-0.5 block">
                        Aplica se peso ≥ mínimo
                      </span>
                    </div>
                    <div>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Máximo kg (ex: 5.0)"
                        value={
                          taxaEditando?.condicao?.peso_max_kg ??
                          (taxaEditando?.condicao?.peso_max_g !== undefined
                            ? taxaEditando.condicao.peso_max_g / 1000
                            : '')
                        }
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseFloat(e.target.value)
                          setTaxaEditando((prev) => ({
                            ...prev,
                            condicao: {
                              ...prev?.condicao,
                              peso_max_kg: val,
                              peso_max_g: val !== undefined ? val * 1000 : undefined,
                            },
                          }))
                        }}
                      />
                      <span className="text-[9px] text-muted-foreground mt-0.5 block">
                        Aplica se peso ≤ máximo
                      </span>
                    </div>
                  </div>
                </div>

                {/* Faixa de Volume ou Dimensão */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Faixa de Volume (cm³) ou Dimensão
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Input
                        type="number"
                        step="1"
                        placeholder="Vol. Mínimo (cm³)"
                        value={taxaEditando?.condicao?.volume_min_cm3 ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseFloat(e.target.value)
                          setTaxaEditando((prev) => ({
                            ...prev,
                            condicao: {
                              ...prev?.condicao,
                              volume_min_cm3: val,
                            },
                          }))
                        }}
                      />
                      <span className="text-[9px] text-muted-foreground mt-0.5 block">
                        Calculado de CxLxA
                      </span>
                    </div>
                    <div>
                      <Input
                        type="number"
                        step="1"
                        placeholder="Vol. Máximo (cm³)"
                        value={taxaEditando?.condicao?.volume_max_cm3 ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseFloat(e.target.value)
                          setTaxaEditando((prev) => ({
                            ...prev,
                            condicao: {
                              ...prev?.condicao,
                              volume_max_cm3: val,
                            },
                          }))
                        }}
                      />
                      <span className="text-[9px] text-muted-foreground mt-0.5 block">
                        Limite de volume
                      </span>
                    </div>
                  </div>
                </div>

                {/* Categoria do Produto */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Categoria Específica (Opcional)
                  </span>
                  <Input
                    placeholder="Ex: Cama e Banho, Eletrônicos..."
                    value={taxaEditando?.condicao?.categoria || ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setTaxaEditando((prev) => ({
                        ...prev,
                        condicao: {
                          ...prev?.condicao,
                          categoria: val || undefined,
                        },
                      }))
                    }}
                  />
                  <span className="text-[9px] text-muted-foreground block">
                    Aplica apenas a produtos com esta categoria no cadastro.
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenTaxaDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary text-white font-bold">
                Salvar Regra
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
