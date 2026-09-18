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
    const result = await pb.collection<UserRecord>('users').authRefresh()
    setUser(result.record)
  }, [])

  useEffect(() => {
    const remove = pb.authStore.onChange((_token, record) => setUser(record as UserRecord | null))
    refreshUser()
      .catch(() => pb.authStore.clear())
      .finally(() => setLoading(false))
    return remove
  }, [refreshUser])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const result = await pb
          .collection<UserRecord>('users')
          .authWithPassword(email.trim(), password)
        if (!result.record.active) {
          pb.authStore.clear()
          throw new Error('Este acesso está desativado. Fale com um administrador.')
        }
        return result
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
