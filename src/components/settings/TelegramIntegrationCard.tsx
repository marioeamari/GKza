import { useEffect, useState } from 'react'
import { Bot, CheckCircle2, AlertCircle, RefreshCw, Send, ExternalLink, Zap } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

interface TelegramStatusData {
  configured: boolean
  has_secret: boolean
  expected_webhook_url: string
  webhook_info?: {
    ok?: boolean
    result?: {
      url?: string
      has_custom_certificate?: boolean
      pending_update_count?: number
      last_error_date?: number
      last_error_message?: string
    }
  }
  bot_info?: {
    ok?: boolean
    result?: {
      id?: number
      is_bot?: boolean
      first_name?: string
      username?: string
    }
  }
}

export function TelegramIntegrationCard() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [settingUp, setSettingUp] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState('Supermercado Tauste, R$ 142,50, NuBank')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [status, setStatus] = useState<TelegramStatusData | null>(null)

  const loadStatus = async () => {
    try {
      setLoading(true)
      const res = await pb.send<TelegramStatusData>('/backend/v1/telegram/status', {
        method: 'GET',
      })
      setStatus(res)
    } catch (err: unknown) {
      console.error('Falha ao carregar status do Telegram:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const handleSyncWebhook = async () => {
    try {
      setSettingUp(true)
      const res = await pb.send<{
        success: boolean
        telegram_response?: { ok?: boolean; description?: string }
        bot_info?: { result?: { username?: string } }
      }>('/backend/v1/telegram/setup-webhook', {
        method: 'POST',
      })

      if (res.telegram_response?.ok) {
        toast({
          title: 'Webhook sincronizado!',
          description: 'O bot do Telegram foi conectado ao Skip Cloud com sucesso.',
        })
      } else {
        toast({
          title: 'Aviso do Telegram',
          description: res.telegram_response?.description || 'Webhook atualizado.',
          variant: 'default',
        })
      }
      await loadStatus()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao sincronizar webhook'
      toast({
        title: 'Erro ao configurar webhook',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSettingUp(false)
    }
  }

  const handleSimulateWebhook = async () => {
    if (!testMessage.trim()) return
    try {
      setTesting(true)
      setTestResult(null)
      const payload = {
        update_id: Date.now(),
        message: {
          message_id: Math.floor(Math.random() * 10000),
          from: {
            id: 99999999,
            is_bot: false,
            first_name: 'Simulação',
          },
          chat: {
            id: 99999999,
            type: 'private',
          },
          date: Math.floor(Date.now() / 1000),
          text: testMessage,
        },
      }

      await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/telegram/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'gkza_telegram_sec_993418',
        },
        body: JSON.stringify(payload),
      })

      setTestResult(
        'Mensagem enviada com sucesso para o agente! O agente nativo Skip Cloud processou os dados e realizou a verificação/lançamento.',
      )
      toast({
        title: 'Simulação enviada!',
        description: 'Verifique na tela de Lançamentos o registro criado pelo Agente.',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro na simulação'
      setTestResult('Erro na simulação: ' + msg)
    } finally {
      setTesting(false)
    }
  }

  const botUsername = status?.bot_info?.result?.username
  const webhookActive = status?.webhook_info?.result?.url === status?.expected_webhook_url

  return (
    <Card className="border-primary/20 bg-card shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Agente Telegram GKza
                {status?.configured ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Ativo
                  </Badge>
                ) : (
                  <Badge variant="secondary">Pendente</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Automação financeira com IA: envie comprovantes ou textos no Telegram para lançar
                automaticamente.
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadStatus}
            disabled={loading}
            title="Atualizar status"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">Bot do Telegram</span>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                {botUsername ? `@${botUsername}` : 'Bot configurado no backend'}
              </span>
              {botUsername && (
                <a
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Abrir <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">Status do Webhook</span>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                {webhookActive ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Conectado ao Skip Cloud
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-500" /> Aguardando registro
                  </>
                )}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncWebhook}
                disabled={settingUp}
                className="h-7 text-xs font-medium"
              >
                {settingUp ? (
                  <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Zap className="mr-1 h-3 w-3 text-primary" />
                )}
                Sincronizar
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs space-y-2 text-foreground/80 leading-relaxed">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            💡 Como funciona a automação via Telegram:
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li>
              <strong>Fotos de comprovantes (OCR aprimorado):</strong> envie fotos de alta resolução
              de Pix, boletos ou recibos. Se a leitura da foto estiver ilegível, o bot avisa e
              solicita os dados em texto.
            </li>
            <li>
              <strong>Opções interativas (botões inline):</strong> quando faltar Categoria, Conta,
              Contexto ou Tipo, o bot apresenta botões clicáveis (tipo radio button) com as opções
              do sistema e paginação, evitando digitação manual de listas.
            </li>
            <li>
              <strong>Mensagens de texto:</strong> ex.:{' '}
              <em>&quot;Paguei R$ 184,32 de energia CPFL pelo NuBank&quot;</em> ou{' '}
              <em>&quot;Recebi R$ 1.500 de serviço&quot;</em>.
            </li>
            <li>
              <strong>Anti-duplicidade e confirmação:</strong> antes de efetivar o lançamento no
              caixa, o bot apresenta o resumo completo com botões de confirmação e alerta sobre
              duplicidade no mesmo dia.
            </li>
            <li>
              <strong>Troca de contexto:</strong> use o comando <code>/contexto &lt;nome&gt;</code>{' '}
              no chat (ex: <code>/contexto Casa</code> ou{' '}
              <code>/contexto Padaria Estrela Dourada</code>) ou apenas <code>/contexto</code> para
              escolher pelos botões.
            </li>
          </ul>
        </div>

        {/* Painel de teste e simulação de payload */}
        <div className="rounded-xl border border-border p-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              🧪 Testar Agente Financeiro (Simulação de Mensagem)
            </span>
            <Badge variant="secondary" className="text-[10px]">
              Agente Nativo Skip Cloud
            </Badge>
          </div>
          <div className="flex gap-2">
            <Input
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Ex: CPFL Energia, R$ 184,32, NuBank"
              className="text-xs"
            />
            <Button
              size="sm"
              onClick={handleSimulateWebhook}
              disabled={testing || !testMessage.trim()}
              className="shrink-0"
            >
              {testing ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Disparar Teste
            </Button>
          </div>
          {testResult && (
            <div className="rounded-lg bg-muted/60 p-2.5 text-xs text-foreground/90 border border-border/60">
              {testResult}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
