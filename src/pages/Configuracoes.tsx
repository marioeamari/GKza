import { Building2, CalendarDays, CircleUserRound, Cloud, Coins } from 'lucide-react'
import { Link } from 'react-router-dom'
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
          <Card>
            <CardHeader>
              <CardTitle>Cadastros do sistema</CardTitle>
              <p className="text-xs text-muted-foreground">
                Acesse e gerencie seus registros fiscais e cadastrais.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Link
                to="/empresas"
                className="flex items-center justify-between rounded-xl border border-border p-4 transition hover:border-primary/50 hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">Empresas (CNPJ)</h4>
                    <p className="text-xs text-muted-foreground">
                      Pessoas jurídicas e fornecedores
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-primary">Acessar →</span>
              </Link>
              <Link
                to="/pessoas"
                className="flex items-center justify-between rounded-xl border border-border p-4 transition hover:border-primary/50 hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-success/10 text-success">
                    <CircleUserRound className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">Pessoas (CPF)</h4>
                    <p className="text-xs text-muted-foreground">Sócios, prestadores e contatos</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-primary">Acessar →</span>
              </Link>
            </CardContent>
          </Card>
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
