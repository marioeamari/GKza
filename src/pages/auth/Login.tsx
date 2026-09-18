import { useState } from 'react'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { apiMessage } from '@/lib/api-error'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      const destination =
        (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'
      navigate(destination, { replace: true })
    } catch (nextError) {
      setError(apiMessage(nextError, nextError instanceof Error ? nextError.message : undefined))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <div className="w-full">
        <p className="micro-label">Bem-vindo de volta</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Entre na sua conta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acompanhe suas finanças e vendas em um só lugar.
        </p>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link className="text-xs font-bold text-primary hover:underline" to="/esqueci-senha">
                Esqueci minha senha
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-11"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShow(!show)}
                aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
              {error}
            </p>
          )}
          <Button className="h-12 w-full" type="submit" disabled={loading}>
            {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Entrar
          </Button>
        </form>
        <p className="mt-7 text-center text-sm text-muted-foreground">
          Ainda não tem acesso?{' '}
          <Link to="/cadastro" className="font-bold text-primary hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
