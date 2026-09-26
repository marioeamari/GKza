import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
import { useAppContext } from '@/contexts/AppContext'
import { projetosTarefasService } from '@/services/projetosTarefas'
import { cadastrosService } from '@/services/cadastros'
import { useToast } from '@/hooks/use-toast'
import { dateOnly } from '@/lib/format'
import type { Projeto, ProjetoStatus, Pessoa, Empresa } from '@/types/domain'

interface ProjetoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projeto?: Projeto | null
  onSuccess: () => void
}

export function ProjetoDialog({ open, onOpenChange, projeto, onSuccess }: ProjetoDialogProps) {
  const { activeContext } = useAppContext()
  const { toast } = useToast()

  const [nome, setNome] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [contextoTipo, setContextoTipo] = useState<'pessoal' | 'empresa'>('pessoal')
  const [pessoaId, setPessoaId] = useState<string>('')
  const [empresaId, setEmpresaId] = useState<string>('')
  const [prazo, setPrazo] = useState('')
  const [status, setStatus] = useState<ProjetoStatus>('em_andamento')
  const [cor, setCor] = useState('#DF5830')
  const [loading, setLoading] = useState(false)

  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])

  useEffect(() => {
    if (open) {
      cadastrosService
        .listPessoas()
        .then(setPessoas)
        .catch(() => {})
      cadastrosService
        .listEmpresas()
        .then(setEmpresas)
        .catch(() => {})

      if (projeto) {
        setNome(projeto.nome)
        setObjetivo(projeto.objetivo || '')
        setDescricao(projeto.descricao || '')
        setContextoTipo(projeto.contexto_tipo)
        setPessoaId(projeto.pessoa || '')
        setEmpresaId(projeto.empresa || '')
        setPrazo(projeto.prazo ? dateOnly(projeto.prazo) : '')
        setStatus(projeto.status)
        setCor(projeto.cor || '#DF5830')
      } else {
        setNome('')
        setObjetivo('')
        setDescricao('')
        const defaultTipo =
          activeContext.hasEmpresas && !activeContext.hasPessoas ? 'empresa' : 'pessoal'
        setContextoTipo(defaultTipo)
        setPessoaId(activeContext.pessoaIds[0] || '')
        setEmpresaId(activeContext.empresaIds[0] || '')
        setPrazo('')
        setStatus('em_andamento')
        setCor('#DF5830')
      }
    }
  }, [open, projeto, activeContext])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return

    let parsedPrazo: string | undefined = undefined
    if (prazo && prazo.trim()) {
      const trimmed = prazo.trim()
      const datePart = trimmed.includes('T') || trimmed.includes(' ') ? dateOnly(trimmed) : trimmed
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        parsedPrazo = `${datePart} 23:59:59.000Z`
      } else {
        const d = new Date(trimmed)
        if (!isNaN(d.getTime())) {
          parsedPrazo = d.toISOString()
        }
      }
    }

    setLoading(true)
    try {
      const payload = {
        nome: nome.trim(),
        objetivo: objetivo.trim() || undefined,
        descricao: descricao.trim() || undefined,
        contexto_tipo: contextoTipo,
        pessoa: contextoTipo === 'pessoal' && pessoaId ? pessoaId : undefined,
        empresa: contextoTipo === 'empresa' && empresaId ? empresaId : undefined,
        prazo: parsedPrazo,
        status,
        cor,
      }

      if (projeto) {
        await projetosTarefasService.updateProjeto(projeto.id, payload)
        toast({ title: 'Projeto atualizado com sucesso!' })
      } else {
        await projetosTarefasService.createProjeto(payload)
        toast({ title: 'Projeto criado com sucesso!' })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verifique os dados.'
      toast({ title: 'Erro ao salvar projeto', description: message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{projeto ? 'Editar Projeto' : 'Novo Projeto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome do Projeto *</Label>
            <Input
              id="nome"
              required
              placeholder="Ex: Expansão de Marketplaces, Reforma da Loja, Férias em Família..."
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="objetivo">Objetivo Central</Label>
            <Input
              id="objetivo"
              placeholder="Qual o resultado esperado ao concluir este projeto?"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contexto *</Label>
              <Select
                value={contextoTipo}
                onValueChange={(val: 'pessoal' | 'empresa') => setContextoTipo(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pessoal">Pessoal (CPF)</SelectItem>
                  <SelectItem value="empresa">Empresa (CNPJ)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{contextoTipo === 'pessoal' ? 'Pessoa' : 'Empresa'}</Label>
              {contextoTipo === 'pessoal' ? (
                <Select value={pessoaId} onValueChange={setPessoaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Geral / Nenhuma</SelectItem>
                    {pessoas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={empresaId} onValueChange={setEmpresaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Geral / Nenhuma</SelectItem>
                    {empresas.map((em) => (
                      <SelectItem key={em.id} value={em.id}>
                        {em.nome_fantasia || em.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prazo">Prazo Limite</Label>
              <Input
                id="prazo"
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(val: ProjetoStatus) => setStatus(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejamento">Planejamento</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="pausado">Pausado</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição / Escopo</Label>
            <Textarea
              id="descricao"
              rows={2}
              placeholder="Detalhes adicionais sobre o projeto..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cor de Destaque</Label>
            <div className="flex gap-2 items-center">
              {['#DF5830', '#2B5BA8', '#1E6F5C', '#A8556A', '#D97706', '#6366F1'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${
                    cor === c ? 'scale-125 border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">
              {loading ? 'Salvando...' : projeto ? 'Salvar Alterações' : 'Criar Projeto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
