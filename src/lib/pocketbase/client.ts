import PocketBase from 'pocketbase'
import { createRetryFetch } from './retry'
import { toast } from '@/hooks/use-toast'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

let lastToastTime = 0
const retryFetch = createRetryFetch(globalThis.fetch, {
  delays: [500, 1000, 2000],
  maxRetries: 3,
  onRetry: ({ status }) => {
    if (status === 429) {
      const now = Date.now()
      // Exibe toast com debounce para não inundar o usuário se várias requisições forem retentadas juntas
      if (now - lastToastTime > 3000) {
        lastToastTime = now
        toast({
          title: 'Muitas requisições, tentando novamente...',
          description: 'Aguardando liberação do servidor para concluir as consultas.',
        })
      }
    }
  },
})

pb.beforeSend = (url, options) => {
  options.fetch = retryFetch
  return { url, options }
}

export default pb
