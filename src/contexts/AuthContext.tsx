import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { RecordAuthResponse } from 'pocketbase'

import pb from '@/lib/pocketbase/client'
import type { UserRecord } from '@/types/domain'

interface SignUpData {
  name: string
  email: string
  password: string
}

interface AuthContextValue {
  user: UserRecord | null
  loading: boolean
  login: (email: string, password: string) => Promise<RecordAuthResponse<UserRecord>>
  signUp: (data: SignUpData) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(
    () => pb.authStore.record as UserRecord | null,
  )
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setUser(null)
      return
    }
    // Timeout de 5s para evitar chamada pendurada indefinidamente se houver instabilidade de rede/servidor
    const refreshPromise = pb.collection<UserRecord>('users').authRefresh()
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Tempo limite excedido ao validar sessão.')), 5000),
    )
    const result = await Promise.race([refreshPromise, timeoutPromise])
    setUser(result.record)
  }, [])

  useEffect(() => {
    let mounted = true
    const remove = pb.authStore.onChange((_token, record) => {
      if (mounted) {
        setUser(record as UserRecord | null)
      }
    })

    // Timeout de segurança global: garante que o estado de loading de inicialização
    // nunca exceda 4 segundos, mesmo se a rede congelar ou requisição pendurar
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setLoading(false)
      }
    }, 4000)

    refreshUser()
      .catch(() => {
        pb.authStore.clear()
        if (mounted) {
          setUser(null)
        }
      })
      .finally(() => {
        clearTimeout(safetyTimeout)
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
      clearTimeout(safetyTimeout)
      remove()
    }
  }, [refreshUser])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const trimmedEmail = email.trim()
        const maxRetries = 2
        let lastError: unknown

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const result = await pb
              .collection<UserRecord>('users')
              .authWithPassword(trimmedEmail, password)

            if (!result.record.active) {
              pb.authStore.clear()
              throw new Error('Este acesso está desativado. Fale com um administrador.')
            }
            return result
          } catch (err) {
            lastError = err

            // Identifica se é erro definitivo (ex: 400 credenciais inválidas, 403, 404, 429) ou usuário desativado
            const isUnauthorized =
              err instanceof Error &&
              (err.message.includes('Este acesso está desativado') ||
                err.message.includes('Failed to authenticate') ||
                err.message.includes('400') ||
                err.message.includes('403') ||
                err.message.includes('429'))

            if (isUnauthorized || attempt === maxRetries) {
              throw err
            }

            // Espera breve com backoff antes da próxima tentativa em caso de erro transitório de rede/503
            await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
          }
        }

        throw lastError
      },
      signUp: async ({ name, email, password }) => {
        await pb.collection<UserRecord>('users').create({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          passwordConfirm: password,
          role: 'visualizador',
          active: true,
        })
        await pb.collection('users').requestVerification(email.trim().toLowerCase())
      },
      logout: () => pb.authStore.clear(),
      refreshUser,
    }),
    [refreshUser, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
