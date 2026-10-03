import { useState } from 'react'
import { Check, Copy, ExternalLink, QrCode, Smartphone, Sparkles, Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'

interface DespesaRapidaModalProps {
  children?: React.ReactNode
  triggerVariant?: 'button' | 'sidebar'
  collapsed?: boolean
}

export function DespesaRapidaModal({
  children,
  triggerVariant = 'button',
  collapsed = false,
}: DespesaRapidaModalProps) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  const mobileUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/despesa-rapida`
      : 'https://seuerp.com/despesa-rapida'

  // Gera o QR Code utilizando SVG da API pública do Google Chart ou QR Server com segurança
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
    mobileUrl,
  )}&color=DF5830&bgcolor=FFFFFF&margin=2`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mobileUrl)
      setCopied(true)
      toast({
        title: 'Link copiado!',
        description: 'Abra no navegador do seu smartphone para instalar.',
      })
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Não foi possível copiar',
        description: 'Copie a URL manualmente no campo abaixo.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ? (
          children
        ) : triggerVariant === 'sidebar' ? (
          collapsed ? (
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#DF5830] to-[#b83f1d] text-white shadow-sm hover:opacity-95 transition"
              title="Sub-app Móvel: Despesa Rápida (PWA)"
            >
              <Zap className="h-4 w-4 fill-white" />
            </button>
          ) : (
            <button
              type="button"
              className="group flex w-full items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 border border-orange-200/70 p-2.5 text-left transition hover:border-[#DF5830]/50 hover:shadow-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#DF5830] text-white shadow-xs">
                  <Zap className="h-4 w-4 fill-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-foreground group-hover:text-[#DF5830] transition leading-tight truncate">
                    Despesa Rápida
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight truncate">
                    Instalar PWA no Celular
                  </p>
                </div>
              </div>
              <QrCode className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-[#DF5830] transition" />
            </button>
          )
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-9 border-[#DF5830]/40 text-[#DF5830] hover:bg-[#DF5830]/10 hover:text-[#DF5830] font-bold text-xs"
          >
            <Smartphone className="mr-1.5 h-3.5 w-3.5" />
            Abrir no Celular
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader className="text-center sm:text-left">
          <div className="mx-auto sm:mx-0 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#DF5830]/10 text-[#DF5830] mb-2">
            <Smartphone className="h-6 w-6" />
          </div>
          <DialogTitle className="text-xl font-black text-foreground">
            Sub-app Despesa Rápida
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Aplicativo móvel leve e focado para registrar despesas na rua em segundos com uma mão.
            As compras vão direto para a esteira de Triagem do ERP.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col items-center justify-center space-y-4">
          {/* Card com QR Code */}
          <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-sm flex flex-col items-center">
            <img
              src={qrCodeUrl}
              alt="QR Code para Despesa Rápida"
              className="h-48 w-48 rounded-lg object-contain"
              loading="lazy"
            />
            <p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">
              Aponte a câmera do celular para abrir direto
            </p>
          </div>

          {/* Campo de link direto */}
          <div className="w-full space-y-2">
            <label className="text-xs font-bold text-foreground">Link direto do sub-app:</label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={mobileUrl}
                className="h-9 font-mono text-xs bg-secondary/30 selection:bg-primary/20"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-9 px-3 shrink-0 font-semibold text-xs"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copiar
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Como instalar na tela inicial */}
          <div className="w-full rounded-xl bg-orange-500/5 border border-orange-500/20 p-3.5 text-xs text-muted-foreground space-y-1.5">
            <p className="font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#DF5830]" />
              Como instalar na tela de início:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-[11px] leading-tight text-foreground/80">
              <li>
                <strong>No iPhone (Safari):</strong> toque no ícone de Compartilhar e selecione{' '}
                <em>"Adicionar à Tela de Início"</em>.
              </li>
              <li>
                <strong>No Android (Chrome):</strong> toque nos três pontinhos e selecione{' '}
                <em>"Instalar aplicativo"</em> ou <em>"Adicionar à tela inicial"</em>.
              </li>
            </ul>
          </div>

          {/* Atalho para testar no computador */}
          <div className="w-full pt-1 flex justify-end">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-xs text-[#DF5830] hover:text-[#b83f1d] hover:bg-orange-500/10 font-bold"
            >
              <a href="/despesa-rapida" target="_blank" rel="noopener noreferrer">
                Testar visualização no navegador
                <ExternalLink className="ml-1.5 h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
