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
import { formatCNPJ, formatPhone, isValidCNPJ } from '@/lib/documents'
import { cadastrosService } from '@/services/cadastros'
import type { Empresa } from '@/types/domain'

const initial = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  email: '',
  telefone: '',
  endereco: '',
  observacoes: '',
}
export function EmpresaDialog({
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  record: Empresa | null
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
              razao_social: record.razao_social,
              nome_fantasia: record.nome_fantasia,
              cnpj: record.cnpj,
              email: record.email || '',
              telefone: record.telefone || '',
              endereco: record.endereco || '',
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
    if (!form.razao_social.trim()) next.razao_social = 'Informe a razão social.'
    if (!form.nome_fantasia.trim()) next.nome_fantasia = 'Informe o nome fantasia.'
    if (!form.cnpj.trim()) {
      next.cnpj = 'Informe o CNPJ.'
    } else if (!isValidCNPJ(form.cnpj)) {
      next.cnpj = 'CNPJ inválido'
    }
    setErrors(next)
    if (Object.keys(next).length) {
      toast({
        variant: 'destructive',
        title: 'Verifique os dados',
        description:
          next.cnpj ||
          next.razao_social ||
          next.nome_fantasia ||
          'Preencha todos os campos obrigatórios corretamente.',
      })
      return
    }
    setSaving(true)
    try {
      await cadastrosService.saveEmpresa(form, record?.id)
      toast({ title: 'Empresa salva com sucesso' })
      onOpenChange(false)
      onSaved()
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : ''
      const isDuplicate =
        /unique/i.test(rawMsg) ||
        /already in use/i.test(rawMsg) ||
        /idx_empresas_cnpj/i.test(rawMsg) ||
        typeof (error as { response?: { data?: Record<string, unknown> } })?.response?.data
          ?.cnpj !== 'undefined'

      const fields = apiFieldErrors(error)
      if (fields.cnpj || isDuplicate) {
        fields.cnpj = 'Este CNPJ já está cadastrado'
      }

      const formError = isDuplicate ? 'Este CNPJ já está cadastrado' : apiMessage(error)

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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? 'Editar empresa' : 'Nova empresa'}</DialogTitle>
          <DialogDescription>Cadastre os dados fiscais e de contato da empresa.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Razão social</Label>
              <Input
                value={form.razao_social}
                onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
              />
              {errors.razao_social && <p className="field-error">{errors.razao_social}</p>}
            </div>
            <div className="space-y-2">
              <Label>Nome fantasia</Label>
              <Input
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
              />
              {errors.nome_fantasia && <p className="field-error">{errors.nome_fantasia}</p>}
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input
                inputMode="numeric"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: formatCNPJ(e.target.value) })}
                placeholder="00.000.000/0000-00"
              />
              {errors.cnpj && <p className="field-error">{errors.cnpj}</p>}
            </div>
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
            <div className="space-y-2 sm:col-span-2">
              <Label>Endereço</Label>
              <Input
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
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
              Salvar empresa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
