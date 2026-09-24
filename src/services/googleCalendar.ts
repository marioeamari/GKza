import pb from '@/lib/pocketbase/client'
import type { GoogleCalendarStatusResponse } from '@/types/domain'

export const googleCalendarService = {
  async getStatus(): Promise<GoogleCalendarStatusResponse> {
    return pb.send<GoogleCalendarStatusResponse>('/backend/v1/google/status', {
      method: 'GET',
    })
  },

  async getAuthUrl(): Promise<{ url: string; redirect_uri: string }> {
    return pb.send<{ url: string; redirect_uri: string }>('/backend/v1/google/auth-url', {
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
