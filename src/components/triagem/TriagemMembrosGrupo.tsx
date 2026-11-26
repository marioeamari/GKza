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
 * - 0.0.320: nome e SKU SEM ellipsis — quebram linha (break-words) com a
 *   linha crescendo em altura, igual ao card da frente (pedido: ver o título
 *   e o SKU completos);
 * - 0.0.324: a linha do membro da FRENTE (o exibido no card) fica claramente
 *   destacada (pedido: "destaca o produto que está sendo exibido"): faixa de
 *   fundo laranja intensa + borda esquerda grossa na cor primária #DF5830 +
 *   nome/SKU em negrito + pill "Exibido" à direita da linha; as demais linhas
 *   ficam levemente atenuadas (opacity) para dar contraste. O destaque é
 *   derivado da posição (índice 0), então se move sozinho quando a frente
 *   muda (clique numa linha, navegação ‹ › do grupo ou desagrupar da frente);
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
                if (i === 0) return
                if (cliqueSuprimido()) return
                onTrazerParaFrente(grupo.id, id)
              }}
              disabled={i === 0}
              aria-label={
                i === 0
                  ? `${p.nome} está sendo exibido no card do grupo`
                  : `Trazer ${p.nome} para a frente do grupo`
              }
              className={cn(
                'flex w-full items-center gap-2 rounded border-l-4 py-1 pr-1.5 pl-1.5 text-left text-xs focus-visible:outline-2 focus-visible:outline-[#DF5830]',
                i === 0
                  ? 'border-l-[#DF5830] bg-[#DF5830]/15 font-semibold'
                  : 'border-l-transparent opacity-70 hover:bg-accent hover:opacity-100 focus-visible:opacity-100',
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
              {/* 0.0.320: nome e SKU SEM ellipsis — mesma regra do card da
                  frente: quebram linha (break-words) e a linha cresce. */}
              <span className="min-w-0 flex-1">
                <span className={cn('block break-words', i === 0 && 'font-bold')}>{p.nome}</span>
                <span className="block break-words text-[11px] text-muted-foreground">
                  {p.sku || 'sem SKU'}
                </span>
              </span>
              {i === 0 && (
                <span
                  aria-hidden="true"
                  className="shrink-0 rounded-full bg-[#DF5830] px-1.5 py-0.5 text-[10px] leading-none font-bold text-white"
                >
                  Exibido
                </span>
              )}
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
