import { cn } from '@/lib/utils'
import type { CanalIcone } from '@/lib/triagemCanais'

/**
 * Fileira de círculos dos canais de venda de um produto na Triagem (0.0.325).
 *
 * Regra gravada (protocolo acordado): um círculo por canal ativo, com a
 * inicial do canal em branco e negrito. Classificado no canal = cor original
 * do canal; não classificado = cinza (inativo). O tooltip (title + aria-label)
 * mostra "Nome — R$ X,XX aprovado" ou "Nome — sem preço aprovado".
 * Usa <span> (não <ul>) para poder ficar dentro de um <button> da lista de membros.
 */
export function TriagemIconesCanais({
  icones,
  tamanho,
}: {
  icones: CanalIcone[]
  tamanho: 'card' | 'membro'
}) {
  if (icones.length === 0) return null
  const dimensao = tamanho === 'card' ? 'h-7 w-7 text-xs' : 'h-5 w-5 text-[10px]'
  return (
    <span className="flex flex-wrap items-center gap-1">
      {icones.map((ic) => (
        <span
          key={ic.canalId}
          role="img"
          aria-label={ic.rotuloTooltip}
          title={ic.rotuloTooltip}
          style={ic.classificado ? { backgroundColor: ic.cor } : undefined}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none',
            dimensao,
            ic.classificado ? 'text-white' : 'bg-gray-300 text-gray-600',
          )}
        >
          {ic.inicial}
        </span>
      ))}
    </span>
  )
}
