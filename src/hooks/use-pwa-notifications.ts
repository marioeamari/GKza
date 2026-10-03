import { useEffect, useState, useCallback, useRef } from 'react'
import type { LembreteRapido } from '@/types/domain'
import { getLocalDateStr } from '@/lib/format'

const NOTIFIED_KEY_PREFIX = 'gkza_lembrete_notified_'

/**
 * Retorna true se o lembrete pendente atingiu ou ultrapassou a hora/data limite.
 * Leva em consideração "repetir_ate_concluir": se a data limite era anterior ou hoje,
 * e a hora limite já passou, ele fica ativo para notificação e lembrete até concluir.
 */
export function isLembreteVencidoOuNoMomento(lembrete: LembreteRapido): boolean {
  if (lembrete.status !== 'pendente') return false

  const hojeStr = getLocalDateStr(new Date())
  const dataItemStr = lembrete.data_limite ? lembrete.data_limite.slice(0, 10) : hojeStr

  const now = new Date()
  const horaAtual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  // Se a data já passou (ontem ou anterior)
  if (dataItemStr < hojeStr) {
    return true
  }

  // Se a data é hoje
  if (dataItemStr === hojeStr) {
    if (!lembrete.hora_limite) {
      return true
    }
    return horaAtual >= lembrete.hora_limite
  }

  // Data futura
  return false
}

/**
 * Hook para gerenciar permissão da Notification API do navegador/PWA
 * e disparar notificações sonoras/visuais quando um lembrete estiver vencido/atingido.
 */
export function usePwaNotifications(lembretes: LembreteRapido[]) {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission
    }
    return 'default'
  })

  const [supported, setSupported] = useState(false)
  const lastCheckRef = useRef<number>(0)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setSupported(true)
      setPermission(Notification.permission)
    }
  }, [])

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied'
    }
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result
    } catch {
      return 'denied'
    }
  }, [])

  // Checagem periódica (a cada minuto) e disparo de notificação
  const checkAndNotify = useCallback(() => {
    if (!supported || permission !== 'granted') return

    const now = new Date()
    const hojeStr = getLocalDateStr(now)
    lastCheckRef.current = Date.now()

    lembretes.forEach((item) => {
      if (item.status !== 'pendente') return

      if (isLembreteVencidoOuNoMomento(item)) {
        // Marca se já notificou HOJE para evitar spam contínuo na mesma sessão
        const storageKey = `${NOTIFIED_KEY_PREFIX}${item.id}_${hojeStr}`
        const alreadyNotified = sessionStorage.getItem(storageKey)

        if (!alreadyNotified) {
          try {
            const horaText = item.hora_limite ? ` às ${item.hora_limite}` : ''
            const n = new Notification(
              item.prioridade === 'urgente'
                ? `🚨 URGENTE: ${item.titulo}`
                : `⏰ Lembrete GKza: ${item.titulo}`,
              {
                body: item.detalhe
                  ? `${item.detalhe}${horaText ? ` (${horaText})` : ''}`
                  : `Tarefa pendente agendada para hoje${horaText}. Toque para abrir.`,
                icon: '/pwa-icon.svg',
                badge: '/pwa-icon.svg',
                tag: `lembrete_${item.id}`,
              },
            )

            n.onclick = () => {
              window.focus()
              n.close()
            }

            sessionStorage.setItem(storageKey, 'true')
          } catch (err) {
            console.warn('Erro ao disparar notificação local:', err)
          }
        }
      }
    })
  }, [lembretes, supported, permission])

  useEffect(() => {
    checkAndNotify()
    const timer = setInterval(checkAndNotify, 60000)
    return () => clearInterval(timer)
  }, [checkAndNotify])

  return {
    supported,
    permission,
    requestPermission,
    checkAndNotify,
  }
}
