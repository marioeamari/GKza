import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, Save } from 'lucide-react'

import { MoneyInput } from '@/components/MoneyInput'
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
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { getAvisoFaturaCartao, calcularFaturaCartao } from '@/lib/cartao-fatura'
import { dateOnly, toPocketBaseDate } from '@/lib/format'
import { financeService } from '@/services/finance'
import { ContaContextoWarning } from '@/components/ContaContextoWarning'
import { AnexoUploadField } from '@/components/despesas/AnexoUploadField'
import type {
  Categoria,
  Conta,
  Empresa,
  Lancamento,
  Pessoa,
  TransactionStatus,
  TransactionType,
} from '@/types/domain'

interface Props {
  open: boolean
  onOpenChange: (value: boolean) => void
  contas: Conta[]
  categorias: Categoria[]
  empresas?: Empresa[]
  pessoas?: Pessoa[]
  lancamento?: Lancamento | null
  presetConta?: string
  onSaved?: (record: Lancamento) => void
}

const initial = {
  descricao: '',
  valor: 0,
  tipo: 'despesa' as TransactionType,
  data: new Date().toISOString().slice(0, 10),
  status: 'pago' as TransactionStatus,
  conta: '',
  categoria: '',
  empresa: '',
  pessoa: '',
  observacoes: '',
}

