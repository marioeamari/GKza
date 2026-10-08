import pb from '@/lib/pocketbase/client'
import { ClientResponseError } from 'pocketbase'
import type { GoogleCalendarStatusResponse } from '@/types/domain'

export const GOOGLE_RECONNECT_MESSAGE =
  'A conexão com o Google expirou. Reconecte sua conta Google para voltar a sincronizar.'

/** Detecta, a partir de qualquer erro, que o refresh token Google expirou/foi revogado. */
export function isGoogleTokenExpiredError(err: unknown): boolean {
  if (err instanceof ClientResponseError) {
    const data = (err.response?.data || {}) as Record<string, unknown>
    if (data.needs_reconnect === true) return true
    if (data.code === 'google_token_expired') return true
    const msg = String(data.error || data.detail || err.message || '').toLowerCase()
    return msg.includes('expired or revoked') || msg.includes('invalid_grant')
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    msg.includes('expired or revoked') ||
    msg.includes('token has been expired') ||
    msg.includes('invalid_grant') ||
    msg.includes('renovar token google')
  )
}

export const googleCalendarService = {
  async getStatus(): Promise<GoogleCalendarStatusResponse> {
    return pb.send<GoogleCalendarStatusResponse>('/backend/v1/google/status', {
      method: 'GET',
    })
  },

  async getAuthUrl(origin?: string): Promise<{ url: string; redirect_uri: string }> {
    const currentOrigin = origin || (typeof window !== 'undefined' ? window.location.origin : '')
    const query = currentOrigin ? `?origin=${encodeURIComponent(currentOrigin)}` : ''
    return pb.send<{ url: string; redirect_uri: string }>(`/backend/v1/google/auth-url${query}`, {
      method: 'GET',
    })
  },

  async syncNow(): Promise<{
    success: boolean
    imported: number
    exported: number
    last_sync_at: string
  }> {
    return pb.send<{
      success: boolean
      imported: number
      exported: number
      last_sync_at: string
    }>('/backend/v1/google/sync', {
      method: 'POST',
    })
  },

  async disconnect(): Promise<{ success: boolean; message: string }> {
    return pb.send<{ success: boolean; message: string }>('/backend/v1/google/disconnect', {
      method: 'POST',
    })
  },
}
