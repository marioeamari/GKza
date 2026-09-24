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
import { Checkbox } from '@/components/ui/checkbox'
import { useAppContext } from '@/contexts/AppContext'
import { projetosTarefasService } from '@/services/projetosTarefas'
import { cadastrosService } from '@/services/cadastros'
import { usersService } from '@/services/users'
import { useToast } from '@/hooks/use-toast'
import { Plus, Trash2, CalendarPlus } from 'lucide-react'
import type {
  Tarefa,
  Projeto,
  UserRecord,
  Pessoa,
  Empresa,
  TarefaEtapa,
  TarefaPrioridade,
  TarefaChecklistItem,
} from '@/types/domain'

interface TarefaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tarefa?: Tarefa | null
  defaultProjetoId?: string
  defaultEtapa?: TarefaEtapa
  onSuccess: () => void
  onAgendarNaAgenda?: (tarefa: Tarefa) => void
}

export function TarefaDialog({
  open,
  onOpenChange,
  tarefa,
  defaultProjetoId,
  defaultEtapa,
  onSuccess,
  onAgendarNaAgenda,
}: TarefaDialogProps) {
  const { activeContext } = useAppContext()
  const { toast } = useToast()

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [projetoId, setProjetoId] = useState<string>('')
  const [responsavelId, setResponsavelId] = useState<string>('')
  const [etapa, setEtapa] = useState<TarefaEtapa>('a_fazer')
  const [prioridade, setPrioridade] = useState<TarefaPrioridade>('media')
  const [contextoTipo, setContextoTipo] = useState<'pessoal' | 'empresa'>('pessoal')
  const [pessoaId, setPessoaId] = useState<string>('')
  const [empresaId, setEmpresaId] = useState<string>('')
  const [prazo, setPrazo] = useState('')

  // Checklist
  const [checklist, setChecklist] = useState<TarefaChecklistItem[]>([])
  const [novoItemTexto, setNovoItemTexto] = useState('')

  const [loading, setLoading] = useState(false)
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])

  useEffect(() => {
    if (open) {
      projetosTarefasService
        .listProjetos()
        .then(setProjetos)
        .catch(() => {})
      usersService
        .list()
        .then(setUsers)
        .catch(() => {})
      cadastrosService
        .listPessoas()
        .then(setPessoas)
        .catch(() => {})
      cadastrosService
        .listEmpresas()
        .then(setEmpresas)
        .catch(() => {})

      if (tarefa) {
        setTitulo(tarefa.titulo)
        setDescricao(tarefa.descricao || '')
        setProjetoId(tarefa.projeto || 'nenhum')
        setResponsavelId(tarefa.responsavel || 'nenhum')
        setEtapa(tarefa.etapa)
        setPrioridade(tarefa.prioridade)
        setContextoTipo(tarefa.contexto_tipo)
        setPessoaId(tarefa.pessoa || '')
        setEmpresaId(tarefa.empresa || '')
        setPrazo(tarefa.prazo ? tarefa.prazo.split('T')[0] : '')
        setChecklist(tarefa.checklist || [])
      } else {
        setTitulo('')
        setDescricao('')
        setProjetoId(defaultProjetoId || 'nenhum')
        setResponsavelId('nenhum')
        setEtapa(defaultEtapa || 'a_fazer')
        setPrioridade('media')
        const defaultTipo =
          activeContext.hasEmpresas && !activeContext.hasPessoas ? 'empresa' : 'pessoal'
        setContextoTipo(defaultTipo)
        setPessoaId(activeContext.pessoaIds[0] || '')
        setEmpresaId(activeContext.empresaIds[0] || '')
        setPrazo('')
        setChecklist([])
      }
      setNovoItemTexto('')
    }
  }, [open, tarefa, defaultProjetoId, defaultEtapa, activeContext])

  const handleAddChecklistItem = () => {
    if (!novoItemTexto.trim()) return
    const item: TarefaChecklistItem = {
      id: Math.random().toString(36).substring(2, 9),
      texto: novoItemTexto.trim(),
      feito: false,
    }
    setChecklist([...checklist, item])
    setNovoItemTexto('')
  }

  const handleToggleChecklistItem = (id: string) => {
    setChecklist(checklist.map((item) => (item.id === id ? { ...item, feito: !item.feito } : item)))
  }

  const handleRemoveChecklistItem = (id: string) => {
    setChecklist(checklist.filter((item) => item.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) return

    setLoading(true)
    try {
      const payload = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        projeto: projetoId !== 'nenhum' && projetoId ? projetoId : undefined,
        responsavel: responsavelId !== 'nenhum' && responsavelId ? responsavelId : undefined,
        etapa,
        prioridade,
        contexto_tipo: contextoTipo,
        pessoa: contextoTipo === 'pessoal' && pessoaId ? pessoaId : undefined,
        empresa: contextoTipo === 'empresa' && empresaId ? empresaId : undefined,
        prazo: prazo ? new Date(prazo + 'T23:59:59.000Z').toISOString() : undefined,
        checklist,
      }

      if (tarefa) {
        await projetosTarefasService.updateTarefa(tarefa.id, payload)
        toast({ title: 'Tarefa atualizada com sucesso!' })
      } else {
        await projetosTarefasService.createTarefa(payload)
        toast({ title: 'Tarefa criada com sucesso!' })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verifique os dados.'
      toast({ title: 'Erro ao salvar tarefa', description: message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tarefa ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título da Tarefa *</Label>
            <Input
              id="titulo"
              required
              placeholder="Ex: Conciliar repasses, Emitir NF, Pagar fatura do cartão..."
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Projeto Vinculado</Label>
              <Select value={projetoId} onValueChange={setProjetoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Demanda avulsa (sem projeto)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Demanda avulsa (sem projeto)</SelectItem>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsavelId} onValueChange={setResponsavelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem responsável atribuído</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Etapa / Status</Label>
              <Select value={etapa} onValueChange={(val: TarefaEtapa) => setEtapa(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_fazer">A Fazer</SelectItem>
                  <SelectItem value="em_progresso">Em Progresso</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select
                value={prioridade}
                onValueChange={(val: TarefaPrioridade) => setPrioridade(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

          <div className="space-y-1.5">
            <Label htmlFor="prazo">Prazo de Conclusão</Label>
            <Input
              id="prazo"
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição / Instruções</Label>
            <Textarea
              id="descricao"
              rows={2}
              placeholder="Instruções para execução desta tarefa..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          {/* CHECKLIST */}
          <div className="space-y-2 border-t border-border pt-3">
            <Label className="text-xs font-semibold">Checklist da Tarefa</Label>
            {checklist.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={item.feito}
                    onCheckedChange={() => handleToggleChecklistItem(item.id)}
                  />
                  <span className={item.feito ? 'line-through text-muted-foreground' : ''}>
                    {item.texto}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveChecklistItem(item.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}

            <div className="flex gap-2">
              <Input
                placeholder="Adicionar item ao checklist..."
                value={novoItemTexto}
                onChange={(e) => setNovoItemTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddChecklistItem()
                  }
                }}
                className="text-xs h-8"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleAddChecklistItem}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar
              </Button>
            </div>
          </div>

          <DialogFooter className="pt-2 flex items-center justify-between">
            {tarefa && onAgendarNaAgenda && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  onAgendarNaAgenda(tarefa)
                  onOpenChange(false)
                }}
                className="text-xs gap-1"
              >
                <CalendarPlus className="h-3.5 w-3.5 text-primary" />
                Agendar na Agenda
              </Button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">
                {loading ? 'Salvando...' : tarefa ? 'Salvar' : 'Criar Tarefa'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
