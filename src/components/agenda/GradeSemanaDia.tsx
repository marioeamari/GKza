// Subcomponentes das visualizações de SEMANA e DIA da /agenda.
// Usa o MESMO sistema de cores por estado da grade mensal (modelo "Limpo e
// Elegante", src/lib/agendaCores.ts): a cor escolhida no compromisso comanda
// o estilo; o estado do dia (passado/hoje/futuro) só muda a APLICAÇÃO da cor —
// contorno, sólido ou suave. Eventos com hora ficam em blocos posicionados por
// horário numa grade de horas compartilhada (gutter + colunas); all-day fica em
// faixa própria acima da grade, também em pílula por estado.
import { useEffect, useMemo, useRef } from 'react'
import { MapPin, Plus, Repeat } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PillEvento } from '@/components/agenda/MonthGridPills'
import { normalizarCorHex, estiloPillEstado, type EstadoDia } from '@/lib/agendaCores'
import type { AgendaEvento } from '@/types/domain'

const HORA_INICIO = 0 // grade começa à meia-noite
const HORA_FIM = 24 // grade termina às 24h
const TOTAL_HORAS = HORA_FIM - HORA_INICIO
const ALTURA_HORA_PX = 52 // altura de cada linha de 1h
const ALTURA_TOTAL = TOTAL_HORAS * ALTURA_HORA_PX
const ROLAGEM_INICIAL = ALTURA_HORA_PX * 7 // rolagem inicial às 07:00
const DURACAO_PADRAO_MIN = 60 // quando o evento não tem data_fim

export function estadoDe(dateStr: string, todayStr: string): EstadoDia {
  if (dateStr === todayStr) return 'hoje'
  return dateStr < todayStr ? 'passado' : 'futuro'
}

