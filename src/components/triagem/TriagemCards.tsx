import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ETAPAS_TRIAGEM,
  nomeEtapaTriagem,
  ordenarPorAtraso,
  resumirTriagem,
  type TriagemAvaliacao,
  type TriagemEtapaChave,
  type TriagemStatusEtapa,
} from '@/lib/triagemModelo'

const CORES_STATUS: Record<TriagemStatusEtapa, { dot: string; texto: string; bg: string }> = {
  verde: { dot: 'bg-emerald-500', texto: 'text-emerald-700', bg: 'bg-emerald-50' },
  amarelo: { dot: 'bg-amber-500', texto: 'text-amber-700', bg: 'bg-amber-50' },
  vermelho: { dot: 'bg-red-500', texto: 'text-red-700', bg: 'bg-red-50' },
  cinza: { dot: 'bg-gray-300', texto: 'text-gray-500', bg: 'bg-gray-100' },
}

const ROTULO_STATUS: Record<TriagemStatusEtapa, string> = {
  verde: 'concluída',
  amarelo: 'parcial/desatualizada',
  vermelho: 'nunca feita',
  cinza: 'não se aplica',
}

const ROTULO_TIPO: Record<string, string> = {
  revenda: 'Revenda',
  fabricacao_propria: 'Fabricação própria',
  kit: 'Kit',
  combo: 'Combo',
}

const ROTULO_FILTRO_ETAPA: Record<string, string> = {
  todos: 'Todas as etapas',
  integrados: '✅ 100% integrados',
  sem_cenario: 'Sem nenhum cenário',
  ...Object.fromEntries(
    ETAPAS_TRIAGEM.map((k, i) => [k, `Parou na etapa ${i + 1} · ${nomeEtapaTriagem(k)}`]),
  ),
}

export interface FiltrosTriagem {
  etapa: string
  categoria: string
  tipo: string
  busca: string
}

export const FILTRO_ETAPA_TODOS = 'todos'

export function resumoTriagemTexto(resumo: ReturnType<typeof resumirTriagem>): string {
  const partes: string[] = [`${resumo.integrados} de ${resumo.total} produtos 100% integrados`]
  if (resumo.pararamEtapa) {
    partes.push(`${resumo.pararamEtapa.quantidade} pararam na etapa ${resumo.pararamEtapa.nome}`)
  }
  if (resumo.semNenhumCenario > 0) {
    partes.push(`${resumo.semNenhumCenario} sem nenhum cenário`)
  }
  return partes.join(' · ')
}

