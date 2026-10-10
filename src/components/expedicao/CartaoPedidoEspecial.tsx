import { useState } from 'react'
import {
  MessageSquare,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  Bot,
  UserCheck,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { buildShopeeChatUrl, buildShopeeOrderUrl } from '@/lib/expedicaoShopeeParser'
import type { KitPedido } from '@/types/separacaoKits'

interface CartaoPedidoEspecialProps {
  pedido: KitPedido
  onAtualizarPedidoEspecial?: (novoTexto: string) => Promise<void>
}

export function CartaoPedidoEspecial({
  pedido,
  onAtualizarPedidoEspecial,
}: CartaoPedidoEspecialProps) {
  const [copiado, setCopiado] = useState(false)
  const [copiadoId, setCopiadoId] = useState(false)

  const orderId = pedido.shopee_order_id || pedido.numero_pedido || ''
  const chatUrl = buildShopeeChatUrl(orderId)
  const orderUrl = buildShopeeOrderUrl(orderId)

  const handleCopiarOrderId = async () => {
    if (!orderId) return
    try {
      await navigator.clipboard.writeText(orderId)
      setCopiadoId(true)
      toast({
        title: 'ID do Pedido copiado!',
        description: `O ID "${orderId}" foi copiado para a área de transferência.`,
      })
      setTimeout(() => setCopiadoId(false), 3000)
    } catch (err) {
      console.warn('Erro ao copiar ID:', err)
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível acessar a área de transferência.',
        variant: 'destructive',
      })
    }
  }

  const handleAbrirChatShopee = async () => {
    // Regra técnica solicitada:
    // 1. Copia o ID do pedido para o clipboard (para colar na busca do Webchat caso o deep link não filtre)
    // 2. Abre a URL do Webchat (com fallback garantido)
    let copiouSucesso = false
    if (orderId) {
      try {
        await navigator.clipboard.writeText(orderId)
        copiouSucesso = true
        setCopiado(true)
        setTimeout(() => setCopiado(false), 4000)
      } catch (e) {
        console.warn('Clipboard writeText falhou:', e)
      }
    }

    toast({
      title: copiouSucesso ? 'ID copiado! Abrindo Webchat Shopee...' : 'Abrindo Webchat Shopee...',
      description: copiouSucesso
        ? `O ID ${orderId} foi copiado para a área de transferência. Cole no campo de busca do Webchat para localizar a conversa.`
        : 'Cole o ID do pedido na busca do Webchat caso a busca não carregue automaticamente.',
    })

    window.open(chatUrl, '_blank', 'noopener,noreferrer')
  }

  const handleAbrirSellerCentre = () => {
    window.open(orderUrl, '_blank', 'noopener,noreferrer')
  }

  const temPedidoEspecial = Boolean(
    pedido.pedido_especial && pedido.pedido_especial.trim().length > 0,
  )

  return (
    <Card className="overflow-hidden border-2 border-primary/40 bg-gradient-to-r from-orange-50/70 via-amber-50/50 to-orange-50/70 shadow-md">
      <div className="bg-primary px-4 py-2.5 text-white flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-wider">
            Pedido Especial do Cliente (Shopee / Chat)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {pedido.origem_pedido_especial === 'agente_ia' && (
            <Badge variant="secondary" className="bg-white/20 text-white text-[10px] font-bold">
              <Bot className="mr-1 h-3 w-3" /> Agente Nativo
            </Badge>
          )}
          {temPedidoEspecial ? (
            <Badge className="bg-white text-primary text-[10px] font-black uppercase shadow-sm">
              ★ Variação Escolhida
            </Badge>
          ) : (
            <Badge variant="outline" className="border-white/50 text-white text-[10px]">
              Sem pedido especial registrado
            </Badge>
          )}
        </div>
      </div>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* CONTEÚDO DO PEDIDO ESPECIAL EM DESTAQUE */}
        {temPedidoEspecial ? (
          <div className="rounded-xl border-2 border-amber-300 bg-white p-3.5 shadow-sm">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="text-[11px] font-black uppercase tracking-wider text-amber-900">
                  Instrução Especial para Bipagem / Separação:
                </div>
                <p className="text-sm font-black text-foreground whitespace-pre-wrap leading-relaxed">
                  {pedido.pedido_especial}
                </p>
                {pedido.variacao_anuncio && (
                  <p className="text-xs text-muted-foreground pt-1 border-t border-border/40 mt-1">
                    Variação do anúncio original:{' '}
                    <span className="font-semibold text-foreground">{pedido.variacao_anuncio}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-white/60 p-3 text-xs text-muted-foreground">
            <p>
              Nenhum pedido especial registrado pelo cliente. O operador segue a composição padrão
              do kit. Caso o cliente mande mensagem no chat pedindo modelos específicos, use o
              atalho abaixo para abrir a conversa.
            </p>
          </div>
        )}

        {/* BARRA DE AÇÕES EXTERNAS / ATALHOS SHOPEE */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-1 border-t border-primary/10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">ID Shopee:</span>
            <code className="rounded bg-muted px-2 py-0.5 text-xs font-black text-foreground">
              {orderId || 'Sem ID'}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopiarOrderId}
              disabled={!orderId}
              className="h-7 px-2 text-xs font-bold hover:bg-muted"
              title="Copiar ID para a área de transferência"
            >
              {copiadoId ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copiar ID
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* BOTÃO PRINCIPAL: ABRIR CHAT NA SHOPEE COM FALLBACK DE CLIPBOARD */}
            <Button
              type="button"
              size="sm"
              onClick={handleAbrirChatShopee}
              className="h-9 px-3.5 bg-primary text-white font-black hover:bg-primary/90 shadow-sm transition-all"
            >
              <MessageSquare className="mr-1.5 h-4 w-4" />
              {copiado ? 'ID Copiado! Abrindo Chat...' : 'Abrir chat na Shopee'}
            </Button>

            {/* BOTÃO SECUNDÁRIO: ABRIR PEDIDO NO SELLER CENTRE */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAbrirSellerCentre}
              className="h-9 px-3 text-xs font-bold border-border/80 bg-white hover:bg-muted/60 text-foreground"
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              Abrir pedido no Seller Centre
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
