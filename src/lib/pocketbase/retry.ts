/**
 * Utilitário de retry com backoff exponencial para requisições fetch do PocketBase.
 * Trata HTTP 429 (Too Many Requests / Rate Limit) e erros de rede / 5xx transientes
 * em requisições de leitura (GET/HEAD), respeitando o cabeçalho Retry-After quando presente.
 */

export interface RetryAttemptInfo {
  attempt: number
  maxRetries: number
  waitTime: number
  status?: number
  url?: string
}

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  delays?: number[]
  onRetry?: (info: RetryAttemptInfo) => void
}

const DEFAULT_DELAYS = [500, 1000, 2000]

export function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null
  const trimmed = headerValue.trim()
  if (!trimmed) return null

  // Pode ser número de segundos (ex: "5" ou "2.5")
  const seconds = Number(trimmed)
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000)
  }

  // Ou pode ser data HTTP no padrão RFC 7231 / HTTP-date
  const timestamp = Date.parse(trimmed)
  if (!Number.isNaN(timestamp)) {
    const diff = timestamp - Date.now()
    return diff > 0 ? diff : 0
  }

  return null
}

export function isIdempotentMethod(method?: string): boolean {
  const m = (method || 'GET').toUpperCase()
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS'
}

export function isRetryableStatus(status: number): boolean {
  // HTTP 429 (Rate Limit) e 5xx transientes (502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout)
  return status === 429 || status === 502 || status === 503 || status === 504
}

export function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new Error('Aborted'))
      return
    }

    let timer: any = null

    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason || new Error('Aborted'))
    }

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }

    timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }
      resolve()
    }, ms)
  })
}

/**
 * Cria uma função fetch com suporte a retry e backoff exponencial para métodos idempotentes (GET/HEAD).
 * @param originalFetch fetch nativo ou customizado
 * @param retryOptions opções de tentativas e atrasos
 */
export function createRetryFetch(
  originalFetch: typeof fetch = globalThis.fetch,
  retryOptions?: RetryOptions,
): typeof fetch {
  const delays = retryOptions?.delays ?? DEFAULT_DELAYS
  const maxRetries = retryOptions?.maxRetries ?? delays.length
  const maxDelayMs = retryOptions?.maxDelayMs ?? 10000

  return async function retryFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const method = init?.method || 'GET'
    const isIdempotent = isIdempotentMethod(method)

    // Se NÃO for leitura idempotente (ex: POST, PUT, PATCH, DELETE), não faz retry para não duplicar dados
    if (!isIdempotent) {
      return originalFetch(input, init)
    }

    let attempt = 0

    while (true) {
      try {
        const response = await originalFetch(input, init)

        // Se a resposta for 429 ou 5xx transitório e ainda tivermos tentativas
        if (isRetryableStatus(response.status) && attempt < maxRetries) {
          const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'))
          const defaultDelay =
            delays[attempt] ?? delays[delays.length - 1] * Math.pow(2, attempt - delays.length + 1)
          const waitTime = Math.min(retryAfterMs ?? defaultDelay, maxDelayMs)

          attempt++
          const urlStr =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.toString()
                : (input as Request)?.url
          console.warn(
            `[PocketBase Retry] HTTP ${response.status} detectado na tentativa ${attempt}/${maxRetries}. Aguardando ${waitTime}ms antes de tentar novamente...`,
          )

          try {
            retryOptions?.onRetry?.({
              attempt,
              maxRetries,
              waitTime,
              status: response.status,
              url: urlStr,
            })
          } catch {
            /* ignore callback errors */
          }

          try {
            await sleep(waitTime, init?.signal)
            continue
          } catch {
            // Se foi abortado durante a espera, retorna a própria resposta recebida ou relança o erro
            return response
          }
        }

        return response
      } catch (err: any) {
        // Se a requisição foi abortada explicitamente pelo chamador, não faz retry
        if (init?.signal?.aborted || err?.name === 'AbortError') {
          throw err
        }

        // Erros de rede (Failed to fetch, NetworkError, etc.)
        if (attempt < maxRetries) {
          const defaultDelay =
            delays[attempt] ?? delays[delays.length - 1] * Math.pow(2, attempt - delays.length + 1)
          const waitTime = Math.min(defaultDelay, maxDelayMs)

          attempt++
          console.warn(
            `[PocketBase Retry] Erro de rede detectado na tentativa ${attempt}/${maxRetries}: ${err?.message || err}. Aguardando ${waitTime}ms...`,
          )

          await sleep(waitTime, init?.signal)
          continue
        }

        throw err
      }
    }
  }
}
