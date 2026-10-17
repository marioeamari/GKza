import type { PeriodRange } from '@/types/domain'

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(value) ? value : 0,
  )

export const formatCompactCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0)

export const parseCurrency = (value: string) => Number(value.replace(/\D/g, '')) / 100

export const currencyInput = (value: number | string) => {
  const number = typeof value === 'number' ? value : parseCurrency(value)
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number || 0)
}

export const getLocalDateStr = (date = new Date()): string => {
  // Converte confiavelmente para o fuso America/Sao_Paulo (horário oficial de Brasília)
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const y = parts.find((p) => p.type === 'year')?.value
    const m = parts.find((p) => p.type === 'month')?.value
    const d = parts.find((p) => p.type === 'day')?.value
    if (y && m && d) return `${y}-${m}-${d}`
  } catch {
    // Fallback padrão se fuso horário não suportado pelo ambiente
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const dateOnly = (value: string | Date) => {
  if (!value) return ''
  if (value instanceof Date) return getLocalDateStr(value)
  // Se for string no formato ISO ou date puro (ex: '2026-10-10 00:00:00.000Z' ou '2026-10-10')
  // Extrai diretamente a parte YYYY-MM-DD para evitar shift de fuso horário
  const trimmed = String(value).trim()
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) {
    return match[1]
  }
  const d = new Date(trimmed)
  if (!isNaN(d.getTime())) {
    return getLocalDateStr(d)
  }
  return trimmed.slice(0, 10)
}

export const toPocketBaseDate = (value: string) => (value ? `${value} 12:00:00.000Z` : '')

export const parseDate = (value: string) => {
  if (!value) return new Date()
  const clean = value.trim().split('T')[0].split(' ')[0]
  const [year, month, day] = clean.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12)
}

export const formatDate = (
  value: string | Date | undefined | null,
  options?: Intl.DateTimeFormatOptions,
) => {
  if (!value) return '-'
  try {
    if (typeof value === 'string') {
      const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (match && !options) {
        // Formato dd/mm/aaaa garantido sem qualquer deslocamento de fuso
        const [, y, m, d] = match
        return `${d}/${m}/${y}`
      }
    }
    const date = value instanceof Date ? value : parseDate(String(value))
    if (isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat(
      'pt-BR',
      options ?? { day: '2-digit', month: '2-digit', year: 'numeric' },
    ).format(date)
  } catch {
    return '-'
  }
}

export const formatShortDate = (value: string | Date) =>
  formatDate(value, { day: '2-digit', month: 'short' }).replace('.', '')

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())
export const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
export const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

export function getPeriodRange(key: PeriodRange['key']): PeriodRange {
  const now = new Date()
  if (key === 'previous') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const previousEnd = endOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 0))
    return { key, label: 'Mês passado', start, end, previousStart, previousEnd }
  }
  if (key === '90days') {
    const end = endOfDay(now)
    const start = startOfDay(addDays(now, -89))
    const previousEnd = endOfDay(addDays(start, -1))
    const previousStart = startOfDay(addDays(previousEnd, -89))
    return { key, label: 'Últimos 90 dias', start, end, previousStart, previousEnd }
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const previousEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
  return { key, label: 'Este mês', start, end, previousStart, previousEnd }
}

export const isWithin = (value: string, start: Date, end: Date) => {
  const date = parseDate(value)
  return date >= start && date <= end
}

export const monthParam = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export const initials = (name?: string) =>
  (name || 'Usuário')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

export const escapeFilter = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export const roleLabel = (role?: string) =>
  ({
    admin: 'Administrador',
    gestor: 'Gestor',
    financeiro: 'Financeiro',
    visualizador: 'Visualizador',
  })[role || ''] || 'Visualizador'
