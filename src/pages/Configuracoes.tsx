import { CalendarDays, Cloud, Coins } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ProfileSettings } from '@/components/settings/ProfileSettings'
import { UserManagement } from '@/components/settings/UserManagement'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'

export default function Configuracoes() {
  const { user } = useAuth()
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Gerencie seu perfil, acessos e preferências."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
        <div className="space-y-5">
          <ProfileSettings />
          {user?.role === 'admin' && <UserManagement />}
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Preferências</CardTitle>
              <p className="text-xs text-muted-foreground">
                Padrões de exibição fixos nesta versão.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-primary" />
                  Moeda
                </Label>
                <Input value="Real brasileiro (BRL)" disabled />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Formato de data
                </Label>
                <Input value="dd/mm/aaaa (pt-BR)" disabled />
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-0 bg-[#241B15] text-white">
            <CardContent className="p-6">
              <Cloud className="h-7 w-7 text-[#F07751]" />
              <h3 className="mt-5 font-bold">E-mails transacionais</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Os modelos de verificação, recuperação e alteração de e-mail são administrados com
                segurança no painel Skip Cloud.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
