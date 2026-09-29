import { ClientResponseError } from 'pocketbase'

export type FormErrors = Record<string, string>

const messages: Record<string, string> = {
  'Failed to authenticate.': 'E-mail ou senha incorretos.',
  'The request requires valid record authorization token to be set.':
    'Sua sessão expirou. Entre novamente.',
  'Missing required value.': 'Este campo é obrigatório.',
  'The value is invalid.': 'Valor inválido.',
  'The value is already in use.': 'Este valor já está cadastrado.',
  'Value must be unique.': 'Este valor já está em uso.',
  validation_not_unique: 'Este valor já está em uso.',
  'Failed to create record.': 'Não foi possível criar o registro. Verifique os campos informados.',
  'Failed to update record.':
    'Não foi possível atualizar o registro. Verifique os campos informados.',
  'Must be a valid email address.': 'Informe um e-mail válido.',
  'Too Many Requests': 'Muitas tentativas em sequência. Aguarde alguns segundos e tente novamente.',
  'Too many requests. Please try again later.':
    'Muitas tentativas em sequência. Aguarde alguns segundos e tente novamente.',
}

const uniqueFieldLabels: Record<string, string> = {
  sku: 'Já existe um produto com este SKU. Escolha outro SKU.',
  cnpj: 'Já existe um cadastro com este CNPJ.',
  cpf: 'Já existe um cadastro com este CPF.',
  slug: 'Já existe um registro com este identificador (slug).',
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
        return 'Servidor ocupado (limite de requisições). Tente novamente em instantes.'
      }
      return error.message
    }
    return fallback
  }

  if (error.status === 429) {
    return 'Servidor ocupado (limite de requisições). Tente novamente em instantes.'
  }

  const details = error.response?.data
  if (details && typeof details === 'object') {
    const skuDetail = (details as Record<string, { code?: string; message?: string }>).sku
    if (skuDetail?.code === 'validation_not_unique') {
      return 'Já existe um produto com este SKU cadastrado. Escolha outro SKU para continuar.'
    }
  }

  const responseMessage = typeof error.response?.message === 'string' ? error.response.message : ''
  if (messages[responseMessage]) return messages[responseMessage]
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
  Object.entries(error.response.data).forEach(([field, rawDetail]) => {
    const detail = rawDetail as { code?: string; message?: string } | undefined
    if (!detail) return
    if (detail.code === 'validation_not_unique' || detail.message === 'Value must be unique.') {
      result[field] = uniqueFieldLabels[field] || 'Este valor já está cadastrado.'
      return
    }
    const message = detail.message
    if (message) result[field] = messages[message] || message
  })
  return result
}
