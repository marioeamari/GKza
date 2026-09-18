import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiMessage } from '@/lib/api-error'
import { usersService } from '@/services/users'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (form.password.length < 8) return setError('Use pelo menos 8 caracteres.')
    if (form.password !== form.confirm) return setError('As senhas não coincidem.')
    const token = params.get('token')
    if (!token) return setError('Link inválido ou incompleto.')
    setLoading(true)
    try {
      await usersService.confirmPasswordReset(token, form.password)
      navigate('/login', { replace: true, state: { message: 'Senha alterada com sucesso.' } })
    } catch (e) {
      setError(apiMessage(e, 'Este link expirou. Solicite uma nova recuperação.'))
    } finally {
      setLoading(false)
    }
  }
  return (
    <AuthShell backTo="/login">
      <div className="w-full">
        <p className="micro-label">Nova credencial</p>
        <h1 className="mt-2 text-3xl font-extrabold">Redefinir senha</h1>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label>Nova senha</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Confirmar senha</Label>
            <Input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            />
          </div>
          {error && <p className="field-error">{error}</p>}
          <Button className="h-12 w-full" disabled={loading}>
            Salvar nova senha
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}
