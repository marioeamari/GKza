import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiMessage } from '@/lib/api-error'
import pb from '@/lib/pocketbase/client'
import { usersService } from '@/services/users'

export default function ConfirmEmail() {
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const token = params.get('token')
    if (!token) return setError('Link inválido ou incompleto.')
    try {
      await usersService.confirmEmailChange(token, password)
      pb.authStore.clear()
      setDone(true)
    } catch (e) {
      setError(apiMessage(e, 'Não foi possível alterar o e-mail. O link pode ter expirado.'))
    }
  }
  return (
    <AuthShell>
      {done ? (
        <div className="w-full text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
          <h1 className="mt-5 text-3xl font-extrabold">E-mail alterado</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Entre novamente usando seu novo endereço de e-mail.
          </p>
          <Button asChild className="mt-7 w-full">
            <Link to="/login">Ir para o login</Link>
          </Button>
        </div>
      ) : (
        <div className="w-full">
          <p className="micro-label">Confirmação de segurança</p>
          <h1 className="mt-2 text-3xl font-extrabold">Confirmar novo e-mail</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Digite sua senha atual para concluir a alteração.
          </p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <Label>Senha atual</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="field-error">{error}</p>}
            <Button className="h-12 w-full">Confirmar alteração</Button>
          </form>
        </div>
      )}
    </AuthShell>
  )
}
