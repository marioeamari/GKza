import { useContext, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ExternalLink, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ETAPAS_TRIAGEM,
  nomeEtapaTriagem,
  type TriagemAvaliacao,
  type TriagemEtapaChave,
  type TriagemStatusEtapa,
} from '@/lib/triagemModelo'
import { destinoRetomar } from '@/components/triagem/TriagemCards'
import type { GetFileUrlFn } from '@/components/triagem/TriagemCards'
import { TriagemIconesCanais } from '@/components/triagem/TriagemIconesCanais'
import { TriagemIconesContext } from '@/components/triagem/triagemIconesContext'

const CORES_STATUS: Record<TriagemStatusEtapa, { dot: string; texto: string; fundo: string }> = {
  verde: { dot: 'bg-emerald-500', texto: 'text-emerald-700', fundo: 'bg-emerald-50' },
  amarelo: { dot: 'bg-amber-500', texto: 'text-amber-700', fundo: 'bg-amber-50' },
  vermelho: { dot: 'bg-red-500', texto: 'text-red-700', fundo: 'bg-red-50' },
  cinza: { dot: 'bg-gray-300', texto: 'text-gray-500', fundo: 'bg-gray-100' },
}

const ROTULO_STATUS: Record<TriagemStatusEtapa, string> = {
  verde: 'Concluída',
  amarelo: 'Parcial / desatualizada',
  vermelho: 'Nunca feita',
  cinza: 'Não se aplica (ainda sem uso)',
}

function formatarDataHora(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface TriagemDetalheDialogProps {
  avaliacao: TriagemAvaliacao | null
  onClose: () => void
  /** Url da foto do produto (thumb); ausente = placeholder. */
  getUrlImagem?: GetFileUrlFn
}

/**
 * Painel de detalhe de um produto na Triagem: linha do tempo das 7 etapas,
 * cada uma com o dado real que a qualificou, e botão "Retomar daqui" levando
 * à tela correta da etapa pendente.
 */
export function TriagemDetalheDialog({
  avaliacao,
  onClose,
  getUrlImagem,
}: TriagemDetalheDialogProps) {
  const navigate = useNavigate()
  const botaoRetomarRef = useRef<HTMLButtonElement>(null)
  const iconesPorProduto = useContext(TriagemIconesContext)

  // Foco no botão "Retomar daqui" quando o painel abre (movimento de foco p/ overlay)
  useEffect(() => {
    if (avaliacao) {
      const t = window.setTimeout(() => botaoRetomarRef.current?.focus(), 50)
      return () => window.clearTimeout(t)
    }
  }, [avaliacao])

  const urlRetomar = avaliacao ? destinoRetomar(avaliacao) : undefined
  const chavePendente = avaliacao ? ETAPAS_TRIAGEM[avaliacao.parouNaEtapaNumero - 1] : undefined
  const urlImagem = avaliacao && getUrlImagem ? getUrlImagem(avaliacao.produto) : undefined
  const icones = avaliacao ? (iconesPorProduto.get(avaliacao.produto.id) ?? []) : []

  return (
    <Dialog open={!!avaliacao} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        {avaliacao && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-left">
                {urlImagem ? (
                  <img
                    src={urlImagem}
                    alt={`Imagem do produto ${avaliacao.produto.nome}`}
                    width={48}
                    height={48}
                    className="h-12 w-12 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-orange-100 text-base font-bold text-[#DF5830]"
                  >
                    {(avaliacao.produto.sku || avaliacao.produto.nome).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate">{avaliacao.produto.nome}</span>
                  <span className="block text-sm font-normal text-muted-foreground">
                    {avaliacao.produto.sku || 'sem SKU'}
                  </span>
                  {icones.length > 0 && (
                    <span className="mt-1 block font-normal">
                      <TriagemIconesCanais icones={icones} tamanho="card" />
                    </span>
                  )}
                </span>
              </DialogTitle>
              <DialogDescription>{avaliacao.selo}</DialogDescription>
            </DialogHeader>

            <ol className="mt-2 space-y-2" aria-label="Linha do tempo das 7 etapas">
              {ETAPAS_TRIAGEM.map((chave, i) => {
                // Defesa: etapa ausente é tratada como vermelha, nunca quebra a renderização
                const info = avaliacao.etapas[chave] ?? {
                  chave,
                  status: 'vermelho' as const,
                  rotulo: 'Etapa não avaliada',
                }
                const cores = CORES_STATUS[info.status]
                const pendente = chave === chavePendente
                const dadosRotulo = info.dados?.rotulo
                return (
                  <li
                    key={chave}
                    className={`rounded-lg border px-3 py-2 ${pendente ? 'border-[#DF5830]/40' : 'border-transparent'} ${cores.fundo}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${cores.dot}`}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold">
                        {i + 1}. {nomeEtapaTriagem(chave)}
                      </span>
                      {info.status === 'verde' && (
                        <CheckCircle2
                          className="h-4 w-4 text-emerald-600"
                          aria-label="Etapa concluída"
                        />
                      )}
                      <span className={`ml-auto text-[11px] font-medium ${cores.texto}`}>
                        {ROTULO_STATUS[info.status]}
                      </span>
                    </div>
                    <p className="mt-1 pl-5 text-xs text-muted-foreground">
                      {info.rotulo}
                      {info.quando ? ` · ${formatarDataHora(info.quando)}` : ''}
                    </p>
                    {dadosRotulo && (
                      <p className="mt-0.5 pl-5 text-xs italic text-muted-foreground/80">
                        {dadosRotulo}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>

            {avaliacao.detalheKitComponentes && avaliacao.detalheKitComponentes.length > 0 && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <p className="text-xs font-semibold text-gray-600">
                  Componentes do kit (cada um tem o próprio trilho)
                </p>
                <ul className="mt-1 space-y-1">
                  {avaliacao.detalheKitComponentes.map((c) => (
                    <li key={c.produto_id || c.nome} className="text-xs text-muted-foreground">
                      {c.qtd}× {c.nome}
                      {c.temUsoComercial ? ' · já tem uso comercial' : ' · sem uso comercial ainda'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {urlRetomar && chavePendente && (
              <Button
                ref={botaoRetomarRef}
                className="mt-4 w-full bg-[#DF5830] font-semibold text-white hover:bg-[#c4491f]"
                onClick={() => {
                  onClose()
                  navigate(urlRetomar)
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Retomar daqui: {nomeEtapaTriagem(chavePendente)} (etapa{' '}
                {avaliacao.parouNaEtapaNumero})
              </Button>
            )}
            {!urlRetomar && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Produto 100% integrado — nada a retomar. 🎉
              </p>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar painel de detalhe"
              className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DF5830]"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
