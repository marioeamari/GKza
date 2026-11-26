import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, GripVertical, Pencil, Unlink, Unlink2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  tituloGrupo,
  type TriagemGrupo,
  type TriagemPosicao,
  type ZonaSoltar,
} from '@/lib/triagemGrupos'
import type { TriagemAvaliacao } from '@/lib/triagemModelo'
import { type GetFileUrlFn, TriagemCardProduto } from './TriagemCards'
import { useArrastoGrade } from './useArrastoGrade'

/**
 * Grade da Triagem com agrupamento manual por arrasto (camada visual sobre as
 * 7 etapas — nada do trilho/filtros/resumo muda).
 *
 * Regras gravadas (protocolo acordado, lib/triagemGrupos.ts):
 * - soltar card sobre o CENTRO de outro card solto agrupa os dois;
 * - soltar card sobre um grupo faz o card ENTRAR na pilha;
 * - soltar na borda (30% sup/inf) de um card solto REORDENA a grade;
 * - grupo se move como bloco; soltar grupo em card/grupo só reordena.
 * O gesto (mouse arrasta; toque = long-press) vem de useArrastoGrade; a
 * decisão de agrupar/reordenar vem de useTriagemGrupos.soltar.
 *
 * Alça de arraste (0.0.318): cada card tem um grip de 6 pontinhos no canto
 * superior direito — é o ponto de pegada preferencial do arraste. O
 * pointerdown no grip sobe até o wrapper (mesmo gesto de arrastar o corpo),
 * mas o clique nele não faz nada (nunca traz para a frente nem abre detalhe).
 */
export interface TriagemGradeAgrupadaProps {
  posicoes: TriagemPosicao[]
  avaliacaoPorId: Map<string, TriagemAvaliacao>
  grupos: TriagemGrupo[]
  onAbrir: (avaliacao: TriagemAvaliacao) => void
  onTitulo: (grupoId: string, titulo: string) => void
  onTrazerParaFrente: (grupoId: string, produtoId: string) => void
  onNavegar: (grupoId: string, avancar: boolean) => void
  onDesagruparFrente: (grupoId: string) => void
  onDesagruparTudo: (grupoId: string) => void
  aoSoltar: (arrastadoKey: string, alvoKey: string, zona: ZonaSoltar) => void
  getUrlImagem?: GetFileUrlFn
}