export function TriagemResumoBar({ resumo }: { resumo: ReturnType<typeof resumirTriagem> }) {
  return (
    <div
      className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-[#7c3a1d]"
      role="status"
    >
      {resumoTriagemTexto(resumo)}
    </div>
  )
}

interface TriagemFiltrosBarProps {
  filtros: FiltrosTriagem
  onChange: (f: FiltrosTriagem) => void
  categorias: string[]
  tipos: string[]
}

export function TriagemFiltrosBar({
  filtros,
  onChange,
  categorias,
  tipos,
}: TriagemFiltrosBarProps) {
  const set = (patch: Partial<FiltrosTriagem>) => onChange({ ...filtros, ...patch })
  return (
    <div className="flex flex-wrap items-end gap-3" role="search" aria-label="Filtros da triagem">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="triagem-etapa">
          Etapa onde parou
        </label>
        <Select value={filtros.etapa} onValueChange={(v) => set({ etapa: v })}>
          <SelectTrigger id="triagem-etapa" className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ROTULO_FILTRO_ETAPA).map(([valor, rotulo]) => (
              <SelectItem key={valor} value={valor}>
                {rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="triagem-categoria">
          Categoria
        </label>
        <Select value={filtros.categoria} onValueChange={(v) => set({ categoria: v })}>
          <SelectTrigger id="triagem-categoria" className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="triagem-tipo">
          Tipo
        </label>
        <Select value={filtros.tipo} onValueChange={(v) => set({ tipo: v })}>
          <SelectTrigger id="triagem-tipo" className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {tipos.map((t) => (
              <SelectItem key={t} value={t}>
                {ROTULO_TIPO[t] || t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="triagem-busca">
          Buscar
        </label>
        <Input
          id="triagem-busca"
          type="search"
          placeholder="Buscar por SKU ou nome…"
          value={filtros.busca}
          onChange={(e) => set({ busca: e.target.value })}
        />
      </div>
    </div>
  )
}

function TrilhoEtapasCard({ avaliacao }: { avaliacao: TriagemAvaliacao }) {
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Trilho das 7 etapas">
      {ETAPAS_TRIAGEM.map((chave, i) => {
        // Defesa: etapa ausente é tratada como vermelha, nunca quebra a renderização
        const info = avaliacao.etapas[chave] ?? {
          chave,
          status: 'vermelho' as const,
          rotulo: 'Etapa não avaliada',
        }
        const cores = CORES_STATUS[info.status]
        return (
          <li key={chave} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-gray-300" aria-hidden="true">
                →
              </span>
            )}
            <span
              title={`${i + 1}. ${nomeEtapaTriagem(chave)} — ${info.rotulo}`}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cores.bg} ${cores.texto}`}
            >
              <span className={`h-2 w-2 rounded-full ${cores.dot}`} aria-hidden="true" />
              {nomeEtapaTriagem(chave)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function TriagemCardProduto({
  avaliacao,
  onAbrir,
  getUrlImagem,
}: {
  avaliacao: TriagemAvaliacao
  onAbrir: (av: TriagemAvaliacao) => void
  getUrlImagem?: (p: TriagemAvaliacao['produto']) => string | undefined
}) {
  const p = avaliacao.produto
  const urlImagem = getUrlImagem?.(p)
  const urlRetomar = destinoRetomar(avaliacao)
  return (
    <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {urlImagem ? (
            <img
              src={urlImagem}
              alt={`Imagem do produto ${p.nome}`}
              width={56}
              height={56}
              className="h-14 w-14 rounded-md object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-md bg-orange-100 text-lg font-bold text-[#DF5830]"
            >
              {p.nome.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" title={p.nome}>
                  {p.nome}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.sku || 'sem SKU'} · {ROTULO_TIPO[p.tipo] || p.tipo}
                  {p.categoria ? ` · ${p.categoria}` : ''}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  avaliacao.integrado
                    ? 'bg-emerald-100 text-emerald-700'
                    : avaliacao.severidadePendencia === 'amarelo'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-700'
                }`}
              >
                {avaliacao.selo}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <TrilhoEtapasCard avaliacao={avaliacao} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-[#DF5830] hover:text-[#c4491f]"
            onClick={() => onAbrir(avaliacao)}
            aria-label={`Ver detalhe do produto ${p.nome}`}
          >
            Ver detalhe
          </Button>
          {urlRetomar && (
            <a
              href={urlRetomar}
              onClick={(e) => {
                e.preventDefault()
                onAbrir(avaliacao)
              }}
              className="text-xs font-medium text-muted-foreground hover:underline"
            >
              Retomar daqui →
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** URL da tela certa para retomar a etapa pendente do produto. */
export function destinoRetomar(avaliacao: TriagemAvaliacao): string | undefined {
  const chave = ETAPAS_TRIAGEM[avaliacao.parouNaEtapaNumero - 1]
  const id = avaliacao.produto.id
  const sku = avaliacao.produto.sku
  switch (chave) {
    case 'base':
    case 'composicao':
      // aba 'compostos' da Composição de Produtos (aba=base é a de Insumos)
      return `/composicao-produtos?produto=${id}`
    case 'cenario':
      // Repositório de Cenários (lista com busca por sku)
      return `/precificacao/aprovados?sku=${encodeURIComponent(sku)}`
    case 'aprovado':
      return `/precificacao/aprovados?sku=${encodeURIComponent(sku)}`
    case 'matriz':
      // Comparador Lado a Lado (deep-link por sku)
      return `/precificacao/comparar?sku=${encodeURIComponent(sku)}`
    case 'comercial':
      // Uso comercial = item de orçamento com produto vinculado
      return `/precificacao/orcamentos`
    case 'lucro':
      return `/lucro`
  }
}

interface TriagemGradeProps {
  avaliacoes: TriagemAvaliacao[]
  onAbrir: (av: TriagemAvaliacao) => void
  getUrlImagem?: (p: TriagemAvaliacao['produto']) => string | undefined
}

export function TriagemGrade({ avaliacoes, onAbrir, getUrlImagem }: TriagemGradeProps) {
  if (avaliacoes.length === 0) {
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {avaliacoes.map((av) => (
        <TriagemCardProduto
          key={av.produto.id}
          avaliacao={av}
          onAbrir={onAbrir}
          getUrlImagem={getUrlImagem}
        />
      ))}
    </div>
  )
}

export function TriagemCarregando() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  )
}

export function TriagemLegenda() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {(['verde', 'amarelo', 'vermelho', 'cinza'] as TriagemStatusEtapa[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-full ${CORES_STATUS[s].dot}`} aria-hidden="true" />
          {ROTULO_STATUS[s]}
        </span>
      ))}
    </div>
  )
}
