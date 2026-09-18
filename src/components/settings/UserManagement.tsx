import { useEffect, useState } from 'react'
import { LoaderCircle, Plus, ShieldCheck, UserX } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { initials, roleLabel } from '@/lib/format'
import pb from '@/lib/pocketbase/client'
import { usersService } from '@/services/users'
import type { Role, UserRecord } from '@/types/domain'

const descriptions: Record<Role, string> = {
  admin: 'Acesso completo, incluindo usuários e exclusões.',
  gestor: 'Gerencia financeiro, marketplaces e cadastros.',
  financeiro: 'Opera finanças, vendas e repasses; cadastros somente leitura.',
  visualizador: 'Pode apenas consultar as informações.',
}
export function UserManagement() {
  const { user } = useAuth(),
    { toast } = useToast()
  const [users, setUsers] = useState<UserRecord[]>([]),
    [loading, setLoading] = useState(true),
    [createOpen, setCreateOpen] = useState(false),
    [form, setForm] = useState({ name: '', email: '', password: '', role: 'visualizador' as Role }),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [confirm, setConfirm] = useState<{ record: UserRecord; role: Role } | null>(null)
  const load = async () => {
    try {
      setUsers(await usersService.list())
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar usuários',
        description: apiMessage(e),
      })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])
  const create = async () => {
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = 'Informe o nome.'
    if (form.password.length < 8) next.password = 'Use pelo menos 8 caracteres.'
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await usersService.create(form)
      toast({
        title: 'Usuário criado',
        description: 'Compartilhe a senha temporária por um canal seguro.',
      })
      setCreateOpen(false)
      setForm({ name: '', email: '', password: '', role: 'visualizador' })
      load()
    } catch (e) {
      setErrors({ ...apiFieldErrors(e), form: apiMessage(e) })
    }
  }
  const updateRole = async () => {
    if (!confirm) return
    if (confirm.record.id === user?.id) {
      setErrors({ self: 'Você não pode alterar seu próprio papel. Peça a outro administrador.' })
      setConfirm(null)
      return
    }
    try {
      await usersService.update(confirm.record.id, { role: confirm.role })
      toast({ title: 'Permissões atualizadas' })
      load()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Falha ao atualizar', description: apiMessage(e) })
    } finally {
      setConfirm(null)
    }
  }
  const toggle = async (record: UserRecord) => {
    if (record.id === user?.id)
      return setErrors({ self: 'Você não pode desativar seu próprio acesso.' })
    try {
      await usersService.update(record.id, { active: !record.active })
      toast({ title: record.active ? 'Acesso desativado' : 'Acesso reativado' })
      load()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Falha ao atualizar', description: apiMessage(e) })
    }
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Usuários e permissões</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Controle quem acessa e o que cada pessoa pode fazer.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Criar usuário
        </Button>
      </CardHeader>
      <CardContent>
        {errors.self && (
          <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {errors.self}
          </p>
        )}
        {loading ? (
          <div className="grid h-32 place-items-center">
            <LoaderCircle className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {users.map((record) => {
              const avatar = record.avatar
                ? pb.files.getURL(record, record.avatar, { thumb: '80x80' })
                : ''
              return (
                <div
                  key={record.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar>
                      <AvatarImage src={avatar} />
                      <AvatarFallback>{initials(record.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">
                        {record.name || 'Sem nome'}{' '}
                        {record.id === user?.id && (
                          <small className="text-muted-foreground">(você)</small>
                        )}
                      </strong>
                      <span className="block truncate text-xs text-muted-foreground">
                        {record.email}
                      </span>
                    </span>
                  </div>
                  <Badge variant={record.active ? 'secondary' : 'destructive'}>
                    {record.active ? 'Ativo' : 'Desativado'}
                  </Badge>
                  <Select
                    value={record.role}
                    onValueChange={(role) => setConfirm({ record, role: role as Role })}
                    disabled={record.id === user?.id}
                  >
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(descriptions).map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={record.active ? 'text-destructive' : 'text-success'}
                    onClick={() => toggle(record)}
                    disabled={record.id === user?.id}
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    {record.active ? 'Desativar' : 'Reativar'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar usuário</DialogTitle>
            <DialogDescription>
              Defina uma senha temporária para o primeiro acesso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {errors.name && <p className="field-error">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Senha temporária</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              {errors.password && <p className="field-error">{errors.password}</p>}
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select
                value={form.role}
                onValueChange={(role) => setForm({ ...form, role: role as Role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(descriptions).map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{descriptions[form.role]}</p>
            </div>
            {errors.form && <p className="field-error">{errors.form}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create}>Criar acesso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Confirmar nova permissão
            </DialogTitle>
            <DialogDescription>
              Você está alterando {confirm?.record.name} para{' '}
              <strong>{roleLabel(confirm?.role)}</strong>.
            </DialogDescription>
          </DialogHeader>
          {confirm && (
            <p className="rounded-xl bg-secondary p-4 text-sm">{descriptions[confirm.role]}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button onClick={updateRole}>Confirmar alteração</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
