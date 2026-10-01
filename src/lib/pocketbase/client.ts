import PocketBase from 'pocketbase'
import { createRetryFetch } from './retry'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

const retryFetch = createRetryFetch(fetch, {
  maxRetries: 4,
  delays: [600, 1200, 2400, 4000],
})

pb.beforeSend = (url, options) => {
  options.fetch = retryFetch
  return { url, options }
}

export default pb
