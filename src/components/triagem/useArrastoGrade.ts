import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Arrasto unificado (mouse + toque) da grade da Triagem.
 *
 * Regras de gesto:
 * - mouse: arrastar ativa com ~5px de movimento;
 * - toque: LONG-PRESS de ~420ms ativa o arrasto; mover o dedo antes disso
 *   cancela e o gesto vira scroll normal (o touchmove só é bloqueado DEPOIS
 *   da ativação, via listener não-passivo);
 * - soltar sobre OUTRO card decide pela zona do card alvo:
 *     · borda superior (30%)  → 'antes'  (reordena a grade);
 *     · borda inferior (30%)  → 'depois' (reordena a grade);
 *     · centro                → 'centro' (agrupa).
 * - cliques disparados logo após um arrasto são suprimidos (suprimirClique).
 */

export type ZonaSoltar = 'antes' | 'depois' | 'centro'

export interface EstadoArrasto {
  arrastandoKey: string | null
  alvoKey: string | null
  zona: ZonaSoltar | null
}

const DIST_MOUSE = 5
const DIST_TOQUE = 12
const LONG_PRESS_MS = 420

interface InfoArrasto {
  pointerId: number
  key: string
  x0: number
  y0: number
  tipo: 'mouse' | 'toque'
  timer: number | null
  ativo: boolean
}

export function useArrastoGrade(
  aoSoltar: (arrastadoKey: string, alvoKey: string, zona: ZonaSoltar) => void,
) {
  const [estado, setEstado] = useState<EstadoArrasto>({
    arrastandoKey: null,
    alvoKey: null,
    zona: null,
  })

  const estadoRef = useRef(estado)
  estadoRef.current = estado
  const aoSoltarRef = useRef(aoSoltar)
  aoSoltarRef.current = aoSoltar
  const infoRef = useRef<InfoArrasto | null>(null)
  const supressaoRef = useRef(0)

  /** true quando o clique atual veio de um arrasto (deve ser ignorado). */
  const suprimirClique = useCallback(() => Date.now() < supressaoRef.current, [])

  const limparListeners = useCallback(() => {
    window.removeEventListener('pointermove', aoMover)
    window.removeEventListener('pointerup', aoSoltarPointer)
    window.removeEventListener('pointercancel', finalizar)
    window.removeEventListener('touchmove', bloquearScroll)
  }, [])

  const finalizar = useCallback(() => {
    const info = infoRef.current
    if (info?.timer) window.clearTimeout(info.timer)
    infoRef.current = null
    setEstado({ arrastandoKey: null, alvoKey: null, zona: null })
    limparListeners()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limparListeners])

  const bloquearScroll = useCallback((e: TouchEvent) => {
    if (infoRef.current?.ativo) e.preventDefault()
  }, [])

  const atualizarAlvo = useCallback((x: number, y: number) => {
    const arrastando = infoRef.current?.key ?? null
    const el = document.elementFromPoint(x, y)
    const card = (el?.closest?.('[data-arrasto-key]') as HTMLElement | null) ?? null
    const alvoKey = card?.dataset.arrastoKey ?? null
    let zona: ZonaSoltar = 'centro'
    if (card) {
      const r = card.getBoundingClientRect()
      const rel = (y - r.top) / Math.max(1, r.height)
      zona = rel < 0.3 ? 'antes' : rel > 0.7 ? 'depois' : 'centro'
    }
    setEstado((s) => ({
      ...s,
      alvoKey: alvoKey && alvoKey !== arrastando ? alvoKey : null,
      zona: alvoKey && alvoKey !== arrastando ? zona : null,
    }))
  }, [])

  const ativar = useCallback(() => {
    const info = infoRef.current
    if (!info || info.ativo) return
    info.ativo = true
    setEstado((s) => ({ ...s, arrastandoKey: info.key }))
    window.addEventListener('touchmove', bloquearScroll, { passive: false })
  }, [bloquearScroll])

  const aoMover = useCallback(
    (e: PointerEvent) => {
      const info = infoRef.current
      if (!info || e.pointerId !== info.pointerId) return
      const dx = e.clientX - info.x0
      const dy = e.clientY - info.y0
      if (!info.ativo) {
        const dist = Math.hypot(dx, dy)
        if (info.tipo === 'mouse' && dist > DIST_MOUSE) ativar()
        else if (info.tipo === 'toque' && dist > DIST_TOQUE) finalizar() // vira scroll
        return
      }
      atualizarAlvo(e.clientX, e.clientY)
    },
    [ativar, finalizar, atualizarAlvo],
  )

  const aoSoltarPointer = useCallback(
    (e: PointerEvent) => {
      const info = infoRef.current
      if (!info || e.pointerId !== info.pointerId) return
      if (info.ativo) {
        supressaoRef.current = Date.now() + 450
        const st = estadoRef.current
        if (st.alvoKey) {
          aoSoltarRef.current(info.key, st.alvoKey, st.zona ?? 'centro')
        }
      }
      finalizar()
    },
    [finalizar],
  )

  /** Props a espalhar no wrapper arrastável de cada card da grade. */
  const manipuladores = useCallback(
    (key: string) => ({
      'data-arrasto-key': key,
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        if (infoRef.current) return // já há um arrasto em andamento
        const tipo: 'mouse' | 'toque' = e.pointerType === 'mouse' ? 'mouse' : 'toque'
        const info: InfoArrasto = {
          pointerId: e.pointerId,
          key,
          x0: e.clientX,
          y0: e.clientY,
          tipo,
          timer: null,
          ativo: false,
        }
        if (tipo === 'toque') {
          info.timer = window.setTimeout(() => {
            const atual = infoRef.current
            if (atual && !atual.ativo) {
              navigator.vibrate?.(15)
              ativar()
            }
          }, LONG_PRESS_MS)
        }
        infoRef.current = info
        window.addEventListener('pointermove', aoMover)
        window.addEventListener('pointerup', aoSoltarPointer)
        window.addEventListener('pointercancel', finalizar)
      },
    }),
    [aoMover, aoSoltarPointer, finalizar, ativar],
  )

  useEffect(() => () => finalizar(), [finalizar])

  return { estado, manipuladores, suprimirClique }
}

export type ArrastoGrade = ReturnType<typeof useArrastoGrade>
