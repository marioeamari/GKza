// Subcomponentes visuais da grade mensal da /agenda (modelo "Limpo e Elegante").
// Pílulas de compromisso e legenda compartilham a MESMA lógica de cor:
// passado = contorno, hoje = sólido + fonte branca, futuro = preenchimento suave.
// A cor vem do compromisso (`cor` escolhida pelo usuário; fallback #DF5830).
import { estiloPillEstado, normalizarCorHex, type EstadoDia } from '@/lib/agendaCores'

// Selo "G" dos eventos do Google, com contraste garantido nos três estados.
export function SeloGoogle({ estado, cor }: { estado: EstadoDia; cor: string }) {
  const c = normalizarCorHex(cor)
  if (estado === 'hoje') {
    // sobre fundo sólido: selo branco translúcido, letra branca
    return (
      <span className="inline-flex items-center text-[9px] font-bold px-1 rounded shrink-0 bg-white/25 text-white">
        G
      </span>
    )
  }
  // sobre fundo suave ou transparente: selo no tint da cor com letra na cor plena
  return (
    <span
      className="inline-flex items-center text-[9px] font-bold px-1 rounded shrink-0"
      style={{
        backgroundColor: estado === 'futuro' ? `color-mix(in srgb, ${c} 18%, #FFFFFF)` : '#FFFFFF',
        color: c,
        border: `1px solid ${c}55`,
      }}
    >
      G
    </span>
  )
}

// Pílula do compromisso na grade mensal.
export function PillEvento({
  titulo,
  cor,
  estado,
  isGoogle,
  onClick,
  title,
}: {
  titulo: string
  cor?: string | null
  estado: EstadoDia
  isGoogle: boolean
  onClick: () => void
  title: string
}) {
  const estilo = estiloPillEstado(estado, cor || '#DF5830')
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left truncate text-[11px] px-1.5 py-0.5 rounded-full border font-medium transition-opacity hover:opacity-80 flex items-center gap-1"
      style={estilo}
      title={title}
    >
      {isGoogle && <SeloGoogle estado={estado} cor={cor || '#DF5830'} />}
      <span className="truncate">{titulo}</span>
    </button>
  )
}

// Pílula da legenda (Passado / Hoje / Futuro) — mesmo estilo das pílulas de
// evento, na cor laranja primária, mas sem selo e sem interação.
export function PillLegenda({ estado, rotulo }: { estado: EstadoDia; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center justify-center rounded-full border h-4 w-7 text-[9px] font-bold"
        style={estiloPillEstado(estado, '#DF5830')}
      />
      <span className="text-xs text-foreground">{rotulo}</span>
    </span>
  )
}
