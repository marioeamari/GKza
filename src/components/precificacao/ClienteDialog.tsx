import { useEffect, useState } from 'react'
import { LoaderCircle, Save, Building2, UserRound } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { formatCPF, formatCNPJ, formatPhone } from '@/lib/documents'
import { clientesOrcamentoService } from '@/services/clientesOrcamento'
import { ClienteOrcamentoRecord, TipoClienteOrcamento } from '@/types/orcamento'

interface ClienteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: ClienteOrcamentoRecord | null
  initialNome?: string
  initialWhatsapp?: string
  onSaved: (cliente: ClienteOrcamentoRecord) => void
}

export function ClienteDialog({
  open,
  onOpenChange,
  record,
  initialNome = '',
  initialWhatsapp = '',
  onSaved,
}: ClienteDialogProps) {
  const { toast } = useToast()
  const [salvando, setSalvando] = useState(false)

  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoClienteOrcamento>('pessoa_fisica')
  const [documento, setDocumento] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [observacoes, setObservacoes] = useState('')

  useEffect(() => {
    if (open) {
      if (record) {
        setNome(record.nome || '')
        setTipo(record.tipo || 'pessoa_fisica')
        setDocumento(record.documento || '')
        setWhatsapp(record.whatsapp || '')
        setEmail(record.email || '')
        setTelefone(record.telefone || '')
        setObservacoes(record.observacoes || '')
      } else {
        setNome(initialNome)
        setTipo('pessoa_fisica')
        setDocumento('')
        setWhatsapp(initialWhatsapp)
        setEmail('')
        setTelefone('')
        setObservacoes('')
      }
    }
  }, [open, record, initialNome, initialWhatsapp])

  const handleDocumentoChange = (valor: string) => {
    if (tipo === 'pessoa_fisica') {
      setDocumento(formatCPF(valor))
    } else {
      setDocumento(formatCNPJ(valor))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome ou razão social do cliente.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvando(true)
      let clienteSalvo: ClienteOrcamentoRecord

      if (record?.id) {
        clienteSalvo = await clientesOrcamentoService.updateCliente(record.id, {
          nome,
          tipo,
          documento,
          whatsapp,
          email,
          telefone,
          observacoes,
        })
        toast({
          title: 'Cliente atualizado',
          description: `Os dados de ${clienteSalvo.nome} foram salvos.`,
        })
      } else {
        clienteSalvo = await clientesOrcamentoService.createCliente({
          nome,
          tipo,
          documento,
          whatsapp,
          email,
          telefone,
          observacoes,
        })
        toast({
          title: 'Cliente cadastrado',
          description: `${clienteSalvo.nome} foi cadastrado com sucesso.`,
        })
      }

      onSaved(clienteSalvo)
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao salvar cliente:', err)
      toast({
        title: 'Erro ao salvar cliente',
        description: err.message || 'Verifique as informações preenchidas.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            {tipo === 'pessoa_juridica' ? (
              <Building2 className="w-5 h-5 text-primary" />
            ) : (
              <UserRound className="w-5 h-5 text-primary" />
            )}
            {record ? 'Editar Cliente' : 'Novo Cliente de Orçamento'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cadastro exclusivo do módulo de orçamentos (separado do registro financeiro de pessoas).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tipo de Pessoa *</Label>
              <Select
                value={tipo}
                onValueChange={(val: TipoClienteOrcamento) => {
                  setTipo(val)
                  // Reaplica formatação se houver documento digitado
                  if (documento) {
                    setDocumento(
                      val === 'pessoa_fisica' ? formatCPF(documento) : formatCNPJ(documento),
                    )
                  }
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pessoa_fisica">Pessoa Física (PF)</SelectItem>
                  <SelectItem value="pessoa_juridica">Pessoa Jurídica (PJ)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {tipo === 'pessoa_juridica' ? 'CNPJ (opcional)' : 'CPF (opcional)'}
              </Label>
              <Input
                placeholder={tipo === 'pessoa_juridica' ? '00.000.000/0000-00' : '000.000.000-00'}
                value={documento}
                onChange={(e) => handleDocumentoChange(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {tipo === 'pessoa_juridica' ? 'Razão Social / Nome Fantasia *' : 'Nome Completo *'}
            </Label>
            <Input
              placeholder={
                tipo === 'pessoa_juridica' ? 'Ex: GKza Confecções LTDA' : 'Ex: Maria Oliveira'
              }
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="h-9 text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">WhatsApp (Principal)</Label>
              <Input
                placeholder="(11) 99999-9999"
                value={whatsapp}
                onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Telefone Fixo / Alternativo</Label>
              <Input
                placeholder="(11) 3333-3333"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">E-mail</Label>
            <Input
              type="email"
              placeholder="cliente@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Observações (opcional)</Label>
            <Textarea
              placeholder="Preferências, endereço de entrega, condições negociadas, etc."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="text-xs min-h-[70px]"
            />
          </div>

          <DialogFooter className="pt-2 border-t flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando}
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white font-bold text-xs"
            >
              {salvando ? (
                <LoaderCircle className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-1.5" />
              )}
              {record ? 'Salvar Alterações' : 'Salvar Cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
