// Cores e estados das pílulas de compromisso da grade mensal da /agenda.
// Regra (modelo "Limpo e Elegante"): a cor escolhida pelo usuário no evento
// comanda o estilo; o estado do dia (passado/hoje/futuro) só muda a APLICAÇÃO
// da cor — contorno, sólido ou suave. Sem cor definida: #DF5830.
export const AGENDA_COR_PADRAO = '#DF5830'

export type EstadoDia = 'passado' | 'hoje' | 'futuro'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

// Aceita '#RRGGBB' ou '#RGB' (formato gravado pelo seletor do EventoDialog).
// Qualquer outra cor vira o laranja primário — nada de texto ilegível.
export function normalizarCorHex(cor?: string | null): string {
  if (!cor) return AGENDA_COR_PADRAO
  const m = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(cor.trim())
  if (!m) return AGENDA_COR_PADRAO
  let hex = cor.trim().slice(1)
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  return `#${hex.toLowerCase()}`
}

// Mistura a cor com branco (tint 0..1). Usada no preenchimento suave do futuro.
export function tintHex(hex: string, proporcaoBranco: number): string {
  const h = normalizarCorHex(hex).slice(1)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const t = clamp(proporcaoBranco, 0, 1)
  const mix = (c: number) => Math.round(c + (255 - c) * t)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

// Estilos inline das pílulas por estado, na cor do compromisso:
// - passado: só contorno (fundo transparente, borda e texto na cor)
// - hoje:    preenchimento sólido + fonte branca
// - futuro:  preenchimento suave (tint ~16% da cor) + texto na cor plena
export function estiloPillEstado(estado: EstadoDia, cor: string): React.CSSProperties {
  const c = normalizarCorHex(cor)
  if (estado === 'hoje') {
    return { backgroundColor: c, borderColor: c, color: '#FFFFFF' }
  }
  if (estado === 'futuro') {
    return { backgroundColor: tintHex(c, 0.84), borderColor: 'transparent', color: c }
  }
  return { backgroundColor: 'transparent', borderColor: c, color: c }
}
