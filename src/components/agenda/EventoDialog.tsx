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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppContext } from '@/contexts/AppContext'
import { agendaService } from '@/services/agenda'
import { cadastrosService } from '@/services/cadastros'
import { useToast } from '@/hooks/use-toast'
import { getLocalDateStr } from '@/lib/format'
import type { AgendaEvento, Pessoa, Empresa, AgendaEventoRecorrencia } from '@/types/domain'

interface EventoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  evento?: AgendaEvento | null
  initialDate?: string
  initialTitulo?: string
  onSuccess: () => void
}

export function EventoDialog({
  open,
  onOpenChange,
  evento,
  initialDate,
  initialTitulo,
  onSuccess,
}: EventoDialogProps) {
  const { activeContext } = useAppContext()
  const { toast } = useToast()

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [contextoTipo, setContextoTipo] = useState<'pessoal' | 'empresa'>('pessoal')
  const [pessoaId, setPessoaId] = useState<string>('')
  const [empresaId, setEmpresaId] = useState<string>('')

  const [dataInicio, setDataInicio] = useState(getLocalDateStr())
  const [horaInicio, setHoraInicio] = useState('09:00')
  const [dataFim, setDataFim] = useState(getLocalDateStr())
  const [horaFim, setHoraFim] = useState('10:00')
  const [diaInteiro, setDiaInteiro] = useState(false)

  const [local, setLocal] = useState('')
  const [recorrencia, setRecorrencia] = useState<AgendaEventoRecorrencia>('nenhuma')
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

      if (evento) {
        setTitulo(evento.titulo)
        setDescricao(evento.descricao || '')
        setContextoTipo(evento.contexto_tipo)
        setPessoaId(evento.pessoa || '')
        setEmpresaId(evento.empresa || '')
        setLocal(evento.local || '')
        setRecorrencia(evento.recorrencia || 'nenhuma')
        setDiaInteiro(!!evento.dia_inteiro)
        setCor(evento.cor || '#DF5830')

        if (evento.data_inicio) {
          const dIni = new Date(evento.data_inicio)
          setDataInicio(getLocalDateStr(dIni))
          setHoraInicio(
            `${String(dIni.getHours()).padStart(2, '0')}:${String(dIni.getMinutes()).padStart(2, '0')}`,
          )
        }
        if (evento.data_fim) {
          const dFim = new Date(evento.data_fim)
          setDataFim(getLocalDateStr(dFim))
          setHoraFim(
            `${String(dFim.getHours()).padStart(2, '0')}:${String(dFim.getMinutes()).padStart(2, '0')}`,
          )
        }
      } else {
        setTitulo(initialTitulo || '')
        setDescricao('')
        const defaultTipo =
          activeContext.hasEmpresas && !activeContext.hasPessoas ? 'empresa' : 'pessoal'
        setContextoTipo(defaultTipo)
        setPessoaId(activeContext.pessoaIds[0] || '')
        setEmpresaId(activeContext.empresaIds[0] || '')
        setLocal('')
        setRecorrencia('nenhuma')
        setDiaInteiro(false)
        setCor('#DF5830')

        const baseDate = initialDate || getLocalDateStr()
        setDataInicio(baseDate)
        setDataFim(baseDate)
        setHoraInicio('09:00')
        setHoraFim('10:00')
      }
    }
  }, [open, evento, initialDate, initialTitulo, activeContext])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) return

    setLoading(true)
    try {
      let startIso = ''
      let endIso = ''

      if (diaInteiro) {
        startIso = new Date(dataInicio + 'T00:00:00.000Z').toISOString()
        endIso = new Date(dataFim + 'T23:59:59.000Z').toISOString()
      } else {
        startIso = new Date(`${dataInicio}T${horaInicio}:00`).toISOString()
        endIso = new Date(`${dataFim}T${horaFim}:00`).toISOString()
      }

      const payload = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        contexto_tipo: contextoTipo,
        pessoa: contextoTipo === 'pessoal' && pessoaId ? pessoaId : undefined,
        empresa: contextoTipo === 'empresa' && empresaId ? empresaId : undefined,
        data_inicio: startIso,
        data_fim: endIso,
        dia_inteiro: diaInteiro,
        local: local.trim() || undefined,
        recorrencia,
        cor,
      }

      if (evento) {
        await agendaService.updateEvento(evento.id, payload)
        toast({ title: 'Compromisso atualizado com sucesso!' })
      } else {
        await agendaService.createEvento(payload)
        toast({ title: 'Compromisso adicionado à agenda!' })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verifique os horários.'
      toast({
        title: 'Erro ao salvar compromisso',
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
          <DialogTitle>{evento ? 'Editar Compromisso' : 'Novo Compromisso / Reunião'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              required
              placeholder="Ex: Reunião de Diretoria, Consulta Médica, Alinhamento de Vendas..."
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

          <div className="flex items-center space-x-2 py-1">
            <Checkbox
              id="diaInteiro"
              checked={diaInteiro}
              onCheckedChange={(c) => setDiaInteiro(!!c)}
            />
            <label htmlFor="diaInteiro" className="text-xs font-medium leading-none cursor-pointer">
              Evento de dia inteiro
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início *</Label>
              <Input
                type="date"
                required
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value)
                  if (dataFim < e.target.value) setDataFim(e.target.value)
                }}
              />
              {!diaInteiro && (
                <Input
                  type="time"
                  className="mt-1"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Término</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              {!diaInteiro && (
                <Input
                  type="time"
                  className="mt-1"
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="local">Local ou Link</Label>
              <Input
                id="local"
                placeholder="Google Meet, Sala 01, Presencial..."
                value={local}
                onChange={(e) => setLocal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Recorrência</Label>
              <Select
                value={recorrencia}
                onValueChange={(val: AgendaEventoRecorrencia) => setRecorrencia(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Não se repete</SelectItem>
                  <SelectItem value="diaria">Diariamente</SelectItem>
                  <SelectItem value="semanal">Semanalmente</SelectItem>
                  <SelectItem value="mensal">Mensalmente</SelectItem>
                  <SelectItem value="anual">Anualmente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Pauta / Observações</Label>
            <Textarea
              id="descricao"
              rows={2}
              placeholder="Detalhes, participantes ou pauta do compromisso..."
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
              {loading ? 'Salvando...' : evento ? 'Salvar Alterações' : 'Adicionar à Agenda'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
