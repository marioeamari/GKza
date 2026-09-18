import PocketBase from 'pocketbase'

const pocketBaseUrl: string =
  (import.meta.env.VITE_POCKETBASE_URL as string | undefined)?.trim() ||
  (typeof window !== 'undefined' ? window.location.origin : '')

const pb = new PocketBase(pocketBaseUrl)
pb.autoCancellation(false)

export default pb
