import { ClientResponseError } from 'pocketbase'

export type FormErrors = Record<string, string>

const messages: Record<string, string> = {
  'Failed to authenticate.': 'E-mail ou senha incorretos.',
  'The request requires valid record authorization token to be set.':
    'Sua sessão expirou. Entre novamente.',
  'Missing required value.': 'Este campo é obrigatório.',
  'The value is invalid.': 'Valor inválido.',
  'The value is already in use.': 'Este valor já está cadastrado.',
  'Must be a valid email address.': 'Informe um e-mail válido.',
  'Too Many Requests': 'Muitas tentativas em sequência. Aguarde alguns segundos e tente novamente.',
  'Too many requests. Please try again later.':
    'Muitas tentativas em sequência. Aguarde alguns segundos e tente novamente.',
}

export function isNetworkOrServerUnavailable(error: unknown): boolean {
  if (error instanceof ClientResponseError) {
    // status 0 indica falha de rede/CORS/Failed to fetch; 502/503/504 indicam gateway/servidor indisponível
    if (
      error.status === 0 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504
    ) {
      return true
    }
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('load failed') ||
      msg.includes('503') ||
      msg.includes('service temporarily unavailable') ||
      msg.includes('tempo limite excedido')
    )
  }
  return false
}

export function apiMessage(
  error: unknown,
  fallback = 'Não foi possível concluir a ação. Tente novamente.',
) {
  if (isNetworkOrServerUnavailable(error)) {
    return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
  }

  if (!(error instanceof ClientResponseError)) {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('too many requests') || msg.includes('429')) {
        return 'Muitas tentativas consecutivas. Aguarde alguns instantes e tente novamente.'
      }
      return error.message
    }
    return fallback
  }

  if (error.status === 429) {
    return 'Muitas tentativas consecutivas. Aguarde alguns instantes e tente novamente.'
  }

  const responseMessage = typeof error.response?.message === 'string' ? error.response.message : ''
  if (messages[responseMessage]) return messages[responseMessage]
  const details = error.response?.data
  if (details && typeof details === 'object') {
    const first = Object.values(details)[0] as { message?: string } | undefined
    if (first?.message) return messages[first.message] || first.message
  }
  return error.status === 0
    ? 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
    : fallback
}

export function apiFieldErrors(error: unknown): FormErrors {
  if (!(error instanceof ClientResponseError) || !error.response?.data) return {}
  const result: FormErrors = {}
  Object.entries(error.response.data).forEach(([field, detail]) => {
    const message = (detail as { message?: string })?.message
    if (message) result[field] = messages[message] || message
  })
  return result
}
