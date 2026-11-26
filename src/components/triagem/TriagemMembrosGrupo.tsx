import { cn } from '@/lib/utils'
import { rotuloEtapaCompacto, type TriagemAvaliacao } from '@/lib/triagemModelo'
import type { TriagemGrupo } from '@/lib/triagemGrupos'
import type { GetFileUrlFn } from './TriagemCards'

/**
 * Listagem compacta dos produtos membros de um grupo da Triagem (pedido do
 * usuário: "produtos agrupados, mas não está mostrando a imagem, nome, sku e
 * etapa dos produtos agrupados").
 *
 * Regra gravada (protocolo acordado):
 * - o card da FRENTE continua completo (TriagemCardProduto); a lista abaixo é
 *   ADICIONAL e mostra TODOS os membros, inclusive o da frente (marcado como
 *   "na frente");
 * - cada linha mostra imagem (via getUrlImagem, com placeholder de inicial
 *   quando não há foto), nome, SKU e a etapa compacta (rotuloEtapaCompacto:
 *   "✅ 100% integrado" ou "⚠️/🔴 Etapa N — Nome"), com o mesmo título
 *   (tooltip) do selo dos cards soltos;
 * - clicar num membro o traz para a FRENTE do grupo (mesma ação do clique no
 *   card da pilha), com a supressão de clique pós-arrasto; o membro que JÁ
 *   está na frente fica desabilitado (nada a fazer);
 * - navegação ‹ › e os botões de desagrupar não mudam.
 */

const COR_SEVERIDADE: Record<'verde' | 'amarelo' | 'vermelho', string> = {
  verde: 'text-emerald-700',
  amarelo: 'text-amber-800',
  vermelho: 'text-red-700',
}

function corDaEtapa(av: TriagemAvaliacao): 'verde' | 'amarelo' | 'vermelho' {
  if (av.integrado) return 'verde'
  return av.severidadePendencia === 'amarelo' ? 'amarelo' : 'vermelho'
}

export interface TriagemMembrosGrupoProps {
  grupo: TriagemGrupo
  avaliacaoPorId: Map<string, TriagemAvaliacao>
  getUrlImagem?: GetFileUrlFn
  onTrazerParaFrente: (grupoId: string, produtoId: string) => void
  cliqueSuprimido: () => boolean
}

export function TriagemMembrosGrupo({
  grupo,
  avaliacaoPorId,
  getUrlImagem,
  onTrazerParaFrente,
  cliqueSuprimido,
}: TriagemMembrosGrupoProps) {
  return (
    <ul
      className="mt-1 max-h-36 space-y-0.5 overflow-y-auto rounded-md bg-muted/40 p-1"
      aria-label={`Produtos do grupo (${grupo.membros.length})`}
    >
      {grupo.membros.map((id, i) => {
        const av = avaliacaoPorId.get(id)
        if (!av) return null
        const p = av.produto
        const url = getUrlImagem?.(p)
        const inicial = (p.sku || p.nome).slice(0, 1).toUpperCase()
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => {
                if (cliqueSuprimido()) return
                onTrazerParaFrente(grupo.id, id)
              }}
              disabled={i === 0}
              aria-label={
                i === 0
                  ? `${p.nome} já está na frente do grupo`
                  : `Trazer ${p.nome} para a frente do grupo`
              }
              className={cn(
                'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-[#DF5830] disabled:cursor-default disabled:hover:bg-transparent',
                i === 0 && 'bg-background font-medium',
              )}
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-orange-100 text-xs font-bold text-[#DF5830]"
                >
                  {inicial}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate" title={p.nome}>
                  {p.nome}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {p.sku || 'sem SKU'}
                  {i === 0 ? ' · na frente' : ''}
                </span>
              </span>
              <span
                title={rotuloEtapaCompacto(av)}
                className={cn('shrink-0 text-[11px] font-semibold', COR_SEVERIDADE[corDaEtapa(av)])}
              >
                {rotuloEtapaCompacto(av)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
