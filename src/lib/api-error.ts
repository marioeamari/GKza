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
}

export function apiMessage(
  error: unknown,
  fallback = 'Não foi possível concluir a ação. Tente novamente.',
) {
  if (!(error instanceof ClientResponseError))
    return error instanceof Error ? error.message : fallback
  const responseMessage = typeof error.response?.message === 'string' ? error.response.message : ''
  if (messages[responseMessage]) return messages[responseMessage]
  const details = error.response?.data
  if (details && typeof details === 'object') {
    const first = Object.values(details)[0] as { message?: string } | undefined
    if (first?.message) return messages[first.message] || first.message
  }
  return error.status === 0 ? 'Sem conexão com o servidor. Verifique sua internet.' : fallback
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
