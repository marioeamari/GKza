import { useState } from 'react'
import { CheckCircle2, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'

export default function Signup() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const { signUp } = useAuth()
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (form.name.trim().length < 3) next.name = 'Informe seu nome completo.'
    if (form.password.length < 8) next.password = 'Use pelo menos 8 caracteres.'
    if (form.password !== form.confirm) next.confirm = 'As senhas não coincidem.'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    try {
      await signUp(form)
      setDone(true)
    } catch (error) {
      setErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setLoading(false)
    }
  }
  if (done)
    return (
      <AuthShell backTo="/login">
        <div className="w-full text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h1 className="mt-6 text-3xl font-extrabold">Verifique seu e-mail</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Enviamos um link para <strong className="text-foreground">{form.email}</strong>.
            Confirme o endereço para ativar sua conta.
          </p>
          <Button asChild className="mt-7 w-full">
            <Link to="/login">Ir para o login</Link>
          </Button>
        </div>
      </AuthShell>
    )
  return (
    <AuthShell backTo="/login">
      <div className="w-full">
        <p className="micro-label">Comece agora</p>
        <h1 className="mt-2 text-3xl font-extrabold">Crie sua conta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu acesso começa como visualizador. Um administrador pode ajustar suas permissões.
        </p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          {[
            ['name', 'Nome completo', 'Mario Eduardo', 'text'],
            ['email', 'E-mail', 'voce@empresa.com.br', 'email'],
            ['password', 'Senha', 'Mínimo de 8 caracteres', 'password'],
            ['confirm', 'Confirmar senha', 'Digite novamente', 'password'],
          ].map(([key, label, placeholder, type]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type={type}
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required
              />
              {errors[key] && <p className="field-error">{errors[key]}</p>}
            </div>
          ))}
          {errors.form && (
            <p className="field-error rounded-lg bg-destructive/10 p-3">{errors.form}</p>
          )}
          <Button className="h-12 w-full" disabled={loading}>
            {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Criar conta
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}
