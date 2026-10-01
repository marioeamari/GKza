import pb from '@/lib/pocketbase/client'

export interface GetFileUrlOptions {
  thumb?: string
  token?: string
  download?: boolean
  query?: Record<string, any>
}

/**
 * Retorna a URL pública completa para download/visualização de um arquivo armazenado no PocketBase.
 *
 * É robusto a:
 * - Objeto de record passado com { id, collectionName } ou apenas collectionNameOrId e recordId
 * - Formato do filename com caracteres especiais (aplica encodeURI quando necessário)
 * - pb.baseUrl com ou sem barra final
 * - VITE_POCKETBASE_URL como fallback se pb.baseUrl estiver vazio
 */
export function getFileUrl(
  collectionOrRecord:
    | string
    | { id?: string; collectionName?: string; collectionId?: string; [key: string]: any },
  recordIdOrFilename?: string,
  filenameOrOptions?: string | GetFileUrlOptions,
  maybeOptions?: GetFileUrlOptions,
): string {
  let collection = ''
  let recordId = ''
  let filename = ''
  let options: GetFileUrlOptions | undefined

  if (typeof collectionOrRecord === 'string') {
    collection = collectionOrRecord
    recordId = recordIdOrFilename || ''
    filename = typeof filenameOrOptions === 'string' ? filenameOrOptions : ''
    options =
      maybeOptions || (typeof filenameOrOptions === 'object' ? filenameOrOptions : undefined)
  } else if (collectionOrRecord && typeof collectionOrRecord === 'object') {
    collection = collectionOrRecord.collectionName || collectionOrRecord.collectionId || ''
    recordId = collectionOrRecord.id || ''
    filename = typeof recordIdOrFilename === 'string' ? recordIdOrFilename : ''
    options = typeof filenameOrOptions === 'object' ? filenameOrOptions : maybeOptions
  }

  if (!filename || !recordId || !collection) {
    return ''
  }

  const rawBase =
    pb.baseUrl ||
    (typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_POCKETBASE_URL as string) : '') ||
    ''
  const cleanBase = rawBase.replace(/\/+$/, '')

  const encodedFilename = encodeURI(filename)
  let url = `${cleanBase}/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}/${encodedFilename}`

  const queryParams: string[] = []
  if (options?.thumb) {
    queryParams.push(`thumb=${encodeURIComponent(options.thumb)}`)
  }
  if (options?.token) {
    queryParams.push(`token=${encodeURIComponent(options.token)}`)
  }
  if (options?.download) {
    queryParams.push('download=1')
  }
  if (options?.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) {
        queryParams.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      }
    }
  }

  if (queryParams.length > 0) {
    url += `?${queryParams.join('&')}`
  }

  return url
}
