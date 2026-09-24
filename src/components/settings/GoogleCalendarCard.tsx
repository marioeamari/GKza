import { useState, useEffect } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Unlink,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { googleCalendarService } from '@/services/googleCalendar'
import { useToast } from '@/hooks/use-toast'
import type { GoogleCalendarStatusResponse } from '@/types/domain'

export function GoogleCalendarCard() {
  const { toast } = useToast()
  const [status, setStatus] = useState<GoogleCalendarStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const loadStatus = async () => {
    try {
      const data = await googleCalendarService.getStatus()
      setStatus(data)
    } catch (err) {
      console.warn('Erro ao obter status do Google Calendar:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const handleConnect = async () => {
    try {
      const res = await googleCalendarService.getAuthUrl()
      if (res.url) {
        window.location.href = res.url
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verifique os logs.'
      toast({
        title: 'Credenciais OAuth Ausentes',
        description: message.includes('GOOGLE_CLIENT_ID')
          ? 'As credenciais GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET ainda não foram salvas nas variáveis de ambiente do sistema.'
          : message,
        variant: 'destructive',
      })
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Deseja desconectar sua conta do Google Calendar?')) return

    setDisconnecting(true)
    try {
      await googleCalendarService.disconnect()
      toast({ title: 'Google Calendar desconectado com sucesso.' })
      loadStatus()
    } catch {
      toast({ title: 'Erro ao desconectar', variant: 'destructive' })
    } finally {
      setDisconnecting(false)
    }
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const res = await googleCalendarService.syncNow()
      toast({
        title: 'Sincronização concluída!',
        description: `${res.imported} eventos importados, ${res.exported} exportados.`,
      })
      loadStatus()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tente novamente.'
      toast({
        title: 'Erro na sincronização',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Google Calendar</CardTitle>
              <CardDescription className="text-xs">
                Sincronização bidirecional de reuniões e compromissos com a sua conta Google.
              </CardDescription>
            </div>
          </div>
          {status?.is_connected ? (
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Conectado</Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              Não conectado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-xs text-muted-foreground">Verificando status de conexão...</p>
        ) : status?.is_connected ? (
          <div className="space-y-3">
            <div className="p-3 bg-muted/40 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Conta Google conectada:</span>
                <span className="font-semibold text-foreground">
                  {status.connected_email || 'Conta autorizada'}
                </span>
              </div>
              {status.last_sync_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Última sincronização:</span>
                  <span className="font-medium text-foreground">
                    {new Date(status.last_sync_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              )}
              {status.last_error && (
                <p className="text-rose-600 text-[11px] mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Aviso: {status.last_error}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncNow}
                disabled={syncing}
                className="text-xs gap-1.5"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-xs text-destructive hover:bg-destructive/10 gap-1.5 ml-auto"
              >
                <Unlink className="h-3.5 w-3.5" />
                Desconectar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground space-y-2">
              <div className="flex items-start gap-2 text-foreground font-medium">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Integração pronta para ativação</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Toda a arquitetura de sincronização bidirecional, suporte a eventos recorrentes,
                fuso horário <code>America/Sao_Paulo</code> e prevenção de duplicatas via{' '}
                <code>google_event_id</code> está implementada no backend.
              </p>
              {!status?.configured && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-1">
                  <p className="font-semibold flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    Aguardando chaves OAuth no Google Cloud
                  </p>
                  <p>
                    Para conectar, registre os segredos <code>GOOGLE_CLIENT_ID</code> e{' '}
                    <code>GOOGLE_CLIENT_SECRET</code> no painel.
                  </p>
                  <p className="font-mono text-[10px] break-all select-all bg-white p-1 rounded border border-amber-300">
                    Redirect URI:{' '}
                    {status?.redirect_uri ||
                      'https://gestao-financeira-e-marketplaces-d7ede.shrd00.internal.goskip.dev/backend/v1/google/callback'}
                  </p>
                </div>
              )}
            </div>

            <Button
              size="sm"
              onClick={handleConnect}
              className="w-full bg-primary hover:bg-primary/90 text-white text-xs gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Conectar com Google Calendar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
