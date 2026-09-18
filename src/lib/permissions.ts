import type { Role } from '@/types/domain'

export type Action =
  | 'writeFinance'
  | 'deleteFinance'
  | 'writeRegistry'
  | 'writeMarketplace'
  | 'manageUsers'

export function can(role: Role | undefined, action: Action) {
  if (role === 'admin') return true
  if (action === 'manageUsers') return false
  if (action === 'deleteFinance' || action === 'writeRegistry') return role === 'gestor'
  if (action === 'writeFinance' || action === 'writeMarketplace')
    return role === 'gestor' || role === 'financeiro'
  return false
}