export function LancamentoDialog({
  open,
  onOpenChange,
  contas,
  categorias,
  empresas = [],
  pessoas = [],
  lancamento,
  presetConta,
  onSaved,
}: Props) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [selectedComprovante, setSelectedComprovante] = useState<File | null>(null)
  const [removerComprovante, setRemoverComprovante] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setErrors({})
    setSelectedComprovante(null)
    setRemoverComprovante(false)
    setForm(
      lancamento
        ? {
            descricao: lancamento.descricao,
            valor: lancamento.valor,
            tipo: lancamento.tipo,
            data: dateOnly(lancamento.data),
            status: lancamento.status,
            conta: lancamento.conta,
            categoria: lancamento.categoria,
            empresa: lancamento.empresa || '',
            pessoa: lancamento.pessoa || '',
            observacoes: lancamento.observacoes || '',
          }
        : { ...initial, conta: presetConta || contas.find((item) => item.ativa)?.id || '' },
    )
  }, [contas, lancamento, open, presetConta])

  const categoryOptions = useMemo(
    () => categorias.filter((item) => item.tipo === form.tipo),
    [categorias, form.tipo],
  )
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!form.descricao.trim()) next.descricao = 'Informe uma descrição.'
    if (form.valor <= 0) next.valor = 'Informe um valor maior que zero.'
    if (!form.conta) next.conta = 'Selecione uma conta.'
    if (!form.categoria) next.categoria = 'Selecione uma categoria.'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      const selectedConta = contas.find((c) => c.id === form.conta)
      const isCartao = selectedConta?.tipo === 'cartao'

      // Se for conta tipo 'cartao', calcular a competência da fatura e o status inicial
      let extraData: Partial<Lancamento> = {}
      if (isCartao) {
        const faturaCiclo = calcularFaturaCartao(selectedConta, form.data)
        extraData = {
          competencia: faturaCiclo.competencia,
          // Compras em cartão ficam como pendentes até a baixa da fatura (ou mantém fatura_paga caso já estivesse paga)
          status: lancamento?.fatura_paga ? 'pago' : 'pendente',
          fatura_paga: lancamento?.fatura_paga || false,
        }
      } else {
        const compStr = form.data.slice(0, 7)
        extraData = {
          competencia: compStr,
        }
      }

      let record: Lancamento
      const payloadData = {
        ...form,
        descricao: form.descricao.trim(),
        data: toPocketBaseDate(form.data),
        empresa: form.empresa || '',
        pessoa: form.pessoa || '',
        ...extraData,
      }

      if (selectedComprovante || removerComprovante) {
        const fd = new FormData()
        Object.entries(payloadData).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            fd.append(key, String(value))
          }
        })
        if (selectedComprovante) {
          fd.append('comprovante', selectedComprovante)
        } else if (removerComprovante) {
          fd.append('comprovante', '')
        }
        record = await financeService.saveLancamento(fd, lancamento?.id, {
          expand: 'conta,categoria,empresa,pessoa',
        })
      } else {
        record = await financeService.saveLancamento(
          {
            ...payloadData,
            empresa: form.empresa || null,
            pessoa: form.pessoa || null,
          } as Partial<Lancamento>,
          lancamento?.id,
          { expand: 'conta,categoria,empresa,pessoa' },
        )
      }
      toast({
        title: 'Lançamento salvo',
        description: 'O saldo e os relatórios já foram atualizados.',
      })
      onSaved?.(record)
      onOpenChange(false)
    } catch (error) {
      setErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  const updateType = (tipo: string) => {
    if (tipo) setForm((current) => ({ ...current, tipo: tipo as TransactionType, categoria: '' }))
  }

  const selectedContaObj = contas.find((c) => c.id === form.conta)
  const avisoFatura = useMemo(() => {
    return getAvisoFaturaCartao(selectedContaObj, form.data)
  }, [selectedContaObj, form.data])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lancamento ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
          <DialogDescription>
            Registre uma receita ou despesa e mantenha seu caixa em dia.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <ToggleGroup
            type="single"
            value={form.tipo}
            onValueChange={updateType}
            className="grid grid-cols-2 rounded-xl bg-secondary p-1"
          >
            <ToggleGroupItem
              value="receita"
              className="rounded-lg data-[state=on]:bg-success data-[state=on]:text-white"
            >
              Receita
            </ToggleGroupItem>
            <ToggleGroupItem
              value="despesa"
              className="rounded-lg data-[state=on]:bg-primary data-[state=on]:text-white"
            >
              Despesa
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex.: Pagamento de fornecedor"
              />
              {errors.descricao && <p className="field-error">{errors.descricao}</p>}
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <MoneyInput value={form.valor} onChange={(valor) => setForm({ ...form, valor })} />
              {errors.valor && <p className="field-error">{errors.valor}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="data">Data da compra / transação</Label>
              <Input
                id="data"
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
              {avisoFatura && (
                <p className="rounded-lg bg-primary/10 p-2 text-xs font-semibold text-primary">
                  {avisoFatura}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Conta</Label>
              <Select value={form.conta} onValueChange={(conta) => setForm({ ...form, conta })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {contas
                    .filter((item) => item.ativa || (lancamento && item.id === form.conta))
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.nome}
                        {!item.ativa ? ' (Inativa)' : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.conta && <p className="field-error">{errors.conta}</p>}
              {form.conta && (
                <ContaContextoWarning contaId={form.conta} contas={contas} className="mt-1" />
              )}
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={form.categoria}
                onValueChange={(categoria) => setForm({ ...form, categoria })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoria && <p className="field-error">{errors.categoria}</p>}
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              {selectedContaObj?.tipo === 'cartao' ? (
                <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                  {lancamento?.fatura_paga
                    ? 'Quitado (Fatura paga)'
                    : 'Pendente (Aguardando fechamento e pagamento da fatura)'}
                </div>
              ) : (
                <Select
                  value={form.status}
                  onValueChange={(status) =>
                    setForm({ ...form, status: status as TransactionStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Empresa (opcional)</Label>
              <Select
                value={form.empresa || 'none'}
                onValueChange={(empresa) =>
                  setForm({ ...form, empresa: empresa === 'none' ? '' : empresa })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {empresas.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome_fantasia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pessoa (opcional)</Label>
              <Select
                value={form.pessoa || 'none'}
                onValueChange={(pessoa) =>
                  setForm({ ...form, pessoa: pessoa === 'none' ? '' : pessoa })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {pessoas.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Detalhes adicionais..."
              />
            </div>
            <div className="sm:col-span-2 pt-1 border-t border-border">
              <AnexoUploadField
                label="Comprovante da transação (opcional)"
                helperText="Aceita PDF ou imagem do dispositivo/câmera (até 15MB)"
                selectedFile={selectedComprovante}
                onFileSelect={(file) => {
                  setSelectedComprovante(file)
                  if (file) setRemoverComprovante(false)
                }}
                currentFileName={lancamento?.comprovante}
                collectionNameOrId="lancamentos"
                recordId={lancamento?.id}
                isRemovingCurrent={removerComprovante}
                onRemoveCurrent={() => {
                  setRemoverComprovante(true)
                  setSelectedComprovante(null)
                }}
                disabled={saving}
              />
            </div>
          </div>
          {errors.form && (
            <p className="field-error rounded-lg bg-destructive/10 p-3">{errors.form}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={saving}>
              {saving ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar lançamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
