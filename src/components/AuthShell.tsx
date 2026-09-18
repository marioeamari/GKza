import type { ReactNode } from 'react'
import { ArrowLeft, BarChart3, ShieldCheck, Store } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '@/components/Brand'

export function AuthShell({ children, backTo }: { children: ReactNode; backTo?: string }) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(420px,0.9fr)_1.1fr]">
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-16 lg:py-10">
        <div className="flex items-center justify-between">
          <Brand />
          {backTo && (
            <Link
              to={backTo}
              className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          )}
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 items-center py-10">{children}</div>
        <p className="text-center text-xs text-muted-foreground">
          Gestão segura para o seu negócio.
        </p>
      </section>
      <aside className="relative hidden overflow-hidden bg-[#241B15] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="auth-grid absolute inset-0 opacity-30" />
        <div className="relative z-10">
          <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">
            Controle financeiro sem ruído
          </span>
          <h1 className="mt-8 max-w-xl text-5xl font-extrabold leading-[1.08] tracking-tight">
            Cada venda, conta e repasse no lugar certo.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-white/65">
            Uma visão clara do caixa para você tomar decisões com confiança e conciliar todos os
            seus marketplaces.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-3">
          {[
            [BarChart3, 'Fluxo de caixa'],
            [Store, 'Marketplaces'],
            [ShieldCheck, 'Acesso seguro'],
          ].map(([Icon, label]) => (
            <div
              key={label as string}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
            >
              <Icon className="mb-5 h-6 w-6 text-[#F07751]" />
              <span className="text-sm font-bold">{label as string}</span>
            </div>
          ))}
        </div>
      </aside>
    </main>
  )
}
