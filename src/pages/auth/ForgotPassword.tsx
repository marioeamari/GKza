import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usersService } from '@/services/users'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      await usersService.requestPasswordReset(email)
    } finally {
      setSent(true)
      setLoading(false)
    }
  }
  return (
    <AuthShell backTo="/login">
      <div className="w-full">
        {sent ? (
          <div className="text-center">
            <MailCheck className="mx-auto h-12 w-12 text-success" />
            <h1 className="mt-5 text-3xl font-extrabold">Confira sua caixa de entrada</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Se o endereço estiver cadastrado, você receberá as instruções para redefinir sua
              senha.
            </p>
          </div>
        ) : (
          <>
            <p className="micro-label">Recupere seu acesso</p>
            <h1 className="mt-2 text-3xl font-extrabold">Esqueceu a senha?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Informe seu e-mail e enviaremos um link seguro.
            </p>
            <form className="mt-7 space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button className="h-12 w-full" disabled={loading}>
                Enviar link de recuperação
              </Button>
            </form>
          </>
        )}
      </div>
    </AuthShell>
  )
}
