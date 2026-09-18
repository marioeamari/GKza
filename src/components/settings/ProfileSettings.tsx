import { useEffect, useRef, useState } from 'react'
import { Camera, KeyRound, LoaderCircle, Mail, Save } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { formatPhone } from '@/lib/documents'
import { initials } from '@/lib/format'
import pb from '@/lib/pocketbase/client'
import { usersService } from '@/services/users'

export function ProfileSettings() {
  const { user, refreshUser } = useAuth(),
    { toast } = useToast(),
    fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' }),
    [avatar, setAvatar] = useState<File | null>(null),
    [preview, setPreview] = useState(''),
    [saving, setSaving] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [passwordOpen, setPasswordOpen] = useState(false),
    [password, setPassword] = useState({ oldPassword: '', password: '', confirm: '' }),
    [emailOpen, setEmailOpen] = useState(false),
    [email, setEmail] = useState('')
  useEffect(() => {
    if (user) setForm({ name: user.name, phone: user.phone || '' })
  }, [user])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  if (!user) return null
  const currentAvatar =
    preview || (user.avatar ? pb.files.getURL(user, user.avatar, { thumb: '160x160' }) : '')
  const choose = (file?: File) => {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setErrors({ avatar: 'Use uma imagem PNG ou JPG de até 2 MB.' })
      return
    }
    setAvatar(file)
    setPreview(URL.createObjectURL(file))
    setErrors({})
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return setErrors({ name: 'Informe seu nome.' })
    setSaving(true)
    try {
      const data = new FormData()
      data.set('name', form.name.trim())
      data.set('phone', form.phone)
      if (avatar) data.set('avatar', avatar)
      await usersService.update(user.id, data)
      await refreshUser()
      toast({ title: 'Perfil atualizado' })
      setAvatar(null)
    } catch (error) {
      setErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setSaving(false)
    }
  }
  const changePassword = async () => {
    if (password.password.length < 8)
      return setErrors({ password: 'A nova senha deve ter pelo menos 8 caracteres.' })
    if (password.password !== password.confirm)
      return setErrors({ password: 'As senhas não coincidem.' })
    try {
      await usersService.update(user.id, {
        oldPassword: password.oldPassword,
        password: password.password,
        passwordConfirm: password.confirm,
      })
      toast({ title: 'Senha alterada' })
      setPasswordOpen(false)
      setPassword({ oldPassword: '', password: '', confirm: '' })
    } catch (e) {
      setErrors({ password: apiMessage(e, 'A senha atual está incorreta.') })
    }
  }
  const requestEmail = async () => {
    try {
      await usersService.requestEmailChange(email)
      toast({ title: 'Confirmação enviada', description: 'Abra o link recebido no novo e-mail.' })
      setEmailOpen(false)
    } catch (e) {
      setErrors({ email: apiMessage(e) })
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meu perfil</CardTitle>
        <p className="text-xs text-muted-foreground">
          Dados usados na sua identificação dentro do sistema.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <button
              type="button"
              className="group relative h-24 w-24"
              onClick={() => fileRef.current?.click()}
            >
              <Avatar className="h-24 w-24 border-4 border-white shadow-soft">
                <AvatarImage src={currentAvatar} />
                <AvatarFallback className="text-xl">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 grid place-items-center rounded-full bg-foreground/0 text-transparent transition group-hover:bg-foreground/55 group-hover:text-white">
                <Camera className="h-5 w-5" />
              </span>
            </button>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                Alterar foto
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">PNG ou JPG, até 2 MB.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => choose(e.target.files?.[0])}
              />
              {errors.avatar && <p className="field-error">{errors.avatar}</p>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {errors.name && <p className="field-error">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>E-mail</Label>
              <div className="flex gap-2">
                <Input value={user.email} disabled />
                <Button type="button" variant="outline" onClick={() => setEmailOpen(true)}>
                  <Mail className="mr-2 h-4 w-4" />
                  Alterar
                </Button>
              </div>
            </div>
          </div>
          {errors.form && <p className="field-error">{errors.form}</p>}
          <div className="flex flex-wrap gap-2 border-t border-border pt-5">
            <Button disabled={saving}>
              {saving ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar perfil
            </Button>
            <Button type="button" variant="outline" onClick={() => setPasswordOpen(true)}>
              <KeyRound className="mr-2 h-4 w-4" />
              Alterar senha
            </Button>
          </div>
        </form>
      </CardContent>
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>Confirme sua senha atual e defina uma nova.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Senha atual</Label>
              <Input
                type="password"
                value={password.oldPassword}
                onChange={(e) => setPassword({ ...password, oldPassword: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={password.password}
                onChange={(e) => setPassword({ ...password, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                value={password.confirm}
                onChange={(e) => setPassword({ ...password, confirm: e.target.value })}
              />
            </div>
            {errors.password && <p className="field-error">{errors.password}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={changePassword}>Alterar senha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar e-mail</DialogTitle>
            <DialogDescription>
              Enviaremos um link ao novo endereço para confirmar a alteração.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Novo e-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {errors.email && <p className="field-error">{errors.email}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={requestEmail}>Enviar confirmação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
