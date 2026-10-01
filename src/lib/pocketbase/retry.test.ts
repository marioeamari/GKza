import { describe, it, expect, vi } from 'vitest'
import { createRetryFetch, parseRetryAfter, isIdempotentMethod, isRetryableStatus } from './retry'

describe('PocketBase Retry Utility', () => {
  it('identifica corretamente métodos idempotentes elegíveis para retry', () => {
    expect(isIdempotentMethod('GET')).toBe(true)
    expect(isIdempotentMethod('get')).toBe(true)
    expect(isIdempotentMethod('HEAD')).toBe(true)
    expect(isIdempotentMethod('OPTIONS')).toBe(true)
    expect(isIdempotentMethod(undefined)).toBe(true) // default é GET

    expect(isIdempotentMethod('POST')).toBe(false)
    expect(isIdempotentMethod('PUT')).toBe(false)
    expect(isIdempotentMethod('PATCH')).toBe(false)
    expect(isIdempotentMethod('DELETE')).toBe(false)
  })

  it('identifica status com retry permitido (429, 502, 503, 504)', () => {
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(502)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
    expect(isRetryableStatus(504)).toBe(true)

    expect(isRetryableStatus(200)).toBe(false)
    expect(isRetryableStatus(400)).toBe(false)
    expect(isRetryableStatus(401)).toBe(false)
    expect(isRetryableStatus(403)).toBe(false)
    expect(isRetryableStatus(404)).toBe(false)
    expect(isRetryableStatus(500)).toBe(false)
  })

  it('faz parse do cabeçalho Retry-After em segundos ou data HTTP', () => {
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('')).toBeNull()
    expect(parseRetryAfter('3')).toBe(3000)
    expect(parseRetryAfter('1.5')).toBe(1500)

    const futureDate = new Date(Date.now() + 5000).toUTCString()
    const parsed = parseRetryAfter(futureDate)
    expect(parsed).not.toBeNull()
    expect(parsed).toBeGreaterThan(0)
    expect(parsed).toBeLessThanOrEqual(5100)
  })

  it('executa retry em HTTP 429 para GET e sucede na tentativa seguinte', async () => {
    let calls = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({ message: 'Too Many Requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ items: [{ id: '1', name: 'Item 1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const retryFetch = createRetryFetch(mockFetch as unknown as typeof fetch, {
      delays: [10, 20, 30],
      maxRetries: 3,
    })

    const response = await retryFetch('https://example.com/api/collections/items/records', {
      method: 'GET',
    })

    expect(response.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('respeita o cabeçalho Retry-After quando fornecido pelo servidor', async () => {
    let calls = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({ message: 'Rate limited' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '0.02', // 20ms
          },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const retryFetch = createRetryFetch(mockFetch as unknown as typeof fetch, {
      delays: [100, 200],
      maxRetries: 2,
    })

    const response = await retryFetch('https://example.com/api/test', { method: 'GET' })
    expect(response.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('notifica callback onRetry ao disparar tentativa de repetição', async () => {
    let calls = 0
    const onRetryMock = vi.fn()
    const mockFetch = vi.fn().mockImplementation(async () => {
      calls++
      if (calls === 1) {
        return new Response(JSON.stringify({ message: 'Rate limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const retryFetch = createRetryFetch(mockFetch as unknown as typeof fetch, {
      delays: [10, 20],
      maxRetries: 2,
      onRetry: onRetryMock,
    })

    const response = await retryFetch('https://example.com/api/test', { method: 'GET' })
    expect(response.status).toBe(200)
    expect(calls).toBe(2)
    expect(onRetryMock).toHaveBeenCalledTimes(1)
    expect(onRetryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        status: 429,
        maxRetries: 2,
      }),
    )
  })

  it('não faz retry em operações mutantes (POST, PATCH, DELETE) para evitar duplicações', async () => {
    let calls = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      calls++
      return new Response(JSON.stringify({ message: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const retryFetch = createRetryFetch(mockFetch as unknown as typeof fetch, {
      delays: [10, 20],
      maxRetries: 2,
    })

    const response = await retryFetch('https://example.com/api/collections/items/records', {
      method: 'POST',
      body: JSON.stringify({ nome: 'Teste' }),
    })

    expect(response.status).toBe(429)
    expect(calls).toBe(1) // nenhuma retentativa
  })

  it('retorna a resposta com status 429 após esgotar todas as tentativas', async () => {
    let calls = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      calls++
      return new Response(JSON.stringify({ message: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const retryFetch = createRetryFetch(mockFetch as unknown as typeof fetch, {
      delays: [5, 10],
      maxRetries: 2,
    })

    const response = await retryFetch('https://example.com/api/collections/items/records', {
      method: 'GET',
    })

    expect(response.status).toBe(429)
    // Tentativa inicial + 2 retentativas = 3 chamadas
    expect(calls).toBe(3)
  })
})
