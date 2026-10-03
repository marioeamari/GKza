import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MonitorSmartphone, Smartphone, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

const DISMISS_KEY = 'gkza_dismiss_mobile_erp_banner'

export function MobileDesktopNotice() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === 'true'
    } catch {
      return false
    }
  })

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      /* ignore */
    }
  }

  return (
    <aside
      aria-label="Aviso de compatibilidade móvel"
      className="lg:hidden border-b border-amber-200/80 bg-gradient-to-r from-amber-50 via-orange-50/70 to-amber-50 px-3.5 py-2.5 text-xs text-amber-950 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
            <MonitorSmartphone className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold leading-tight truncate">
              O ERP completo é melhor no computador.
            </p>
            <p className="text-[11px] text-amber-800/90 leading-tight">
              Para registrar gastos ou lembretes no celular, use o sub-app móvel.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            asChild
            size="sm"
            className="h-7 px-2.5 text-[11px] font-bold bg-[#DF5830] hover:bg-[#c94924] text-white shadow-xs rounded-md"
          >
            <Link to="/m">
              <Zap className="mr-1 h-3 w-3 fill-current" />
              App Móvel
            </Link>
          </Button>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Fechar aviso"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-800/70 hover:bg-amber-500/15 hover:text-amber-950 transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
