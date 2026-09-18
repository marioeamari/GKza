import { useEffect, useState } from 'react'
import { LoaderCircle, Save } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { formatCPF, formatPhone, isValidCPF } from '@/lib/documents'
import { cadastrosService } from '@/services/cadastros'
import type { Pessoa } from '@/types/domain'

const initial = { nome: '', cpf: '', email: '', telefone: '', observacoes: '' }
export function PessoaDialog({
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  record: Pessoa | null
  onSaved: () => void
}) {
  const [form, setForm] = useState(initial),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [saving, setSaving] = useState(false)
  const { toast } = useToast()
  useEffect(() => {
    if (open) {
      setForm(
        record
          ? {
              nome: record.nome,
              cpf: record.cpf,
              email: record.email || '',
              telefone: record.telefone || '',
              observacoes: record.observacoes || '',
            }
          : initial,
      )
      setErrors({})
    }
  }, [open, record])
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.nome.trim()) next.nome = 'Informe o nome completo.'
    if (!form.cpf.trim()) {
      next.cpf = 'Informe o CPF.'
    } else if (!isValidCPF(form.cpf)) {
      next.cpf = 'CPF inválido'
    }
    setErrors(next)
    if (Object.keys(next).length) {
      toast({
        variant: 'destructive',
        title: 'Verifique os dados',
        description: next.cpf || next.nome || 'Preencha todos os campos obrigatórios corretamente.',
      })
      return
    }
    setSaving(true)
    try {
      await cadastrosService.savePessoa(form, record?.id)
      toast({ title: 'Pessoa salva com sucesso' })
      onOpenChange(false)
      onSaved()
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : ''
      const isDuplicate =
        /unique/i.test(rawMsg) ||
        /already in use/i.test(rawMsg) ||
        /idx_pessoas_cpf/i.test(rawMsg) ||
        typeof (error as { response?: { data?: Record<string, unknown> } })?.response?.data?.cpf !==
          'undefined'

      const fields = apiFieldErrors(error)
      if (fields.cpf || isDuplicate) {
        fields.cpf = 'Este CPF já está cadastrado'
      }

      const formError = isDuplicate ? 'Este CPF já está cadastrado' : apiMessage(error)

      setErrors({ ...fields, form: formError })
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar',
        description: formError,
      })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{record ? 'Editar pessoa' : 'Nova pessoa'}</DialogTitle>
          <DialogDescription>Cadastre o documento e os dados de contato.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            {errors.nome && <p className="field-error">{errors.nome}</p>}
          </div>
          <div className="space-y-2">
            <Label>CPF</Label>
            <Input
              inputMode="numeric"
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })}
              placeholder="000.000.000-00"
            />
            {errors.cpf && <p className="field-error">{errors.cpf}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: formatPhone(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
          {errors.form && <p className="field-error">{errors.form}</p>}
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
              Salvar pessoa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
