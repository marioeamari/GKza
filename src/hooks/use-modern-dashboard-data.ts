import { useCallback, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { financeService } from '@/services/finance'
import { marketplacesService } from '@/services/marketplaces'
import { despesasService } from '@/services/despesas'
import { cadastrosService } from '@/services/cadastros'
import { precificacaoService } from '@/services/precificacao'
import { projetosTarefasService } from '@/services/projetosTarefas'
import type {
  Categoria,
  Conta,
  DespesaCompromisso,
  DespesaOcorrencia,
  Empresa,
  Lancamento,
  Marketplace,
  MarketplaceConta,
  MetaMeta,
  Pessoa,
  Repasse,
  TagItem,
  TelegramRegistroPendente,
  Venda,
} from '@/types/domain'
import type { PrecPrecificacaoRecord, PrecProdutoRecord } from '@/types/precificacao'

import { lembretesService } from '@/services/lembretes'
import type { LembreteRapido } from '@/types/domain'

export interface ExtendedDashboardData {
  contas: Conta[]
  categorias: Categoria[]
  lancamentos: Lancamento[]
  compromissos: DespesaCompromisso[]
  ocorrencias: DespesaOcorrencia[]
  marketplaces: Marketplace[]
  marketplaceContas: MarketplaceConta[]
  vendas: Venda[]
  repasses: Repasse[]
  empresas: Empresa[]
  pessoas: Pessoa[]
  tags: TagItem[]
  produtos: PrecProdutoRecord[]
  precificacoes: PrecPrecificacaoRecord[]
  metas: MetaMeta[]
  pendentes: TelegramRegistroPendente[]
  lembretes: LembreteRapido[]
  loading: boolean
  error: any
  refresh: () => Promise<void>
}
export function useModernDashboardData(): ExtendedDashboardData {
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [compromissos, setCompromissos] = useState<DespesaCompromisso[]>([])
  const [ocorrencias, setOcorrencias] = useState<DespesaOcorrencia[]>([])
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([])
  const [marketplaceContas, setMarketplaceContas] = useState<MarketplaceConta[]>([])
  const [vendas, setVendas] = useState<Venda[]>([])
  const [repasses, setRepasses] = useState<Repasse[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [tags, setTags] = useState<TagItem[]>([])
  const [produtos, setProdutos] = useState<PrecProdutoRecord[]>([])
  const [precificacoes, setPrecificacoes] = useState<PrecPrecificacaoRecord[]>([])
  const [metas, setMetas] = useState<MetaMeta[]>([])
  const [pendentes, setPendentes] = useState<TelegramRegistroPendente[]>([])
  const [lembretes, setLembretes] = useState<LembreteRapido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>()

  const refresh = useCallback(async () => {
    try {
      setError(undefined)
      const [
        resContas,
        resCategorias,
        resLancamentos,
        resCompromissos,
        resOcorrencias,
        resMarketplaces,
        resContasMarketplace,
        resVendas,
        resRepasses,
        resEmpresas,
        resPessoas,
        resTags,
        resProdutos,
        resPrecificacoes,
        resMetas,
        resPendentes,
        resLembretes,
      ] = await Promise.allSettled([
        financeService.listContas(),
        financeService.listCategorias(),
        financeService.listLancamentos(),
        despesasService.listCompromissos(),
        despesasService.listOcorrencias(),
        marketplacesService.listMarketplaces(),
        marketplacesService.listContas(),
        marketplacesService.listVendas(),
        marketplacesService.listRepasses(),
        cadastrosService.listEmpresas(),
        cadastrosService.listPessoas(),
        despesasService.listTags(),
        precificacaoService.listProdutos(),
        pb.collection('prec_precificacoes').getFullList<PrecPrecificacaoRecord>({
          sort: '-created',
          expand: 'produto,canal,empresa,modalidade',
        }),
        projetosTarefasService.listMetas(),
        pb.collection('telegram_registros_pendentes').getFullList<TelegramRegistroPendente>({
          filter: "status = 'pendente'",
          sort: '-data',
        }),
        lembretesService.listPendentes(),
      ])

      if (resContas.status === 'fulfilled') setContas(resContas.value)
      if (resCategorias.status === 'fulfilled') setCategorias(resCategorias.value)
      if (resLancamentos.status === 'fulfilled') setLancamentos(resLancamentos.value)
      if (resCompromissos.status === 'fulfilled') setCompromissos(resCompromissos.value)
      if (resOcorrencias.status === 'fulfilled') setOcorrencias(resOcorrencias.value)
      if (resMarketplaces.status === 'fulfilled') setMarketplaces(resMarketplaces.value)
      if (resContasMarketplace.status === 'fulfilled')
        setMarketplaceContas(resContasMarketplace.value)
      if (resVendas.status === 'fulfilled') setVendas(resVendas.value)
      if (resRepasses.status === 'fulfilled') setRepasses(resRepasses.value)
      if (resEmpresas.status === 'fulfilled') setEmpresas(resEmpresas.value)
      if (resPessoas.status === 'fulfilled') setPessoas(resPessoas.value)
      if (resTags.status === 'fulfilled') setTags(resTags.value)
      if (resProdutos.status === 'fulfilled') setProdutos(resProdutos.value)
      if (resPrecificacoes.status === 'fulfilled') setPrecificacoes(resPrecificacoes.value)
      if (resMetas.status === 'fulfilled') setMetas(resMetas.value)
      if (resPendentes.status === 'fulfilled') setPendentes(resPendentes.value)
      if (resLembretes.status === 'fulfilled') setLembretes(resLembretes.value)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    contas,
    categorias,
    lancamentos,
    compromissos,
    ocorrencias,
    marketplaces,
    marketplaceContas,
    vendas,
    repasses,
    empresas,
    pessoas,
    tags,
    produtos,
    precificacoes,
    metas,
    pendentes,
    lembretes,
    loading,
    error,
    refresh,
  }
}
