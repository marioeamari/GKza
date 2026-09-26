import { useState, useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AlertCircle, LoaderCircle, RefreshCw, LogIn } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'

const LOADING_TIMEOUT_MS = 8000

export function ProtectedRoute() {
  const { user, loading, refreshUser } = useAuth()
  const location = useLocation()
  const [timedOut, setTimedOut] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (!loading) {
      setTimedOut(false)
      return
    }

    const timer = setTimeout(() => {
      setTimedOut(true)
    }, LOADING_TIMEOUT_MS)

    return () => clearTimeout(timer)
  }, [loading])

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await refreshUser()
    } catch {
      // Ignora erro capturado no context
    } finally {
      setRetrying(false)
      setTimedOut(false)
    }
  }

  if (loading) {
    if (timedOut) {
      return (
        <div className="grid min-h-screen place-items-center bg-background p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-sm text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Conexão lenta ou instável</h2>
            <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              O sistema demorou mais que o esperado para validar sua sessão. Você pode tentar
              reconectar agora ou acessar com as credenciais novamente.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                onClick={handleRetry}
                disabled={retrying}
                className="bg-primary hover:bg-primary/90 text-white font-semibold"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? 'Tentando...' : 'Tentar novamente'}
              </Button>
              <Button variant="outline" asChild className="border-border">
                <a href="/login">
                  <LogIn className="mr-2 h-4 w-4" />
                  Ir para login
                </a>
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-medium text-muted-foreground animate-pulse">
            Carregando sistema...
          </span>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!loading) {
      setTimedOut(false)
      return
    }

    const timer = setTimeout(() => {
      setTimedOut(true)
    }, LOADING_TIMEOUT_MS)

    return () => clearTimeout(timer)
  }, [loading])

  // Enquanto verifica o token persistido inicial no authStore (authRefresh),
  // se houver usuário/token válido guardando sessão, aguarda o loading breve
  // em vez de piscar formulário ou redirecionar prematuramente.
  // Contudo, se demorar além do timeout ou se NÃO há token salvo no authStore,
  // exibe a tela de login imediatamente para não reter o usuário no spinner.
  if (loading && user && !timedOut) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-medium text-muted-foreground animate-pulse">
            Verificando credenciais...
          </span>
        </div>
      </div>
    )
  }

  if (user && !timedOut) return <Navigate to="/" replace />
  return <Outlet />
}
