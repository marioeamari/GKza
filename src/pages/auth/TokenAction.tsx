import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleX, LoaderCircle } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { apiMessage } from '@/lib/api-error'
import { usersService } from '@/services/users'

export default function TokenAction({ type }: { type: 'verification' }) {
  const [params] = useSearchParams()
  const started = useRef(false)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')
  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setError('O link está incompleto.')
      return
    }
    usersService
      .confirmVerification(token)
      .then(() => setStatus('success'))
      .catch((e) => {
        setError(apiMessage(e, 'Este link é inválido ou expirou.'))
        setStatus('error')
      })
  }, [params])
  return (
    <AuthShell>
      <div className="w-full text-center">
        {status === 'loading' && (
          <>
            <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-5 text-2xl font-extrabold">Confirmando seu e-mail...</h1>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <h1 className="mt-5 text-3xl font-extrabold">E-mail verificado</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Seu acesso está pronto. Entre com suas credenciais.
            </p>
            <Button asChild className="mt-7 w-full">
              <Link to="/login">Ir para o login</Link>
            </Button>
          </>
        )}
        {status === 'error' && (
          <>
            <CircleX className="mx-auto h-14 w-14 text-destructive" />
            <h1 className="mt-5 text-3xl font-extrabold">Não foi possível confirmar</h1>
            <p className="mt-3 text-sm text-muted-foreground">{error}</p>
            <Button asChild variant="outline" className="mt-7 w-full">
              <Link to="/login">Ir para o login</Link>
            </Button>
          </>
        )}
      </div>
    </AuthShell>
  )
}
