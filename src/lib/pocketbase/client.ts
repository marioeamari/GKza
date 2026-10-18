import PocketBase from 'pocketbase'
import { createRetryFetch } from './retry'

const retryFetch = createRetryFetch()

// Configura PocketBase com hook beforeSend para requisições passarem pelo retryFetch
const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

pb.beforeSend = (url, options) => {
  options.fetch = retryFetch
  return { url, options }
}

export default pb