export function formatarHora(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Extrai o id base de uma ocorrência projetada ("abc_2026-11-10" -> "abc")
export function idBaseDe(id: string): string {
  return id.includes('_') ? id.split('_')[0] : id
}

interface Slot {
  ev: AgendaEvento
  inicioMin: number
  durMin: number
  coluna: number
  totalColunas: number
}

// Converte eventos com hora em minutos do dia; descarta fora da grade
function paraSlotsBrutos(lista: AgendaEvento[]) {
  return lista.flatMap((ev) => {
    const dt = new Date(ev.data_inicio)
    if (isNaN(dt.getTime())) return []
    const inicioMin = dt.getHours() * 60 + dt.getMinutes()
    let durMin = DURACAO_PADRAO_MIN
    if (ev.data_fim) {
      const f = new Date(ev.data_fim)
      if (!isNaN(f.getTime())) durMin = Math.max(15, (f.getTime() - dt.getTime()) / 60000)
    }
    const fim = Math.min(inicioMin + durMin, HORA_FIM * 60)
    if (fim <= 0 || inicioMin >= HORA_FIM * 60) return []
    return [{ ev, inicioMin, durMin: fim - inicioMin }]
  })
}

// Agrupa eventos com conflito de horário e distribui em colunas (greedy:
// cada bloco entra na primeira coluna livre da linha de conflito).
export function distribuirColunas(
  evts: { ev: AgendaEvento; inicioMin: number; durMin: number }[],
): Slot[] {
  const ordenados = [...evts].sort((a, b) => a.inicioMin - b.inicioMin || b.durMin - a.durMin)
  const slots: Slot[] = []
  let grupo: { ev: AgendaEvento; inicioMin: number; durMin: number }[] = []
  let fimGrupo = -1

  const fecharGrupo = () => {
    if (grupo.length === 0) return
    const fimColunas: number[] = []
    const colDe = new Map<string, number>()
    grupo.forEach((item) => {
      let col = 0
      while (col < fimColunas.length && fimColunas[col] > item.inicioMin) col++
      fimColunas[col] = item.inicioMin + item.durMin
      colDe.set(item.ev.id, col)
    })
    grupo.forEach((item) => {
      slots.push({ ...item, coluna: colDe.get(item.ev.id) || 0, totalColunas: fimColunas.length })
    })
    grupo = []
    fimGrupo = -1
  }

  ordenados.forEach((item) => {
    if (grupo.length > 0 && item.inicioMin >= fimGrupo) fecharGrupo()
    grupo.push(item)
    fimGrupo = Math.max(fimGrupo, item.inicioMin + item.durMin)
  })
  fecharGrupo()
  return slots
}

function minutosAgora(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

// Bloco absoluto de um evento com hora, na cor/estado do dia.
// `detalhado` (visão dia, coluna larga) mostra local quando cabe.
function BlocoEvento({
  slot,
  estado,
  onAbrir,
  detalhado = false,
}: {
  slot: Slot
  estado: EstadoDia
  onAbrir: (ev: AgendaEvento) => void
  detalhado?: boolean
}) {
  const { ev, inicioMin, durMin, coluna, totalColunas } = slot
  const top = ((inicioMin - HORA_INICIO * 60) / (TOTAL_HORAS * 60)) * ALTURA_TOTAL
  const height = Math.max(22, (durMin / 60) * ALTURA_HORA_PX)
  const widthPct = 100 / totalColunas
  const cor = normalizarCorHex(ev.cor)
  const estilo = estiloPillEstado(estado, ev.cor)
  const horaInicio = formatarHora(new Date(ev.data_inicio))
  const corTextoSecundario = estado === 'hoje' ? 'rgba(255,255,255,0.85)' : cor

  return (
    <button
      type="button"
      onClick={() => onAbrir(ev)}
      title={`${horaInicio} — ${ev.titulo}${ev.local ? ' - ' + ev.local : ''}`}
      className="absolute rounded-md border px-1.5 py-0.5 text-left overflow-hidden transition-opacity hover:opacity-85 cursor-pointer z-10"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${coluna * widthPct}% + ${coluna * 2}px)`,
        width: `calc(${widthPct}% - 4px)`,
        ...estilo,
      }}
    >
      <div className="flex items-center gap-1 min-w-0 leading-tight">
        {ev.origem === 'google' && (
          <span
            className="text-[9px] font-bold px-0.5 rounded shrink-0"
            style={
              estado === 'hoje'
                ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#FFFFFF' }
                : { backgroundColor: '#FFFFFF', color: cor, border: `1px solid ${cor}55` }
            }
          >
            G
          </span>
        )}
        <span
          className="text-[10px] font-bold shrink-0 tabular-nums"
          style={{ color: corTextoSecundario }}
        >
          {horaInicio}
        </span>
        <span className="text-[11px] font-semibold truncate">{ev.titulo}</span>
        {ev.recorrencia && ev.recorrencia !== 'nenhuma' && (
          <Repeat className="h-2.5 w-2.5 shrink-0 opacity-70" />
        )}
      </div>
      {(detalhado || totalColunas === 1) && height >= 42 && ev.local && (
        <div
          className="text-[10px] truncate mt-0.5 flex items-center gap-1 leading-tight"
          style={{ color: corTextoSecundario }}
        >
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          {ev.local}
        </div>
      )}
    </button>
  )
}

// Gutter de horas + linhas horizontais; reutilizado por semana e dia.
function GutterHoras() {
  return (
    <>
      <div className="w-10 sm:w-12 shrink-0 relative" style={{ height: `${ALTURA_TOTAL}px` }}>
        {Array.from({ length: TOTAL_HORAS + 1 }, (_, i) => (
          <span
            key={i}
            className="absolute right-1.5 sm:right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
            style={{ top: `${i * ALTURA_HORA_PX}px` }}
          >
            {String(i).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </>
  )
}

function LinhasHora({ comAgora }: { comAgora: boolean }) {
  return (
    <>
      {Array.from({ length: TOTAL_HORAS }, (_, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 border-t border-border/30"
          style={{ top: `${i * ALTURA_HORA_PX}px` }}
        />
      ))}
      {comAgora && (
        <div
          className="absolute left-0 right-0 z-20 pointer-events-none"
          style={{ top: `${(minutosAgora() / 60) * ALTURA_HORA_PX}px` }}
        >
          <div className="h-px bg-[#DF5830]" />
          <div className="h-1.5 w-1.5 rounded-full bg-[#DF5830] -mt-[3px] -ml-[3px]" />
        </div>
      )}
    </>
  )
}

function FaixaAllDay({
  eventos,
  estado,
  onAbrir,
}: {
  eventos: AgendaEvento[]
  estado: EstadoDia
  onAbrir: (ev: AgendaEvento) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 sm:px-3 py-2 border-b border-border/60 bg-muted/10">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase shrink-0">
        Dia inteiro
      </span>
      {eventos.map((ev) => (
        <PillEvento
          key={ev.id}
          titulo={ev.titulo}
          cor={ev.cor}
          estado={estado}
          isGoogle={ev.origem === 'google'}
          title={`${ev.origem === 'google' ? '[Google Calendar] ' : ''}${ev.titulo}${ev.local ? ' - ' + ev.local : ''}`}
          onClick={() => onAbrir(ev)}
        />
      ))}
    </div>
  )
}

// --- SEMANA: 7 colunas sobre uma grade de horas compartilhada ---
export function GradeSemana({
  dias,
  eventosPorDia,
  todayStr,
  onAbrir,
}: {
  dias: { dateStr: string; dayNumber: number; dayName: string }[]
  eventosPorDia: Map<string, AgendaEvento[]>
  todayStr: string
  onAbrir: (ev: AgendaEvento, dateStr: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Rolagem inicial do corpo para o início do expediente (07:00)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = ROLAGEM_INICIAL
  }, [])

  const temAllDay = dias.some((d) =>
    (eventosPorDia.get(d.dateStr) || []).some((ev) => ev.dia_inteiro),
  )

  return (
    <div className="flex flex-col">
      {/* Cabeçalho dos dias */}
      <div className="flex border-b border-border/60 bg-[#F8EFE9]">
        <div className="w-10 sm:w-12 shrink-0" />
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${dias.length}, 1fr)` }}>
          {dias.map((d) => {
            const estado = estadoDe(d.dateStr, todayStr)
            const isHoje = estado === 'hoje'
            return (
              <div
                key={d.dateStr}
                className={`px-0.5 py-2 text-center border-r border-border/40 last:border-r-0 ${isHoje ? 'bg-primary/10' : ''}`}
              >
                <span className="block text-[10px] text-muted-foreground uppercase font-semibold">
                  {d.dayName}
                </span>
                <span
                  className={`inline-block mt-0.5 text-sm font-bold h-6 w-6 rounded-full leading-6 ${isHoje ? 'bg-primary text-white' : 'text-foreground'}`}
                >
                  {d.dayNumber}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Faixa all-day alinhada com as colunas */}
      <div className={`flex border-b border-border/60 bg-muted/10 ${temAllDay ? '' : 'hidden'}`}>
        <div className="w-10 sm:w-12 shrink-0 flex items-start justify-end pr-1.5 sm:pr-2 pt-2">
          <span className="text-[9px] font-semibold text-muted-foreground uppercase">Dia todo</span>
        </div>
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${dias.length}, 1fr)` }}>
          {dias.map((d) => {
            const estado = estadoDe(d.dateStr, todayStr)
            const allDay = (eventosPorDia.get(d.dateStr) || []).filter((ev) => ev.dia_inteiro)
            return (
              <div
                key={d.dateStr}
                className="px-1 py-1.5 border-r border-border/40 last:border-r-0"
              >
                {allDay.map((ev) => (
                  <PillEvento
                    key={ev.id}
                    titulo={ev.titulo}
                    cor={ev.cor}
                    estado={estado}
                    isGoogle={ev.origem === 'google'}
                    title={`${ev.origem === 'google' ? '[Google Calendar] ' : ''}${ev.titulo}`}
                    onClick={() => onAbrir(ev, d.dateStr)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Corpo rolável: gutter + colunas por dia */}
      <div ref={scrollRef} className="overflow-y-auto max-h-[65vh]">
        <div className="flex">
          <GutterHoras />
          <div
            className="grid flex-1 border-l border-border/40"
            style={{
              gridTemplateColumns: `repeat(${dias.length}, 1fr)`,
              height: `${ALTURA_TOTAL}px`,
            }}
          >
            {dias.map((d) => {
              const estado = estadoDe(d.dateStr, todayStr)
              const slots = distribuirColunas(
                paraSlotsBrutos(
                  (eventosPorDia.get(d.dateStr) || []).filter((ev) => !ev.dia_inteiro),
                ),
              )
              return (
                <div
                  key={d.dateStr}
                  className={`relative border-r border-border/40 last:border-r-0 ${estado === 'hoje' ? 'bg-primary/[0.03]' : ''}`}
                >
                  <LinhasHora comAgora={estado === 'hoje'} />
                  {slots.map((slot) => (
                    <BlocoEvento
                      key={slot.ev.id}
                      slot={slot}
                      estado={estado}
                      onAbrir={(ev) => onAbrir(ev, d.dateStr)}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- DIA: coluna única com blocos detalhados ---
export function GradeDia({
  dateStr,
  eventos,
  todayStr,
  onAbrir,
  onNovo,
  vazio,
}: {
  dateStr: string
  eventos: AgendaEvento[]
  todayStr: string
  onAbrir: (ev: AgendaEvento) => void
  onNovo?: () => void
  vazio: string
}) {
  const titulo = new Date(`${dateStr}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const estado = estadoDe(dateStr, todayStr)
  const allDay = eventos.filter((ev) => ev.dia_inteiro)
  const slots = useMemo(
    () => distribuirColunas(paraSlotsBrutos(eventos.filter((ev) => !ev.dia_inteiro))),
    [eventos],
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  // Rolagem inicial do corpo para o início do expediente (07:00)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = ROLAGEM_INICIAL
  }, [dateStr])

  if (eventos.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-6">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="font-semibold text-foreground capitalize">{vazio}</h3>
            {onNovo && (
              <Button size="sm" onClick={onNovo} className="h-8 text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar no Dia
              </Button>
            )}
          </div>
          <div className="text-center py-10 text-sm text-muted-foreground">
            Nenhum compromisso marcado para este dia.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/60">
      <CardContent className="p-0">
        {onNovo && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
            <h3 className="text-sm font-semibold text-foreground capitalize">{titulo}</h3>
            <Button size="sm" onClick={onNovo} className="h-8 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Adicionar no Dia
            </Button>
          </div>
        )}
        {allDay.length > 0 && <FaixaAllDay eventos={allDay} estado={estado} onAbrir={onAbrir} />}

        <div ref={scrollRef} className="overflow-y-auto max-h-[65vh]">
          <div className="flex">
            <GutterHoras />
            <div
              className="relative flex-1 border-l border-border/40"
              style={{ height: `${ALTURA_TOTAL}px` }}
            >
              <LinhasHora comAgora={estado === 'hoje'} />
              {slots.map((slot) => (
                <BlocoEvento
                  key={slot.ev.id}
                  slot={slot}
                  estado={estado}
                  onAbrir={onAbrir}
                  detalhado
                />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
