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
import { Slider } from '@/components/ui/slider'
import { useAppContext } from '@/contexts/AppContext'
import { projetosTarefasService } from '@/services/projetosTarefas'
import { cadastrosService } from '@/services/cadastros'
import { useToast } from '@/hooks/use-toast'
import type {
  MetaMeta,
  Projeto,
  Pessoa,
  Empresa,
  MetaTipoProgresso,
  MetaStatus,
} from '@/types/domain'

interface MetaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  meta?: MetaMeta | null
  onSuccess: () => void
}

export function MetaDialog({ open, onOpenChange, meta, onSuccess }: MetaDialogProps) {
  const { activeContext } = useAppContext()
  const { toast } = useToast()

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [contextoTipo, setContextoTipo] = useState<'pessoal' | 'empresa'>('pessoal')
  const [pessoaId, setPessoaId] = useState<string>('')
  const [empresaId, setEmpresaId] = useState<string>('')
  const [prazo, setPrazo] = useState('')
  const [tipoProgresso, setTipoProgresso] = useState<MetaTipoProgresso>('manual')
  const [progressoManual, setProgressoManual] = useState<number>(0)
  const [alvoDescricao, setAlvoDescricao] = useState('')
  const [projetoId, setProjetoId] = useState<string>('nenhum')
  const [status, setStatus] = useState<MetaStatus>('em_andamento')
  const [cor, setCor] = useState('#DF5830')
  const [loading, setLoading] = useState(false)

  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])

  useEffect(() => {
    if (open) {
      projetosTarefasService
        .listProjetos()
        .then(setProjetos)
        .catch(() => {})
      cadastrosService
        .listPessoas()
        .then(setPessoas)
        .catch(() => {})
      cadastrosService
        .listEmpresas()
        .then(setEmpresas)
        .catch(() => {})

      if (meta) {
        setTitulo(meta.titulo)
        setDescricao(meta.descricao || '')
        setContextoTipo(meta.contexto_tipo)
        setPessoaId(meta.pessoa || '')
        setEmpresaId(meta.empresa || '')
        setPrazo(meta.prazo ? meta.prazo.split('T')[0] : '')
        setTipoProgresso(meta.tipo_progresso)
        setProgressoManual(meta.progresso_manual || 0)
        setAlvoDescricao(meta.alvo_descricao || '')
        setProjetoId(meta.projeto || 'nenhum')
        setStatus(meta.status)
        setCor(meta.cor || '#DF5830')
      } else {
        setTitulo('')
        setDescricao('')
        const defaultTipo =
          activeContext.hasEmpresas && !activeContext.hasPessoas ? 'empresa' : 'pessoal'
        setContextoTipo(defaultTipo)
        setPessoaId(activeContext.pessoaIds[0] || '')
        setEmpresaId(activeContext.empresaIds[0] || '')
        setPrazo('')
        setTipoProgresso('manual')
        setProgressoManual(0)
        setAlvoDescricao('')
        setProjetoId('nenhum')
        setStatus('em_andamento')
        setCor('#DF5830')
      }
    }
  }, [open, meta, activeContext])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) return

    setLoading(true)
    try {
      const payload = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        contexto_tipo: contextoTipo,
        pessoa: contextoTipo === 'pessoal' && pessoaId ? pessoaId : undefined,
        empresa: contextoTipo === 'empresa' && empresaId ? empresaId : undefined,
        prazo: prazo ? new Date(prazo + 'T23:59:59.000Z').toISOString() : undefined,
        tipo_progresso: tipoProgresso,
        progresso_manual: tipoProgresso === 'manual' ? progressoManual : undefined,
        alvo_descricao: alvoDescricao.trim() || undefined,
        projeto: projetoId !== 'nenhum' && projetoId ? projetoId : undefined,
        status,
        cor,
      }

      if (meta) {
        await projetosTarefasService.updateMeta(meta.id, payload)
        toast({ title: 'Meta atualizada com sucesso!' })
      } else {
        await projetosTarefasService.createMeta(payload)
        toast({ title: 'Meta cadastrada com sucesso!' })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verifique os dados.'
      toast({ title: 'Erro ao salvar meta', description: message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{meta ? 'Editar Meta' : 'Nova Meta'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título da Meta *</Label>
            <Input
              id="titulo"
              required
              placeholder="Ex: Faturar R$ 100k no trimestre, Reserva de R$ 50k..."
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
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
              <Label>Tipo de Medição de Progresso *</Label>
              <Select
                value={tipoProgresso}
                onValueChange={(val: MetaTipoProgresso) => setTipoProgresso(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (Percentual definido por você)</SelectItem>
                  <SelectItem value="tarefas">Calculado a partir de Tarefas Concluídas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Projeto Vinculado</Label>
              <Select value={projetoId} onValueChange={setProjetoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem projeto vinculado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem projeto vinculado</SelectItem>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tipoProgresso === 'manual' ? (
            <div className="space-y-2 bg-muted/30 p-3 rounded-lg border border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">Progresso Manual Atual:</span>
                <span className="font-bold text-primary text-sm">{progressoManual}%</span>
              </div>
              <Slider
                value={[progressoManual]}
                max={100}
                step={5}
                onValueChange={(vals) => setProgressoManual(vals[0])}
              />
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-blue-50 text-blue-800 text-xs border border-blue-200">
              O progresso desta meta é <strong>calculado automaticamente</strong> com base na
              conclusão das tarefas do projeto associado (
              {projetoId !== 'nenhum' ? 'Projeto selecionado' : 'Selecione um projeto acima'}).
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="alvo">Meta / Alvo Quantitativo</Label>
              <Input
                id="alvo"
                placeholder="Ex: R$ 100.000 ou 50 clientes"
                value={alvoDescricao}
                onChange={(e) => setAlvoDescricao(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prazo">Prazo Limite</Label>
              <Input
                id="prazo"
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Status da Meta</Label>
            <Select value={status} onValueChange={(val: MetaStatus) => setStatus(val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="atingida">Atingida / Concluída</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição / Observações</Label>
            <Textarea
              id="descricao"
              rows={2}
              placeholder="Detalhes ou critérios de sucesso desta meta..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">
              {loading ? 'Salvando...' : meta ? 'Salvar' : 'Criar Meta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
