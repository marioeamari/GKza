import PocketBase from 'pocketbase'
import { createRetryFetch } from './retry'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

// Configura fetch com retry e backoff exponencial para métodos idempotentes (GET, HEAD, OPTIONS)
// tratando HTTP 429 e erros transitórios sem duplicar mutações
if (typeof pb.beforeSend === 'function') {
  const retryFetch = createRetryFetch(globalThis.fetch)
  pb.beforeSend = (url, options) => {
    options.fetch = retryFetch
    return { url, options }
  }
}

export default pb