export function TriagemGradeAgrupada({
  posicoes,
  avaliacaoPorId,
  grupos,
  onAbrir,
  onTitulo,
  onTrazerParaFrente,
  onNavegar,
  onDesagruparFrente,
  onDesagruparTudo,
  aoSoltar,
  getUrlImagem,
}: TriagemGradeAgrupadaProps) {
  const arrasto = useArrastoGrade(aoSoltar)
  if (posicoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-14 text-center">
        <p className="text-base font-semibold">Nenhum produto encontrado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajuste os filtros ou cadastre produtos em Precificação ▸ Produtos.
        </p>
      </div>
    )
  }
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      role="list"
      aria-label="Produtos da triagem"
    >
      {posicoes.map((pos, indice) => {
        const key = pos.tipo === 'grupo' ? `g:${pos.grupoId}` : `p:${pos.produtoId}`
        const arrastando = arrasto.estado.arrastandoKey === key
        const alvo = arrasto.estado.alvoKey === key ? arrasto.estado.zona : null
        return (
          <div
            key={key}
            role="listitem"
            {...arrasto.manipuladores(key)}
            className={cn(
              'relative rounded-xl transition-shadow',
              arrastando && 'opacity-40',
              alvo === 'centro' && 'ring-2 ring-[#DF5830]',
              alvo === 'antes' && 'shadow-[0_-3px_0_0_#DF5830]',
              alvo === 'depois' && 'shadow-[0_3px_0_0_#DF5830]',
            )}
          >
            {pos.tipo === 'solto' ? (
              <CardSolto
                avaliacao={avaliacaoPorId.get(pos.produtoId)}
                alca={<AlcaArraste />}
                onAbrir={onAbrir}
                getUrlImagem={getUrlImagem}
                cliqueSuprimido={arrasto.suprimirClique}
              />
            ) : (
              <CardGrupo
                grupo={grupos.find((g) => g.id === pos.grupoId)}
                avaliacaoPorId={avaliacaoPorId}
                alca={<AlcaArraste />}
                onTitulo={onTitulo}
                onTrazerParaFrente={onTrazerParaFrente}
                onNavegar={onNavegar}
                onDesagruparFrente={onDesagruparFrente}
                onDesagruparTudo={onDesagruparTudo}
                onAbrir={onAbrir}
                getUrlImagem={getUrlImagem}
                cliqueSuprimido={arrasto.suprimirClique}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------ Alça de arraste ----------------------------- */

/**
 * Alça de clique-e-arraste (grip de 6 pontinhos, 2 colunas x 3 linhas).
 *
 * - o onPointerDown NÃO é tratado aqui de propósito: ele sobe (bubble) até o
 *   wrapper do card, que registra o gesto em useArrastoGrade — assim arrastar
 *   pelo grip faz EXATAMENTE o mesmo movimento de arrastar pelo corpo do card
 *   (mouse: clique+arraste; toque: long-press de ~420ms);
 * - o onClick para a propagação para que o clique no grip não traga o card da
 *   pilha para a frente nem abra o detalhe;
 * - visual pequeno e discreto, no canto superior direito do card.
 */
function AlcaArraste() {
  return (
    <button
      type="button"
      data-alca-arraste="true"
      aria-hidden="true"
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.preventDefault()}
      className="-mr-0.5 -mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-gray-400 active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}

/* ------------------------------- Card solto ------------------------------- */

function CardSolto({
  avaliacao,
  onAbrir,
  getUrlImagem,
  cliqueSuprimido,
  alca,
}: {
  avaliacao?: TriagemAvaliacao
  onAbrir: (avaliacao: TriagemAvaliacao) => void
  getUrlImagem?: GetFileUrlFn
  cliqueSuprimido: () => boolean
  alca?: ReactNode
}) {
  if (!avaliacao) return null
  return (
    <TriagemCardProduto
      avaliacao={avaliacao}
      alca={alca}
      onAbrir={(av) => {
        if (!cliqueSuprimido()) onAbrir(av)
      }}
      getUrlImagem={getUrlImagem}
    />
  )
}

/* -------------------------------- Card grupo ------------------------------- */

function CardGrupo({
  grupo,
  avaliacaoPorId,
  onTitulo,
  onTrazerParaFrente,
  onNavegar,
  onDesagruparFrente,
  onDesagruparTudo,
  onAbrir,
  getUrlImagem,
  cliqueSuprimido,
  alca,
}: {
  grupo?: TriagemGrupo
  avaliacaoPorId: Map<string, TriagemAvaliacao>
  onTitulo: (grupoId: string, titulo: string) => void
  onTrazerParaFrente: (grupoId: string, produtoId: string) => void
  onNavegar: (grupoId: string, avancar: boolean) => void
  onDesagruparFrente: (grupoId: string) => void
  onDesagruparTudo: (grupoId: string) => void
  onAbrir: (avaliacao: TriagemAvaliacao) => void
  getUrlImagem?: GetFileUrlFn
  cliqueSuprimido: () => boolean
  alca?: ReactNode
}) {
  const [editandoTitulo, setEditandoTitulo] = useState(false)
  const [rascunhoTitulo, setRascunhoTitulo] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  if (!grupo || grupo.membros.length === 0) return null

  const frente = grupo.membros[0]
  const avFrente = avaliacaoPorId.get(frente)
  const n = grupo.membros.length

  const confirmarTitulo = () => {
    onTitulo(grupo.id, rascunhoTitulo.trim())
    setEditandoTitulo(false)
  }

  return (
    <div className="relative rounded-xl">
      {/* pilha visual: camadas atrás do card da frente */}
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl border bg-gray-200/80"
      />
      {n > 2 && (
        <div
          aria-hidden="true"
          className="absolute inset-0 translate-x-1 translate-y-1 rounded-xl border bg-gray-100"
        />
      )}

      <div className="relative rounded-xl border bg-card p-1.5 shadow-sm">
        {/* alça de arraste: fica à direita do título, discreta */}
        <div className="absolute right-1 top-1 z-10">{alca}</div>
        {/* título personalizado editável + contador */}
        {editandoTitulo ? (
          <Input
            ref={inputRef}
            autoFocus
            value={rascunhoTitulo}
            onChange={(e) => setRascunhoTitulo(e.target.value)}
            onBlur={confirmarTitulo}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmarTitulo()
              else if (e.key === 'Escape') setEditandoTitulo(false)
            }}
            aria-label="Título do grupo"
            placeholder="Nome do grupo"
            className="mb-1 h-7 text-xs font-semibold"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setRascunhoTitulo(grupo.titulo || '')
              setEditandoTitulo(true)
            }}
            aria-label={`Editar título do grupo (atual: ${tituloGrupo(grupo)})`}
            className="mb-1 flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs font-bold text-[#DF5830] hover:underline focus-visible:outline-2 focus-visible:outline-[#DF5830]"
          >
            <span className="truncate">
              {tituloGrupo(grupo)} · {n} produto{n > 1 ? 's' : ''}
            </span>
            <Pencil className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        )}

        {avFrente && (
          <TriagemCardProduto
            avaliacao={avFrente}
            alca={alca}
            onAbrir={(av) => {
              // clique no card da pilha: traz para a frente; 2º clique abre
              if (cliqueSuprimido()) return
              if (grupo.membros[0] === av.produto.id) onAbrir(av)
              else onTrazerParaFrente(grupo.id, av.produto.id)
            }}
            getUrlImagem={getUrlImagem}
          />
        )}

        {/* controles: navegar ‹ ›, desagrupar frente, desagrupar tudo */}
        <div className="mt-1 flex items-center justify-between gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onNavegar(grupo.id, false)}
            disabled={n < 2}
            aria-label="Card anterior do grupo"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onNavegar(grupo.id, true)}
            disabled={n < 2}
            aria-label="Próximo card do grupo"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDesagruparFrente(grupo.id)}
            disabled={n < 1}
            aria-label="Desagrupar card da frente"
          >
            <Unlink2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDesagruparTudo(grupo.id)}
            aria-label="Desfazer o grupo completo"
          >
            <Unlink className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
