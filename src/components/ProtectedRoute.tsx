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
  const { user, loading } = useAuth()
  // Enquanto verifica o token persistido inicial no authStore (authRefresh),
  // se houver usuário/token válido guardando sessão, aguarda o loading breve
  // em vez de piscar formulário ou redirecionar prematuramente.
  // Contudo, se NÃO há token salvo no authStore, renderiza a tela de login imediatamente.
  if (loading && user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
