import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, FileText, LoaderCircle, Sparkles, X } from 'lucide-react'

import { MoneyInput } from '@/components/MoneyInput'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { dateOnly, formatCurrency, formatDate, toPocketBaseDate } from '@/lib/format'
import { telegramPendentesService } from '@/services/telegramPendentes'
import type {
  Categoria,
  Conta,
  Empresa,
  Lancamento,
  Pessoa,
  TelegramRegistroPendente,
  TransactionType,
} from '@/types/domain'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: TelegramRegistroPendente | null
  contas: Conta[]
  categorias: Categoria[]
  empresas?: Empresa[]
  pessoas?: Pessoa[]
  onApproved: () => void
}

export function AprovarPendenteDialog({
  open,
  onOpenChange,
  item,
  contas,
  categorias,
  empresas = [],
  pessoas = [],
  onApproved,
}: Props) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    descricao: '',
    valor: 0,
    tipo: 'despesa' as TransactionType,
    data: new Date().toISOString().slice(0, 10),
    conta: '',
    categoria: '',
    empresa: '',
    pessoa: '',
    observacoes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicates, setDuplicates] = useState<Lancamento[]>([])
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !item) return
    setErrors({})
    setConfirmedDuplicate(false)

    // Preencher com os dados extraídos do registro pendente
    const initialForm = {
      descricao: item.descricao || '',
      valor: item.valor || 0,
      tipo: item.tipo || 'despesa',
      data: item.data ? dateOnly(item.data) : new Date().toISOString().slice(0, 10),
      conta: item.conta || contas.find((c) => c.ativa)?.id || '',
      categoria: item.categoria || '',
      empresa: item.empresa || '',
      pessoa: item.pessoa || '',
      observacoes:
        item.observacoes || (item.contexto_nome ? `Contexto: ${item.contexto_nome}` : ''),
    }
    setForm(initialForm)

    // Verificar duplicidades no sistema
    if (initialForm.valor > 0 && initialForm.data) {
      setCheckingDuplicates(true)
      telegramPendentesService
        .checkDuplicates(initialForm.valor, initialForm.tipo, initialForm.data)
        .then((dupes) => {
          setDuplicates(dupes)
        })
        .catch(() => setDuplicates([]))
        .finally(() => setCheckingDuplicates(false))
    } else {
      setDuplicates([])
    }
  }, [contas, item, open])

  const categoryOptions = useMemo(
    () => categorias.filter((c) => c.tipo === form.tipo),
    [categorias, form.tipo],
  )

  const handleTipoChange = (newTipo: string) => {
    if (!newTipo) return
    setForm((current) => ({
      ...current,
      tipo: newTipo as TransactionType,
      categoria: '',
    }))
  }

  const handleBlurCheckDuplicates = () => {
    if (form.valor > 0 && form.data) {
      telegramPendentesService
        .checkDuplicates(form.valor, form.tipo, form.data)
        .then((dupes) => {
          setDuplicates(dupes)
        })
        .catch(() => {})
    }
  }

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item) return

    const nextErrors: Record<string, string> = {}
    if (!form.descricao.trim()) nextErrors.descricao = 'Informe uma descrição.'
    if (form.valor <= 0) nextErrors.valor = 'Informe um valor maior que zero.'
    if (!form.conta) nextErrors.conta = 'Selecione a conta bancária/cartão.'
    if (!form.categoria) nextErrors.categoria = 'Selecione a categoria.'
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) return

    // Se houver duplicidade detectada e ainda não confirmou explicitamente
    if (duplicates.length > 0 && !confirmedDuplicate) {
      setConfirmedDuplicate(true)
      toast({
        variant: 'destructive',
        title: 'Possível duplicidade identificada',
        description:
          'Existe lançamento com mesmo valor na mesma data. Clique em "Aprovar mesmo assim" para confirmar.',
      })
      return
    }

    setSaving(true)
    try {
      await telegramPendentesService.aprovarELancar(item.id, {
        descricao: form.descricao.trim(),
        valor: form.valor,
        tipo: form.tipo,
        data: toPocketBaseDate(form.data),
        conta: form.conta,
        categoria: form.categoria,
        empresa: form.empresa || undefined,
        pessoa: form.pessoa || undefined,
        observacoes: form.observacoes.trim() || undefined,
      })

      toast({
        title: 'Lançamento aprovado com sucesso!',
        description: `“${form.descricao}” foi adicionado aos lançamentos oficiais.`,
      })
      onApproved()
      onOpenChange(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao aprovar lançamento',
        description: apiMessage(err),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <Sparkles className="mr-1 h-3 w-3" />
              Origem: Telegram
            </Badge>
            {item?.contexto_nome && (
              <Badge variant="secondary" className="text-xs">
                Contexto: {item.contexto_nome}
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl font-bold">Aprovar e Lançar no Sistema</DialogTitle>
          <DialogDescription>
            Revise ou ajuste os dados extraídos pelo bot do Telegram antes de registrar no caixa
            oficial.
          </DialogDescription>
        </DialogHeader>

        {/* Alerta de duplicidade se encontrado lançamento idêntico */}
        {duplicates.length > 0 && (
          <Alert
            variant="destructive"
            className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-300 font-bold">
              Atenção: Já existe {duplicates.length} lançamento(s) similar hoje!
            </AlertTitle>
            <AlertDescription className="text-xs space-y-1 mt-1">
              {duplicates.map((dupe) => (
                <div
                  key={dupe.id}
                  className="flex justify-between border-t border-amber-300/40 pt-1"
                >
                  <span>
                    {dupe.descricao} ({formatDate(dupe.data)})
                  </span>
                  <span className="font-bold">{formatCurrency(dupe.valor)}</span>
                </div>
              ))}
              <p className="mt-1 font-semibold text-amber-800 dark:text-amber-300">
                Se for o mesmo gasto/recibo, você pode descartar. Caso seja outro gasto no mesmo
                valor, confirme o botão de aprovação.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Texto extraído do comprovante (se houver) */}
        {item?.comprovante_texto && (
          <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs">
            <span className="flex items-center gap-1 font-bold text-muted-foreground mb-1">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Texto/Dados brutos do comprovante:
            </span>
            <p className="line-clamp-3 text-muted-foreground whitespace-pre-wrap font-mono text-[11px]">
              {item.comprovante_texto}
            </p>
          </div>
        )}

        <form onSubmit={handleApprove} className="space-y-4">
          <ToggleGroup
            type="single"
            value={form.tipo}
            onValueChange={handleTipoChange}
            className="grid grid-cols-2 rounded-xl bg-secondary p-1"
          >
            <ToggleGroupItem
              value="receita"
              className="rounded-lg data-[state=on]:bg-success data-[state=on]:text-white font-bold"
            >
              🟢 Receita (Entrada)
            </ToggleGroupItem>
            <ToggleGroupItem
              value="despesa"
              className="rounded-lg data-[state=on]:bg-primary data-[state=on]:text-white font-bold"
            >
              🔴 Despesa (Saída)
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="descricao" className="text-xs font-bold">
                Descrição / Favorecido
              </Label>
              <Input
                id="descricao"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex.: CPFL Energia, Supermercado..."
              />
              {errors.descricao && <p className="text-xs text-destructive">{errors.descricao}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Valor</Label>
              <MoneyInput
                value={form.valor}
                onChange={(v) => {
                  setForm({ ...form, valor: v })
                  setConfirmedDuplicate(false)
                }}
                onBlur={handleBlurCheckDuplicates}
              />
              {errors.valor && <p className="text-xs text-destructive">{errors.valor}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="data" className="text-xs font-bold">
                Data do lançamento
              </Label>
              <Input
                id="data"
                type="date"
                value={form.data}
                onChange={(e) => {
                  setForm({ ...form, data: e.target.value })
                  setConfirmedDuplicate(false)
                }}
                onBlur={handleBlurCheckDuplicates}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Conta Bancária / Cartão</Label>
              <Select value={form.conta} onValueChange={(v) => setForm({ ...form, conta: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} {c.bandeira ? `(${c.bandeira})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.conta && <p className="text-xs text-destructive">{errors.conta}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Categoria</Label>
              <Select
                value={form.categoria}
                onValueChange={(v) => setForm({ ...form, categoria: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoria && <p className="text-xs text-destructive">{errors.categoria}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Empresa (opcional)</Label>
              <Select
                value={form.empresa || 'none'}
                onValueChange={(v) => setForm({ ...form, empresa: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {empresas.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.nome_fantasia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Pessoa (opcional)</Label>
              <Select
                value={form.pessoa || 'none'}
                onValueChange={(v) => setForm({ ...form, pessoa: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {pessoas.map((pes) => (
                    <SelectItem key={pes.id} value={pes.id}>
                      {pes.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="observacoes" className="text-xs font-bold">
                Observações adicionais
              </Label>
              <Textarea
                id="observacoes"
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Observações do lançamento..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="mr-1.5 h-4 w-4" />
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || checkingDuplicates}
              className="bg-primary hover:bg-primary/90 text-white font-bold"
            >
              {saving ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {duplicates.length > 0 && !confirmedDuplicate
                ? 'Verificar e Aprovar'
                : 'Aprovar e Lançar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
