import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user } = useAuth()
  // As rotas públicas (/login, /cadastro, etc.) devem renderizar o formulário imediatamente.
  // Nenhum estado de loading de inicialização deve bloquear a tela com spinner infinito.
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
