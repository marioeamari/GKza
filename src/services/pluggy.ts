import pb from '@/lib/pocketbase/client'
import type { PluggyItemRecord } from '@/types/domain'

export interface PluggyStatusResponse {
  configured: boolean
  auth_ok: boolean
  auth_error?: string | null
  expected_webhook_url: string
}

export interface PluggyConnectTokenResponse {
  accessToken: string
  apiKeyCached?: boolean
}

export interface PluggySyncResponse {
  success: boolean
  items_processed: number
  imported_pendentes: number
  skipped_duplicates: number
  message?: string
}

export const pluggyService = {
  getStatus: async (): Promise<PluggyStatusResponse> => {
    return pb.send<PluggyStatusResponse>('/backend/v1/pluggy/status', {
      method: 'GET',
    })
  },

  getConnectToken: async (itemId?: string): Promise<PluggyConnectTokenResponse> => {
    return pb.send<PluggyConnectTokenResponse>('/backend/v1/pluggy/connect-token', {
      method: 'POST',
      body: { itemId },
    })
  },

  syncItem: async (itemId?: string): Promise<PluggySyncResponse> => {
    return pb.send<PluggySyncResponse>('/backend/v1/pluggy/sync', {
      method: 'POST',
      body: { itemId },
    })
  },

  disconnectItem: async (itemId: string): Promise<{ success: boolean; message: string }> => {
    return pb.send<{ success: boolean; message: string }>('/backend/v1/pluggy/disconnect', {
      method: 'POST',
      body: { itemId },
    })
  },

  listConnectedItems: async (): Promise<PluggyItemRecord[]> => {
    try {
      return await pb.collection<PluggyItemRecord>('pluggy_items').getFullList({
        sort: '-created',
      })
    } catch {
      return []
    }
  },
}
