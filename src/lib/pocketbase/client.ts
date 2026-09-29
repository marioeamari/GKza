import PocketBase from 'pocketbase'
import { createRetryFetch } from './retry'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

// Configura hook beforeSend para injetar fetch com retry e backoff exponencial em chamadas de leitura
pb.beforeSend = (url, options) => {
  const currentFetch = options.fetch || globalThis.fetch
  options.fetch = createRetryFetch(currentFetch)
  return { url, options }
}

export default pb
