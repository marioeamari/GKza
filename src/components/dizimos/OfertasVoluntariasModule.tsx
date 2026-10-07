import { useState } from 'react'
import {
  Coins,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Repeat,
  Trash2,
  Pencil,
  CheckCircle2,
  LoaderCircle,
  HelpCircle,
  Filter,
  Wallet,
  ArrowDown,
  ArrowUp,
  Tag,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { can } from '@/lib/permissions'
import { formatCurrency, formatDate, getLocalDateStr } from '@/lib/format'
import { apiMessage } from '@/lib/api-error'
import { ofertasService } from '@/services/ofertas'
import type {
  DiaSemanaOferta,
  MovimentacaoCaixaOferta,
  OfertaVoluntaria,
  ResumoCaixaOfertas,
} from '@/types/domain'

interface OfertasVoluntariasModuleProps {
  selectedMonth: string
  monthLabel: string
  ofertas: OfertaVoluntaria[]
  movimentacoesCaixa: MovimentacaoCaixaOferta[]
  resumoCaixa: ResumoCaixaOfertas
  loading: boolean
  onReload: () => Promise<void>
}

const DIAS_SEMANA_OPCOES: { value: DiaSemanaOferta; label: string }[] = [
  { value: 'domingo', label: 'Todo Domingo' },
  { value: 'segunda', label: 'Toda Segunda-feira' },
  { value: 'terca', label: 'Toda Terça-feira' },
  { value: 'quarta', label: 'Toda Quarta-feira' },
  { value: 'quinta', label: 'Toda Quinta-feira' },
  { value: 'sexta', label: 'Toda Sexta-feira' },
  { value: 'sabado', label: 'Todo Sábado' },
]

export function OfertasVoluntariasModule({
  selectedMonth,
  monthLabel,
  ofertas,
  movimentacoesCaixa,
  resumoCaixa,
  loading,
  onReload,
}: OfertasVoluntariasModuleProps) {
  const { user } = useAuth()
  const { toast } = useToast()

  // Filtro de busca na lista de ofertas voluntárias
  const [busca, setBusca] = useState('')

  // Modal de criação/edição de oferta voluntária
  const [ofertaModalOpen, setOfertaModalOpen] = useState(false)
  const [editingOferta, setEditingOferta] = useState<OfertaVoluntaria | null>(null)
  const [formData, setFormData] = useState({
    data: getLocalDateStr(new Date()),
    valor: '',
    direcionamento: '',
    descricao: '',
    recorrente: false,
    dia_semana: 'domingo' as DiaSemanaOferta,
    lancar_no_caixa: true,
  })
  const [savingOferta, setSavingOferta] = useState(false)

  // Modal de exclusão de oferta
  const [deleteOferta, setDeleteOferta] = useState<OfertaVoluntaria | null>(null)
  const [deleteModoRecorrente, setDeleteModoRecorrente] = useState<'apenas_esta' | 'todas_regra'>(
    'apenas_esta',
  )
  const [deletingOferta, setDeletingOferta] = useState(false)

  // Modal de movimentação do caixa (Entrada avulsa ou Saída/Aplicação)
  const [caixaModalOpen, setCaixaModalOpen] = useState(false)
  const [caixaModalTipo, setCaixaModalTipo] = useState<'entrada' | 'saida'>('saida')
  const [caixaFormData, setCaixaFormData] = useState({
    data: getLocalDateStr(new Date()),
    valor: '',
    descricao: '',
    direcionamento: '',
  })
  const [savingCaixa, setSavingCaixa] = useState(false)

  // Modal de exclusão de movimentação do caixa
  const [deleteCaixaId, setDeleteCaixaId] = useState<string | null>(null)
  const [deletingCaixa, setDeletingCaixa] = useState(false)

  // Abertura do modal de criação de oferta voluntária
  const handleOpenNovaOferta = () => {
    setEditingOferta(null)
    const today = getLocalDateStr(new Date())
    const defaultData = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`
    setFormData({
      data: defaultData,
      valor: '',
      direcionamento: '',
      descricao: '',
      recorrente: false,
      dia_semana: 'domingo',
      lancar_no_caixa: true,
    })
    setOfertaModalOpen(true)
  }

  // Abertura do modal de edição de oferta voluntária
  const handleOpenEditOferta = (of: OfertaVoluntaria) => {
    setEditingOferta(of)
    setFormData({
      data: of.data ? of.data.slice(0, 10) : getLocalDateStr(new Date()),
      valor: String(of.valor),
      direcionamento: of.direcionamento || '',
      descricao: of.descricao || '',
      recorrente: Boolean(of.recorrente),
      dia_semana: of.dia_semana || 'domingo',
      lancar_no_caixa: false,
    })
    setOfertaModalOpen(true)
  }

  // Salvar oferta voluntária
  const handleSubmitOferta = async (e: React.FormEvent) => {
    e.preventDefault()
    const valorNum = parseFloat(formData.valor.replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) {
      toast({
        variant: 'destructive',
        title: 'Valor inválido',
        description: 'Informe um valor numérico positivo para a oferta.',
      })
      return
    }

    setSavingOferta(true)
    try {
      if (editingOferta) {
        await ofertasService.updateOfertaVoluntaria(editingOferta.id, {
          data: formData.data,
          valor: valorNum,
          direcionamento: formData.direcionamento.trim() || undefined,
          descricao: formData.descricao.trim() || undefined,
        })
        toast({
          title: 'Oferta voluntária atualizada!',
          description: 'Os dados foram salvos com sucesso.',
        })
      } else {
        await ofertasService.createOfertaVoluntaria({
          data: formData.data,
          valor: valorNum,
          direcionamento: formData.direcionamento.trim() || undefined,
          descricao: formData.descricao.trim() || undefined,
          recorrente: formData.recorrente,
          dia_semana: formData.recorrente ? formData.dia_semana : undefined,
          lancar_no_caixa: formData.lancar_no_caixa,
        })
        toast({
          title: 'Oferta voluntária registrada!',
          description: formData.recorrente
            ? `Oferta semanal (${formData.dia_semana}) gerada para o mês!`
            : 'Oferta avulsa cadastrada com sucesso.',
        })
      }
      setOfertaModalOpen(false)
      await onReload()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar oferta',
        description: apiMessage(err),
      })
    } finally {
      setSavingOferta(false)
    }
  }

  // Confirmar exclusão de oferta (avulsa ou recorrente)
  const handleConfirmDeleteOferta = async () => {
    if (!deleteOferta) return
    setDeletingOferta(true)
    try {
      const isRecorrente = Boolean(deleteOferta.recorrente && deleteOferta.regra_id)

      if (isRecorrente && deleteModoRecorrente === 'todas_regra') {
        const { ofertasRemovidas } = await ofertasService.deleteRegraRecorrente(
          deleteOferta.regra_id!,
        )
        toast({
          title: 'Regra recorrente excluída',
          description: `${ofertasRemovidas} ocorrência(s) e movimentações vinculadas no caixa foram removidas.`,
        })
      } else {
        await ofertasService.deleteOfertaVoluntaria(deleteOferta.id)
        toast({
          title: 'Oferta removida com sucesso',
          description: 'A oferta e eventual lançamento vinculado no caixa foram removidos.',
        })
      }
      setDeleteOferta(null)
      await onReload()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir oferta',
        description: apiMessage(err),
      })
    } finally {
      setDeletingOferta(false)
    }
  }

  // Ação rápida: lançar ou remover oferta individual no caixa
  const handleToggleLancarNoCaixa = async (of: OfertaVoluntaria, estaNoCaixa: boolean) => {
    try {
      if (estaNoCaixa) {
        await ofertasService.removerOfertaDoCaixa(of.id)
        toast({
          title: 'Entrada removida do caixa',
          description: 'A movimentação vinculada foi desfeita.',
        })
      } else {
        await ofertasService.lancarOfertaNoCaixa(of)
        toast({
          title: 'Lançado no caixa de ofertas!',
          description: 'Entrada registrada com sucesso.',
        })
      }
      await onReload()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar caixa',
        description: apiMessage(err),
      })
    }
  }

  // Abertura do modal do caixa
  const handleOpenCaixaModal = (tipo: 'entrada' | 'saida') => {
    setCaixaModalTipo(tipo)
    const today = getLocalDateStr(new Date())
    const defaultData = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`
    setCaixaFormData({
      data: defaultData,
      valor: '',
      descricao: '',
      direcionamento: '',
    })
    setCaixaModalOpen(true)
  }

  // Salvar movimentação manual no caixa
  const handleSubmitCaixa = async (e: React.FormEvent) => {
    e.preventDefault()
    const valorNum = parseFloat(caixaFormData.valor.replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) {
      toast({
        variant: 'destructive',
        title: 'Valor inválido',
        description: 'Informe um valor numérico positivo para a movimentação.',
      })
      return
    }

    setSavingCaixa(true)
    try {
      await ofertasService.createMovimentacaoCaixa({
        tipo: caixaModalTipo,
        data: caixaFormData.data,
        valor: valorNum,
        descricao: caixaFormData.descricao.trim() || undefined,
        direcionamento: caixaFormData.direcionamento.trim() || undefined,
      })
      toast({
        title:
          caixaModalTipo === 'entrada'
            ? 'Entrada registrada no caixa!'
            : 'Saída/utilização registrada no caixa!',
        description: 'O saldo do caixa de ofertas foi atualizado.',
      })
      setCaixaModalOpen(false)
      await onReload()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar no caixa',
        description: apiMessage(err),
      })
    } finally {
      setSavingCaixa(false)
    }
  }

  // Excluir movimentação do caixa
  const handleConfirmDeleteCaixa = async () => {
    if (!deleteCaixaId) return
    setDeletingCaixa(true)
    try {
      await ofertasService.deleteMovimentacaoCaixa(deleteCaixaId)
      toast({
        title: 'Movimentação excluída',
        description: 'Registro removido do caixa de ofertas.',
      })
      setDeleteCaixaId(null)
      await onReload()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir movimentação',
        description: apiMessage(err),
      })
    } finally {
      setDeletingCaixa(false)
    }
  }

  // Ids das ofertas que já têm entrada no caixa de ofertas
  const idsOfertasNoCaixa = new Set(
    movimentacoesCaixa
      .filter((m) => m.tipo === 'entrada' && m.referencia_oferta)
      .map((m) => m.referencia_oferta!),
  )

  // Total das ofertas voluntárias cadastradas no mês
  const totalOfertasVoluntariasMes = ofertas.reduce((acc, o) => acc + (o.valor || 0), 0)

  // Filtragem de busca na lista de ofertas voluntárias
  const ofertasFiltradas = ofertas.filter((o) => {
    if (!busca.trim()) return true
    const termo = busca.toLowerCase()
    const desc = (o.descricao || '').toLowerCase()
    const dir = (o.direcionamento || '').toLowerCase()
    return desc.includes(termo) || dir.includes(termo)
  })

  return (
    <div className="space-y-6 pt-4">
      {/* DIVISOR DE CONTEXTO E AVISO EXPLÍCITO */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t-2 border-dashed border-[#DF5830]/30" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-4 text-xs font-black uppercase tracking-widest text-[#DF5830] flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Módulo Exclusivo: Ofertas Voluntárias & Caixa Dedicado
          </span>
        </div>
      </div>

      {/* BOX DE AVISO EXPLÍCITO */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-[#DF5830]/30 bg-[#DF5830]/5 p-4 sm:p-5 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <HelpCircle className="h-5 w-5 text-[#DF5830] shrink-0" />
            <span>Ofertas Voluntárias & Caixa de Ofertas</span>
            <Badge
              variant="outline"
              className="border-[#DF5830]/40 bg-[#DF5830]/10 text-[#DF5830] text-[11px] font-bold"
            >
              Sem impacto nas despesas
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
            Essas ofertas voluntárias são doações espontâneas e direcionadas (ex.: oferta de todo
            domingo, ofertas de amor, missões). Elas <strong>NÃO são agregadas às despesas</strong>{' '}
            e <strong>NÃO entram na base de cálculo</strong> de Dízimos/Ofertas/Primícias. O caixa
            abaixo controla todo o montante arrecadado e suas aplicações.
          </p>
        </div>

        {can(user?.role, 'writeFinance') && (
          <Button
            type="button"
            onClick={handleOpenNovaOferta}
            className="shrink-0 gap-1.5 bg-[#DF5830] hover:bg-[#c94b26] text-white font-bold shadow-soft"
          >
            <Plus className="h-4 w-4" />
            Registrar oferta voluntária
          </Button>
        )}
      </div>

      {/* CARD/BOX DO CAIXA DE OFERTAS (Total arrecadado no mês, Total utilizado no mês, Saldo acumulado) */}
      <Card className="border border-border shadow-soft overflow-hidden">
        <CardHeader className="bg-secondary/20 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Wallet className="h-5 w-5 text-[#DF5830]" />
                Caixa de Ofertas ({monthLabel})
              </CardTitle>
              <CardDescription>
                Controle financeiro dedicado para arrecadação voluntária e utilização dos recursos.
              </CardDescription>
            </div>

            {can(user?.role, 'writeFinance') && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenCaixaModal('entrada')}
                  className="gap-1.5 text-xs border-success/30 text-success hover:bg-success/10 hover:text-success font-semibold"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  Registrar entrada
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenCaixaModal('saida')}
                  className="gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive font-semibold"
                >
                  <ArrowDownRight className="h-4 w-4" />
                  Registrar saída / utilização
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Métricas do Caixa */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Total Arrecadado no Mês */}
            <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Arrecadado no mês ({monthLabel})
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/20 text-success">
                  <ArrowUp className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-success">
                {formatCurrency(resumoCaixa.totalEntradasMes)}
              </p>
              <span className="text-[11px] text-muted-foreground">
                Entradas registradas ou lançadas das ofertas
              </span>
            </div>

            {/* Total Utilizado / Saídas no Mês */}
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Utilizado no mês ({monthLabel})
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                  <ArrowDown className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-destructive">
                {formatCurrency(resumoCaixa.totalSaidasMes)}
              </p>
              <span className="text-[11px] text-muted-foreground">
                Aplicações, repasses e despesas do caixa
              </span>
            </div>

            {/* Saldo Acumulado Geral */}
            <div className="rounded-2xl border border-[#DF5830]/40 bg-[#DF5830]/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Saldo Acumulado do Caixa
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#DF5830]/20 text-[#DF5830]">
                  <Wallet className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-[#DF5830]">
                {formatCurrency(resumoCaixa.saldoAcumuladoGeral)}
              </p>
              <span className="text-[11px] text-muted-foreground">
                Saldo geral disponível (entradas − saídas)
              </span>
            </div>
          </div>

          {/* Histórico das movimentações do caixa no mês */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Movimentações do Caixa em {monthLabel} ({movimentacoesCaixa.length})
              </h4>
              <Badge variant="outline" className="text-[11px]">
                Saldo do mês: {formatCurrency(resumoCaixa.saldoMes)}
              </Badge>
            </div>

            {movimentacoesCaixa.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Nenhuma movimentação registrada no caixa neste mês. Utilize os botões acima ou lance
                as ofertas voluntárias diretamente no caixa.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader className="bg-secondary/40">
                    <TableRow>
                      <TableHead className="w-28 font-bold">Data</TableHead>
                      <TableHead className="w-24 font-bold">Tipo</TableHead>
                      <TableHead className="font-bold">Descrição</TableHead>
                      <TableHead className="font-bold">Direcionamento</TableHead>
                      <TableHead className="text-right font-bold w-32">Valor</TableHead>
                      {can(user?.role, 'writeFinance') && (
                        <TableHead className="w-16 text-center font-bold">Ações</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimentacoesCaixa.map((mov) => {
                      const isEntrada = mov.tipo === 'entrada'
                      return (
                        <TableRow key={mov.id} className="hover:bg-muted/40">
                          <TableCell className="font-medium text-xs whitespace-nowrap">
                            {formatDate(mov.data ? mov.data.slice(0, 10) : '')}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                isEntrada
                                  ? 'border-success/40 bg-success/10 text-success text-[11px]'
                                  : 'border-destructive/40 bg-destructive/10 text-destructive text-[11px]'
                              }
                            >
                              {isEntrada ? 'Entrada' : 'Saída'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-foreground font-medium">
                            <div>
                              <span>
                                {mov.descricao || (isEntrada ? 'Entrada de caixa' : 'Saída')}
                              </span>
                              {mov.referencia_oferta && (
                                <span className="block text-[10px] text-muted-foreground italic">
                                  Vinculado à oferta voluntária
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {mov.direcionamento ? (
                              <Badge variant="outline" className="text-[11px] bg-secondary/50">
                                {mov.direcionamento}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground italic text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell
                            className={`text-right font-bold text-xs ${
                              isEntrada ? 'text-success' : 'text-destructive'
                            }`}
                          >
                            {isEntrada ? '+' : '-'} {formatCurrency(mov.valor || 0)}
                          </TableCell>
                          {can(user?.role, 'writeFinance') && (
                            <TableCell className="text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteCaixaId(mov.id)}
                                title="Excluir movimentação"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* LISTAGEM DE OFERTAS VOLUNTÁRIAS DO MÊS */}
      <Card className="border border-border shadow-soft">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3">
          <div>
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Coins className="h-4 w-4 text-[#DF5830]" />
              Ofertas Voluntárias Registradas ({monthLabel})
            </CardTitle>
            <CardDescription>
              Ofertas descritas e direcionadas. Total de{' '}
              <strong>{formatCurrency(totalOfertasVoluntariasMes)}</strong> em {ofertas.length}{' '}
              {ofertas.length === 1 ? 'oferta' : 'ofertas'} neste mês.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar descrição ou direcionamento..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            {can(user?.role, 'writeFinance') && (
              <Button
                type="button"
                size="sm"
                onClick={handleOpenNovaOferta}
                className="gap-1.5 text-xs bg-[#DF5830] hover:bg-[#c94b26] text-white font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova oferta
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {ofertasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <Coins className="mb-2 h-10 w-10 stroke-[1.5] text-muted-foreground/60" />
              <p className="font-semibold text-foreground">
                Nenhuma oferta voluntária encontrada em {monthLabel}
              </p>
              <p className="text-xs max-w-md mt-1">
                Cadastre ofertas voluntárias avulsas ou configure para repetir todo domingo (ou
                outro dia da semana).
              </p>
              {can(user?.role, 'writeFinance') && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenNovaOferta}
                  className="mt-4 gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Registrar primeira oferta
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader className="bg-secondary/40">
                  <TableRow>
                    <TableHead className="w-28 font-bold">Data</TableHead>
                    <TableHead className="w-32 font-bold">Recorrência</TableHead>
                    <TableHead className="font-bold">Descrição</TableHead>
                    <TableHead className="font-bold">Direcionamento</TableHead>
                    <TableHead className="w-36 font-bold text-center">Status no Caixa</TableHead>
                    <TableHead className="text-right font-bold w-32">Valor</TableHead>
                    {can(user?.role, 'writeFinance') && (
                      <TableHead className="w-24 text-center font-bold">Ações</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ofertasFiltradas.map((of) => {
                    const estaNoCaixa = idsOfertasNoCaixa.has(of.id)

                    return (
                      <TableRow key={of.id} className="hover:bg-muted/40">
                        {/* Data */}
                        <TableCell className="font-medium text-xs whitespace-nowrap">
                          {formatDate(of.data ? of.data.slice(0, 10) : '')}
                        </TableCell>

                        {/* Recorrência */}
                        <TableCell className="text-xs">
                          {of.recorrente ? (
                            <Badge
                              variant="outline"
                              className="border-[#DF5830]/40 bg-[#DF5830]/10 text-[#DF5830] text-[11px] font-semibold gap-1"
                            >
                              <Repeat className="h-3 w-3" />
                              {of.dia_semana ? `Todo ${of.dia_semana}` : 'Recorrente'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[11px] text-muted-foreground">
                              Avulsa
                            </Badge>
                          )}
                        </TableCell>

                        {/* Descrição */}
                        <TableCell className="text-xs font-medium text-foreground">
                          {of.descricao || 'Oferta voluntária'}
                        </TableCell>

                        {/* Direcionamento */}
                        <TableCell className="text-xs">
                          {of.direcionamento ? (
                            <Badge
                              variant="outline"
                              className="border-[#B7791F]/40 bg-[#B7791F]/10 text-[#B7791F] text-[11px] font-semibold flex items-center gap-1 w-fit"
                            >
                              <Tag className="h-3 w-3" />
                              {of.direcionamento}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">Geral</span>
                          )}
                        </TableCell>

                        {/* Status no Caixa / Botão rápido de inclusão */}
                        <TableCell className="text-center">
                          {can(user?.role, 'writeFinance') ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={estaNoCaixa ? 'secondary' : 'outline'}
                              onClick={() => handleToggleLancarNoCaixa(of, estaNoCaixa)}
                              className={`h-7 px-2 text-[11px] gap-1 font-semibold ${
                                estaNoCaixa
                                  ? 'bg-success/15 text-success hover:bg-success/25 border-success/30'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                              title={
                                estaNoCaixa
                                  ? 'Clique para remover esta entrada do caixa'
                                  : 'Clique para lançar como entrada no caixa de ofertas'
                              }
                            >
                              {estaNoCaixa ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                  No caixa
                                </>
                              ) : (
                                <>+ Lançar no caixa</>
                              )}
                            </Button>
                          ) : estaNoCaixa ? (
                            <Badge
                              variant="outline"
                              className="border-success/40 bg-success/10 text-success text-[11px]"
                            >
                              No caixa
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">
                              Fora do caixa
                            </span>
                          )}
                        </TableCell>

                        {/* Valor */}
                        <TableCell className="text-right font-black text-sm text-[#DF5830]">
                          {formatCurrency(of.valor || 0)}
                        </TableCell>

                        {/* Ações */}
                        {can(user?.role, 'writeFinance') && (
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenEditOferta(of)}
                                title="Editar oferta"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  setDeleteOferta(of)
                                  setDeleteModoRecorrente('apenas_esta')
                                }}
                                title="Excluir oferta"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}

                  {/* Subtotal */}
                  <TableRow className="bg-secondary/30 font-bold border-t-2 border-border">
                    <TableCell colSpan={5} className="text-right uppercase tracking-wider text-xs">
                      Total de Ofertas Voluntárias do Mês:
                    </TableCell>
                    <TableCell className="text-right text-base text-[#DF5830] font-black">
                      {formatCurrency(totalOfertasVoluntariasMes)}
                    </TableCell>
                    {can(user?.role, 'writeFinance') && <TableCell />}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIALOG: REGISTRAR / EDITAR OFERTA VOLUNTÁRIA */}
      <Dialog open={ofertaModalOpen} onOpenChange={setOfertaModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-[#DF5830]" />
              {editingOferta ? 'Editar oferta voluntária' : 'Registrar oferta voluntária'}
            </DialogTitle>
            <DialogDescription>
              {editingOferta
                ? 'Atualize os dados desta oferta.'
                : 'Ofertas direcionadas e descritas não são agregadas às despesas operacionais.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitOferta} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Data */}
              <div className="space-y-1.5">
                <Label htmlFor="of-data">Data</Label>
                <Input
                  id="of-data"
                  type="date"
                  value={formData.data}
                  onChange={(e) => setFormData((prev) => ({ ...prev, data: e.target.value }))}
                  required
                />
              </div>

              {/* Valor */}
              <div className="space-y-1.5">
                <Label htmlFor="of-valor">Valor (R$)</Label>
                <Input
                  id="of-valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={formData.valor}
                  onChange={(e) => setFormData((prev) => ({ ...prev, valor: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Direcionamento */}
            <div className="space-y-1.5">
              <Label htmlFor="of-direcionamento">Direcionamento (opcional)</Label>
              <Input
                id="of-direcionamento"
                placeholder="Ex.: Igreja Sede, Ministério de Louvor, Missões, Bateria..."
                value={formData.direcionamento}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, direcionamento: e.target.value }))
                }
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="of-desc">Descrição / Detalhes</Label>
              <Textarea
                id="of-desc"
                placeholder="Ex.: Oferta dominical em espécie, oferta de gratidão..."
                rows={2}
                value={formData.descricao}
                onChange={(e) => setFormData((prev) => ({ ...prev, descricao: e.target.value }))}
              />
            </div>

            {/* Opção de Recorrência (somente na criação) */}
            {!editingOferta && (
              <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="of-recorrente"
                    checked={formData.recorrente}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, recorrente: Boolean(checked) }))
                    }
                  />
                  <Label
                    htmlFor="of-recorrente"
                    className="text-xs font-bold text-foreground cursor-pointer flex items-center gap-1.5"
                  >
                    <Repeat className="h-3.5 w-3.5 text-[#DF5830]" />
                    Repetir toda semana (recorrência)
                  </Label>
                </div>

                {formData.recorrente && (
                  <div className="space-y-1.5 pt-1 pl-6">
                    <Label htmlFor="of-dia-semana" className="text-xs text-muted-foreground">
                      Dia da semana
                    </Label>
                    <Select
                      value={formData.dia_semana}
                      onValueChange={(val) =>
                        setFormData((prev) => ({
                          ...prev,
                          dia_semana: val as DiaSemanaOferta,
                        }))
                      }
                    >
                      <SelectTrigger id="of-dia-semana" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIAS_SEMANA_OPCOES.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Ao salvar, geraremos automaticamente as ofertas correspondentes a todos os{' '}
                      <strong>{formData.dia_semana}s</strong> do mês selecionado.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Opção: Lançar no caixa automaticamente */}
            {!editingOferta && (
              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="of-caixa"
                  checked={formData.lancar_no_caixa}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, lancar_no_caixa: Boolean(checked) }))
                  }
                />
                <Label htmlFor="of-caixa" className="text-xs font-semibold cursor-pointer">
                  Lançar como entrada no Caixa de Ofertas imediatamente
                </Label>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOfertaModalOpen(false)}
                disabled={savingOferta}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingOferta}
                className="bg-[#DF5830] hover:bg-[#c94b26] text-white"
              >
                {savingOferta ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {editingOferta ? 'Salvar alterações' : 'Registrar oferta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG: REGISTRAR MOVIMENTAÇÃO NO CAIXA (Entrada avulsa ou Saída/Utilização) */}
      <Dialog open={caixaModalOpen} onOpenChange={setCaixaModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {caixaModalTipo === 'entrada' ? (
                <>
                  <ArrowUpRight className="h-5 w-5 text-success" />
                  Registrar Entrada no Caixa de Ofertas
                </>
              ) : (
                <>
                  <ArrowDownRight className="h-5 w-5 text-destructive" />
                  Registrar Saída / Aplicação da Oferta
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {caixaModalTipo === 'entrada'
                ? 'Lançamento de valor recebido diretamente no caixa de ofertas (ex.: doação avulsa em dinheiro).'
                : 'Aplicação ou destinação do recurso arrecadado (ex.: compra de instrumento, ajuda missionária).'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitCaixa} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cx-data">Data</Label>
                <Input
                  id="cx-data"
                  type="date"
                  value={caixaFormData.data}
                  onChange={(e) => setCaixaFormData((prev) => ({ ...prev, data: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cx-valor">Valor (R$)</Label>
                <Input
                  id="cx-valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={caixaFormData.valor}
                  onChange={(e) => setCaixaFormData((prev) => ({ ...prev, valor: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cx-direcionamento">Direcionamento / Destino</Label>
              <Input
                id="cx-direcionamento"
                placeholder="Ex.: Ministério de Louvor, Missões África, Sede..."
                value={caixaFormData.direcionamento}
                onChange={(e) =>
                  setCaixaFormData((prev) => ({ ...prev, direcionamento: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cx-desc">Descrição</Label>
              <Textarea
                id="cx-desc"
                placeholder={
                  caixaModalTipo === 'entrada'
                    ? 'Ex.: Doação recebida em culto'
                    : 'Ex.: Aquisição de cabos para sonorização'
                }
                rows={2}
                value={caixaFormData.descricao}
                onChange={(e) =>
                  setCaixaFormData((prev) => ({ ...prev, descricao: e.target.value }))
                }
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCaixaModalOpen(false)}
                disabled={savingCaixa}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingCaixa}
                className={
                  caixaModalTipo === 'entrada'
                    ? 'bg-success hover:bg-success/90 text-white'
                    : 'bg-destructive hover:bg-destructive/90 text-white'
                }
              >
                {savingCaixa ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {caixaModalTipo === 'entrada' ? 'Registrar entrada' : 'Registrar saída'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAÇÃO DE EXCLUSÃO DE OFERTA */}
      <AlertDialog
        open={Boolean(deleteOferta)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteOferta(null)
            setDeleteModoRecorrente('apenas_esta')
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Excluir oferta voluntária?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1 text-xs text-muted-foreground">
                <p>
                  Você está excluindo a oferta de{' '}
                  <strong className="text-foreground">
                    {formatCurrency(deleteOferta?.valor || 0)}
                  </strong>{' '}
                  referente a{' '}
                  <strong className="text-foreground">
                    {deleteOferta?.data ? formatDate(deleteOferta.data.slice(0, 10)) : ''}
                  </strong>
                  {deleteOferta?.direcionamento && (
                    <>
                      {' '}
                      (Direcionamento: <em>{deleteOferta.direcionamento}</em>)
                    </>
                  )}
                  . Se houver entrada lançada no Caixa de Ofertas, ela será automaticamente
                  desfeita.
                </p>

                {deleteOferta?.recorrente && deleteOferta.regra_id && (
                  <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <Repeat className="h-3.5 w-3.5 text-[#DF5830]" />
                      Esta oferta faz parte de uma recorrência semanal
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Escolha como deseja aplicar a exclusão:
                    </p>
                    <div className="space-y-2 pt-1">
                      <label className="flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition hover:bg-background/80 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                        <input
                          type="radio"
                          name="modo-exclusao-oferta"
                          className="mt-0.5 text-primary focus:ring-primary"
                          checked={deleteModoRecorrente === 'apenas_esta'}
                          onChange={() => setDeleteModoRecorrente('apenas_esta')}
                        />
                        <div className="text-xs">
                          <strong className="block text-foreground">
                            Excluir apenas esta ocorrência (
                            {deleteOferta.data ? formatDate(deleteOferta.data.slice(0, 10)) : ''})
                          </strong>
                          <span className="text-[11px] text-muted-foreground">
                            Mantém as outras semanas e a regra recorrente ativas.
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition hover:bg-background/80 has-[:checked]:border-destructive has-[:checked]:bg-destructive/5">
                        <input
                          type="radio"
                          name="modo-exclusao-oferta"
                          className="mt-0.5 text-destructive focus:ring-destructive"
                          checked={deleteModoRecorrente === 'todas_regra'}
                          onChange={() => setDeleteModoRecorrente('todas_regra')}
                        />
                        <div className="text-xs">
                          <strong className="block text-destructive">
                            Excluir a regra e todas as suas ocorrências
                          </strong>
                          <span className="text-[11px] text-muted-foreground">
                            Cancela definitivamente a série semanal e remove todos os lançamentos
                            vinculados no caixa.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2">
            <AlertDialogCancel disabled={deletingOferta}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteOferta}
              disabled={deletingOferta}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {deletingOferta && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              {deleteOferta?.recorrente && deleteModoRecorrente === 'todas_regra'
                ? 'Excluir regra completa'
                : 'Excluir oferta'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRMAÇÃO DE EXCLUSÃO DE MOVIMENTAÇÃO DO CAIXA */}
      <AlertDialog
        open={Boolean(deleteCaixaId)}
        onOpenChange={(open) => !open && setDeleteCaixaId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir movimentação do caixa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá permanentemente esta movimentação do Caixa de Ofertas e recalculará
              o saldo acumulado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCaixa}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteCaixa}
              disabled={deletingCaixa}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {deletingCaixa && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              Excluir do caixa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
