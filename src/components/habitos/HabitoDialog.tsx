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
import { habitosService } from '@/services/habitos'
import { cadastrosService } from '@/services/cadastros'
import { EntidadeContextoWarning } from '@/components/EntidadeContextoWarning'
import { useToast } from '@/hooks/use-toast'
import { getLocalDateStr } from '@/lib/format'
import type { MetaHabito, Pessoa, Empresa } from '@/types/domain'

interface HabitoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  habito?: MetaHabito | null
  onSuccess: () => void
}

const DIAS_OPCOES = [
  { val: 1, label: 'Seg' },
  { val: 2, label: 'Ter' },
  { val: 3, label: 'Qua' },
  { val: 4, label: 'Qui' },
  { val: 5, label: 'Sex' },
  { val: 6, label: 'Sáb' },
  { val: 0, label: 'Dom' },
]

export function HabitoDialog({ open, onOpenChange, habito, onSuccess }: HabitoDialogProps) {
  const { activeContext } = useAppContext()
  const { toast } = useToast()

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [contextoTipo, setContextoTipo] = useState<'pessoal' | 'empresa'>('pessoal')
  const [pessoaId, setPessoaId] = useState<string>('')
  const [empresaId, setEmpresaId] = useState<string>('')
  const [diasSemana, setDiasSemana] = useState<number[]>([1, 2, 3, 4, 5])
  const [horario, setHorario] = useState('')
  const [dataInicio, setDataInicio] = useState(getLocalDateStr())
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

      if (habito) {
        setNome(habito.nome)
        setDescricao(habito.descricao || '')
        setContextoTipo(habito.contexto_tipo)
        setPessoaId(habito.pessoa || '')
        setEmpresaId(habito.empresa || '')
        setDiasSemana(habito.dias_semana || [1, 2, 3, 4, 5])
        setHorario(habito.horario || '')
        setDataInicio(habito.data_inicio ? habito.data_inicio.slice(0, 10) : getLocalDateStr())
        setCor(habito.cor || '#DF5830')
      } else {
        setNome('')
        setDescricao('')
        // Define o contexto padrão baseado na visão ativa do usuário
        let defaultTipo: 'pessoal' | 'empresa' = 'pessoal'
        if (activeContext.isAll) {
          defaultTipo = 'pessoal'
        } else if (activeContext.hasEmpresas && !activeContext.hasPessoas) {
          defaultTipo = 'empresa'
        } else {
          defaultTipo = 'pessoal'
        }
        setContextoTipo(defaultTipo)
        setPessoaId(defaultTipo === 'pessoal' ? activeContext.pessoaIds[0] || '' : '')
        setEmpresaId(defaultTipo === 'empresa' ? activeContext.empresaIds[0] || '' : '')
        setDiasSemana([1, 2, 3, 4, 5])
        setHorario('')
        setDataInicio(getLocalDateStr())
        setCor('#DF5830')
      }
    }
  }, [open, habito, activeContext])

  const toggleDia = (dia: number) => {
    if (diasSemana.includes(dia)) {
      if (diasSemana.length === 1) return
      setDiasSemana(diasSemana.filter((d) => d !== dia))
    } else {
      setDiasSemana([...diasSemana, dia].sort())
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return

    setLoading(true)
    try {
      const payload = {
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        contexto_tipo: contextoTipo,
        pessoa: contextoTipo === 'pessoal' && pessoaId ? pessoaId : undefined,
        empresa: contextoTipo === 'empresa' && empresaId ? empresaId : undefined,
        dias_semana: diasSemana,
        horario: horario || undefined,
        data_inicio: new Date(dataInicio + 'T00:00:00.000Z').toISOString(),
        cor,
      }

      if (habito) {
        await habitosService.updateHabito(habito.id, payload)
        toast({ title: 'Hábito atualizado com sucesso!' })
      } else {
        await habitosService.createHabito(payload)
        toast({ title: 'Hábito cadastrado com sucesso!' })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verifique os dados.'
      toast({
        title: 'Erro ao salvar hábito',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{habito ? 'Editar Hábito ou Rotina' : 'Novo Hábito ou Rotina'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome do Hábito / Rotina *</Label>
            <Input
              id="nome"
              required
              placeholder="Ex: Treino matinal, Fechamento de caixa, Estudar 30 min..."
              value={nome}
              onChange={(e) => setNome(e.target.value)}
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
              <Label>
                {contextoTipo === 'pessoal' ? 'Pessoa responsável' : 'Empresa vinculada'}
              </Label>
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

          {contextoTipo === 'empresa' && empresaId && empresaId !== 'nenhuma' && (
            <EntidadeContextoWarning
              tipo="empresa"
              entidadeId={empresaId}
              empresas={empresas}
              className="mt-1"
            />
          )}

          {contextoTipo === 'pessoal' && pessoaId && pessoaId !== 'nenhuma' && (
            <EntidadeContextoWarning
              tipo="pessoa"
              entidadeId={pessoaId}
              pessoas={pessoas}
              className="mt-1"
            />
          )}

          <div className="space-y-2">
            <Label>Dias de Execução na Semana *</Label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_OPCOES.map((d) => {
                const ativo = diasSemana.includes(d.val)
                return (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => toggleDia(d.val)}
                    className={`h-9 px-3 text-xs font-semibold rounded-lg border transition-all ${
                      ativo
                        ? 'bg-primary text-white border-primary shadow-xs'
                        : 'bg-white text-muted-foreground border-border hover:bg-muted/50'
                    }`}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="horario">Horário previsto (opcional)</Label>
              <Input
                id="horario"
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataInicio">Data de Início *</Label>
              <Input
                id="dataInicio"
                type="date"
                required
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição ou Orientações</Label>
            <Textarea
              id="descricao"
              rows={2}
              placeholder="Detalhes, passos ou anotações para este hábito..."
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
              {loading ? 'Salvando...' : habito ? 'Salvar Alterações' : 'Criar Hábito'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
