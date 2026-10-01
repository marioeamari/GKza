import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary capturou erro não tratado:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleGoHome = () => {
    window.location.href = '/'
  }

  public override render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || ''
      const isRateLimited =
        errMsg.includes('429') ||
        errMsg.toLowerCase().includes('too many requests') ||
        (this.state.error as any)?.status === 429

      return (
        <div className="grid min-h-screen place-items-center bg-background p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 sm:p-8 shadow-sm text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
              {isRateLimited ? 'Muitas requisições simultâneas' : 'Algo inesperado aconteceu'}
            </h1>

            <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {isRateLimited
                ? 'Muitas requisições, tentando novamente... O servidor limitou as consultas temporariamente para manter a estabilidade. Aguarde alguns instantes e tente novamente.'
                : 'Ocorreu uma falha ao renderizar esta tela. Você pode recarregar a página para restaurar o estado ou voltar à tela inicial do ERP GKza.'}
            </p>

            {this.state.error?.message && !isRateLimited && (
              <div className="mt-4 rounded-lg bg-secondary/50 p-3 text-left font-mono text-[11px] text-muted-foreground break-words max-h-24 overflow-y-auto">
                {this.state.error.message}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={this.handleReload}
                className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Recarregar página
              </Button>
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="border-border font-semibold"
              >
                <Home className="mr-2 h-4 w-4" />
                Voltar ao Início
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
