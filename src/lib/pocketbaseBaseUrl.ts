/**
 * Base URL do backend PocketBase para uso em código de BROWSER.
 *
 * Ordem de resolução (igual aos hooks de OAuth):
 *   1. import.meta.env.VITE_POCKETBASE_URL (definida neste projeto)
 *   2. fallback: mesma origem da página (window.location.origin) — o app
 *      é servido pelo próprio PocketBase, então /api/files/ funciona relativo.
 *
 * Em testes (sem window ou sem env), devolve a string que o teste definir
 * via stub de import.meta.env, senão ''.
 */
export function resolvePocketBaseBaseUrl(): string {
  let base: string =
    (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_POCKETBASE_URL as string)) || ''
  if (!base && typeof window !== 'undefined' && window.location?.origin) {
    base = window.location.origin
  }
  return base.replace(/\/+$/, '')
}

export const VITE_POCKETBASE_URL = resolvePocketBaseBaseUrl()
