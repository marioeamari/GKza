import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Landmark,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { formatDate } from '@/lib/format'
import { can } from '@/lib/permissions'
import { pluggyService, type PluggyStatusResponse } from '@/services/pluggy'
import type { PluggyItemRecord } from '@/types/domain'

declare global {
  interface Window {
    PluggyConnect?: new (options: {
      connectToken: string
      onSuccess?: (itemData: { item: { id: string } }) => void
      onError?: (error: unknown) => void
      onClose?: () => void
    }) => {
      init: () => void
    }
  }
}

export function OpenFinanceCard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const canEdit = can(user?.role, 'writeFinance')

  const [status, setStatus] = useState<PluggyStatusResponse | null>(null)
  const [items, setItems] = useState<PluggyItemRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [itemParaDesconectar, setItemParaDesconectar] = useState<PluggyItemRecord | null>(null)
  const [desconectando, setDesconectando] = useState(false)

  // Carrega status da API Pluggy e itens conectados
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [statusRes, itemsRes] = await Promise.all([
        pluggyService.getStatus().catch(() => null),
        pluggyService.listConnectedItems().catch(() => []),
      ])
      if (statusRes) setStatus(statusRes)
      setItems(itemsRes)
    } catch (err) {
      console.error('Erro ao carregar dados Open Finance:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Injetar script do Pluggy Connect Widget sob demanda
  const loadPluggyScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.PluggyConnect) {
        resolve()
        return
      }
      const existingScript = document.getElementById('pluggy-widget-script')
      if (existingScript) {
        existingScript.onload = () => resolve()
        return
      }
      const script = document.createElement('script')
      script.id = 'pluggy-widget-script'
      script.src = 'https://cdn.pluggy.ai/pluggy-connect/v1/pluggy-connect.js'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Não foi possível carregar o widget do Pluggy'))
      document.body.appendChild(script)
    })
  }

  // Abrir o widget do Pluggy
  const handleConectarBanco = async (existingItemId?: string) => {
    if (!canEdit) return
    try {
      setConnecting(true)
      await loadPluggyScript()

      // Gera connect_token seguro no backend via skip cloud
      const tokenRes = await pluggyService.getConnectToken(existingItemId)
      if (!tokenRes.accessToken) {
        throw new Error('Não foi possível obter o token de conexão do Open Finance.')
      }

      if (!window.PluggyConnect) {
        throw new Error('Biblioteca Pluggy Connect não carregada.')
      }

      const pluggyConnect = new window.PluggyConnect({
        connectToken: tokenRes.accessToken,
        onSuccess: async (data) => {
          toast({
            title: 'Banco conectado com sucesso!',
            description: 'Iniciando sincronização inicial das transações para Triagem...',
          })
          try {
            // Sincroniza e puxa as transações já enviando para a triagem pendente
            const syncRes = await pluggyService.syncItem(data?.item?.id)
            toast({
              title: 'Sincronização concluída',
              description: `${syncRes.imported_pendentes} transações enviadas para /pendentes para sua triagem.`,
            })
          } catch (syncErr) {
            console.error('Erro na sincronização inicial:', syncErr)
          }
          await loadData()
        },
        onError: (err) => {
          console.error('Erro no widget Pluggy:', err)
          toast({
            variant: 'destructive',
            title: 'Erro na conexão',
            description: 'Houve uma falha durante o processo de conexão do banco.',
          })
        },
        onClose: () => {
          // Widget fechado
        },
      })

      pluggyConnect.init()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Falha ao iniciar conexão',
        description: apiMessage(err),
      })
    } finally {
      setConnecting(false)
    }
  }

  // Sincronizar item manualmente
  const handleSincronizarItem = async (itemId: string) => {
    try {
      setSyncingId(itemId)
      const res = await pluggyService.syncItem(itemId)
      toast({
        title: 'Sincronização concluída!',
        description: `${res.imported_pendentes} transações novas importadas para triagem (${res.skipped_duplicates} duplicadas ignoradas).`,
      })
      await loadData()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro na sincronização',
        description: apiMessage(err),
      })
    } finally {
      setSyncingId(null)
    }
  }

  // Desconectar item
  const handleConfirmarDesconexao = async () => {
    if (!itemParaDesconectar) return
    try {
      setDesconectando(true)
      await pluggyService.disconnectItem(itemParaDesconectar.item_id)
      setItems((prev) => prev.filter((i) => i.id !== itemParaDesconectar.id))
      toast({
        title: 'Banco desconectado',
        description: `A conexão com ${itemParaDesconectar.connector_name} foi removida.`,
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao desconectar banco',
        description: apiMessage(err),
      })
    } finally {
      setDesconectando(false)
      setItemParaDesconectar(null)
    }
  }

  return (
    <>
      <Card className="border-primary/20 bg-card shadow-soft">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Open Finance Brasil (Pluggy)
                  {status?.configured ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 text-xs font-bold"
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Integrado
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Credenciais Pendentes
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Conexão bancária automática via Open Finance. Transações entram pelo fluxo de
                  triagem pendente para sua aprovação.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={loadData}
                disabled={loading}
                title="Atualizar conexões"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>

              {canEdit && (
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-white font-extrabold text-xs shadow-sm h-9"
                  onClick={() => handleConectarBanco()}
                  disabled={connecting || !status?.configured}
                >
                  {connecting ? (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Conectar Banco
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Alerta de funcionamento da triagem */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground/80 leading-relaxed flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-foreground">
                Regra de Ouro GKza: Nada entra direto no caixa
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Todas as transações e despesas de cartão importadas pelo Open Finance chegam como{' '}
                <strong>Registros Pendentes</strong> na tela de{' '}
                <a href="/pendentes" className="text-primary font-bold hover:underline">
                  Triagem (/pendentes)
                </a>
                . Você sempre define se é Lançamento, Despesa Recorrente ou Descarte.
              </p>
            </div>
          </div>

          {/* Lista de Bancos Conectados */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Bancos Conectados ({items.length})
            </span>

            {loading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Carregando bancos conectados...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <Building2 className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
                <p className="text-xs font-semibold text-foreground">
                  Nenhuma conta bancária conectada ainda
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                  Conecte suas contas (Itaú, Bradesco, Santander, Nubank, Inter, Banco do Brasil,
                  etc.) para puxar extratos e faturas automaticamente.
                </p>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 text-xs font-bold"
                    onClick={() => handleConectarBanco()}
                    disabled={connecting || !status?.configured}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5 text-primary" />
                    Conectar primeiro banco
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-white p-3.5 shadow-sm hover:border-primary/40 transition"
                  >
                    <div className="flex items-center gap-3">
                      {item.connector_image_url ? (
                        <img
                          src={item.connector_image_url}
                          alt={item.connector_name}
                          className="h-10 w-10 rounded-lg object-contain border border-border p-0.5 bg-white"
                        />
                      ) : (
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary font-bold">
                          <Landmark className="h-5 w-5" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-extrabold text-foreground">
                            {item.connector_name}
                          </h4>
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-secondary/40 font-semibold"
                          >
                            {item.status || 'CONECTADO'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Última sincronização:{' '}
                          {item.last_sync_at
                            ? formatDate(item.last_sync_at, {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Pendente'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-semibold"
                        onClick={() => handleSincronizarItem(item.item_id)}
                        disabled={syncingId === item.item_id}
                        title="Buscar transações agora"
                      >
                        <RefreshCw
                          className={`mr-1 h-3 w-3 ${syncingId === item.item_id ? 'animate-spin' : ''}`}
                        />
                        Sincronizar
                      </Button>

                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive px-2"
                          onClick={() => setItemParaDesconectar(item)}
                          title="Desconectar banco"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Informações de Webhook para o usuário */}
          <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-xs space-y-1.5">
            <span className="font-bold text-foreground flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              URL de Webhook para eventos em tempo real:
            </span>
            <p className="text-muted-foreground text-[11px]">
              No painel de desenvolvedor do Pluggy, cadastre a URL abaixo para receber
              automaticamente eventos de novas transações:
            </p>
            <div className="rounded bg-white p-2 font-mono text-[11px] text-foreground select-all border border-border/80 break-all">
              {status?.expected_webhook_url ||
                'https://gestao-financeira-e-marketplaces-d7ede.shrd00.internal.goskip.dev/backend/v1/pluggy/webhook'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diálogo de confirmação de desconexão */}
      <AlertDialog
        open={!!itemParaDesconectar}
        onOpenChange={(open) => !open && setItemParaDesconectar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar banco?</AlertDialogTitle>
            <AlertDialogDescription>
              A conexão com o banco “{itemParaDesconectar?.connector_name}” será cancelada. Novas
              transações não serão mais importadas para a triagem. Os registros já importados não
              serão apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desconectando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarDesconexao}
              disabled={desconectando}
              className="bg-destructive hover:bg-destructive/90 text-white font-bold"
            >
              {desconectando && <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Sim, desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
