import { useState, useEffect, useMemo } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Plus,
  Coins,
  Receipt,
  ReceiptText,
  TrendingUp,
  Wallet,
  Globe,
  Pencil,
  Trash2,
  RefreshCw,
  Building2,
  Layers,
  Sparkles,
} from 'lucide-react'
import { dividasService } from '@/services/dividas'
import {
  calcularResumoDivida,
  type DividaRecord,
  type ParcelaRecord,
  type ReceitaRecord,
  type DespesaAvulsaRecord,
} from '@/lib/dividas'
import { formatCurrency } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { DividaCard } from '@/components/dividas/DividaCard'
import { DividaDialog } from '@/components/dividas/DividaDialog'
import { CronogramaParcelas } from '@/components/dividas/CronogramaParcelas'
import { ReceitasMaquina } from '@/components/dividas/ReceitasMaquina'
import { DespesasMaquina } from '@/components/dividas/DespesasMaquina'
import { CaixaMaquina } from '@/components/dividas/CaixaMaquina'
import { DemonstrativoGlobalView } from '@/components/dividas/DemonstrativoGlobalView'
import { DespesaAvulsaModal } from '@/components/dividas/DespesaAvulsaModal'
import { ReceitaModal } from '@/components/dividas/ReceitaModal'

export default function DividasPage() {
  const [loading, setLoading] = useState(true)
  const [dividas, setDividas] = useState<DividaRecord[]>([])
  const [parcelasPorDivida, setParcelasPorDivida] = useState<Map<string, ParcelaRecord[]>>(
    new Map(),
  )
  const [receitasPorDivida, setReceitasPorDivida] = useState<Map<string, ReceitaRecord[]>>(
    new Map(),
  )
  const [despesasPorDivida, setDespesasPorDivida] = useState<Map<string, DespesaAvulsaRecord[]>>(
    new Map(),
  )

  const [dividaSelecionadaId, setDividaSelecionadaId] = useState<string | null>(null)
  const [abaAtiva, setAbaAtiva] = useState<
    'cronograma' | 'receitas' | 'despesas' | 'caixa' | 'global'
  >('cronograma')

  // Modais de dívida
  const [modalNovaDivida, setModalNovaDivida] = useState(false)
  const [dividaParaEditar, setDividaParaEditar] = useState<DividaRecord | null>(null)

  // Modais rápidos acionados a partir do cabeçalho ou card
  const [dividaParaDespesaAvulsa, setDividaParaDespesaAvulsa] = useState<DividaRecord | null>(null)
  const [dividaParaReceita, setDividaParaReceita] = useState<DividaRecord | null>(null)

  const carregarDados = async () => {
    try {
      setLoading(true)
      const listaDividas = await dividasService.listDividas()
      setDividas(listaDividas)

      // Carrega parcelas, receitas e despesas de todas as dívidas
      const pMap = new Map<string, ParcelaRecord[]>()
      const rMap = new Map<string, ReceitaRecord[]>()
      const dMap = new Map<string, DespesaAvulsaRecord[]>()

      for (const div of listaDividas) {
        const [pars, recs, desps] = await Promise.all([
          dividasService.listParcelas(div.id),
          dividasService.listReceitas(div.id),
          dividasService.listDespesas(div.id),
        ])
        pMap.set(div.id, pars)
        rMap.set(div.id, recs)
        dMap.set(div.id, desps)
      }

      setParcelasPorDivida(pMap)
      setReceitasPorDivida(rMap)
      setDespesasPorDivida(dMap)

      // Seleção padrão da primeira dívida
      if (!dividaSelecionadaId && listaDividas.length > 0) {
        setDividaSelecionadaId(listaDividas[0].id)
      } else if (
        dividaSelecionadaId &&
        !listaDividas.some((d) => d.id === dividaSelecionadaId) &&
        listaDividas.length > 0
      ) {
        setDividaSelecionadaId(listaDividas[0].id)
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados de dívidas:', err)
      toast({
        title: 'Erro ao carregar módulo de dívidas',
        description: err?.message || 'Falha ao buscar registros.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  const dividaSelecionada = useMemo(
    () => dividas.find((d) => d.id === dividaSelecionadaId) || null,
    [dividas, dividaSelecionadaId],
  )

  const parcelasDaSelecionada = useMemo(
    () => (dividaSelecionadaId ? parcelasPorDivida.get(dividaSelecionadaId) || [] : []),
    [parcelasPorDivida, dividaSelecionadaId],
  )

  const receitasDaSelecionada = useMemo(
    () => (dividaSelecionadaId ? receitasPorDivida.get(dividaSelecionadaId) || [] : []),
    [receitasPorDivida, dividaSelecionadaId],
  )

  const despesasDaSelecionada = useMemo(
    () => (dividaSelecionadaId ? despesasPorDivida.get(dividaSelecionadaId) || [] : []),
    [despesasPorDivida, dividaSelecionadaId],
  )

  // TOTAIS GERAIS CONSOLIDADOS
  const totaisGerais = useMemo(() => {
    let valorTotal = 0
    let totalPago = 0
    let totalDespesasAvulsas = 0
    let totalReceitas = 0

    for (const div of dividas) {
      const pars = parcelasPorDivida.get(div.id) || []
      const recs = receitasPorDivida.get(div.id) || []
      const desps = despesasPorDivida.get(div.id) || []
      const res = calcularResumoDivida(div, pars)
      valorTotal += res.valor_total
      totalPago += res.total_pago
      totalDespesasAvulsas += desps.reduce((acc, d) => acc + (d.valor || 0), 0)
      totalReceitas += recs.reduce((acc, r) => acc + (r.valor || 0), 0)
    }

    return {
      valorTotal,
      totalPago,
      totalDespesasAvulsas,
      saldoDevedor: Math.max(0, valorTotal - totalPago),
      totalReceitas,
    }
  }, [dividas, parcelasPorDivida, receitasPorDivida, despesasPorDivida])

  const handleExcluirDivida = async (div: DividaRecord) => {
    if (
      !confirm(
        `Tem certeza que deseja excluir a dívida da máquina "${div.nome}" e todas as suas parcelas e receitas associadas?`,
      )
    ) {
      return
    }

    try {
      await dividasService.deleteDivida(div.id)
      toast({ title: 'Dívida excluída com sucesso!' })
      setDividaSelecionadaId(null)
      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir dívida',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* CABEÇALHO DA PÁGINA */}
      <PageHeader
        title="Gestor de Dívidas & Financiamento de Máquinas"
        description="Acompanhamento isolado de grandes ativos, parcelas irregulares, receitas dedicadas e projeção de caixa por máquina."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={carregarDados} className="gap-1.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDividaParaEditar(null)
                setModalNovaDivida(true)
              }}
              className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-white font-semibold"
            >
              <Plus className="w-4 h-4" /> Nova Dívida / Máquina
            </Button>
          </div>
        }
      />

      {/* CARDS COM TOTAIS GERAIS CONSOLIDADOS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Valor em Máquinas
          </span>
          <div className="text-xl sm:text-2xl font-black text-foreground mt-1">
            {formatCurrency(totaisGerais.valorTotal)}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            {dividas.length} máquina(s) contratada(s)
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Total Já Quitado
          </span>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-1">
            {formatCurrency(totaisGerais.totalPago)}
          </div>
          <span className="text-[11px] text-emerald-700 mt-0.5 block font-medium">
            {totaisGerais.valorTotal > 0
              ? `${Math.round((totaisGerais.totalPago / totaisGerais.valorTotal) * 100)}% amortizado`
              : '0%'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Saldo Devedor (Parcelas)
          </span>
          <div className="text-xl sm:text-2xl font-black text-primary mt-1">
            {formatCurrency(totaisGerais.saldoDevedor)}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            A liquidar nos cronogramas
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Total em Despesas Avulsas
          </span>
          <div className="text-xl sm:text-2xl font-black text-rose-600 mt-1">
            {formatCurrency(totaisGerais.totalDespesasAvulsas)}
          </div>
          <span className="text-[11px] text-rose-700 mt-0.5 block font-medium">
            Fretes, montagens e extras
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Receitas Geradas Totais
          </span>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
            {formatCurrency(totaisGerais.totalReceitas)}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Faturamento das máquinas
          </span>
        </div>
      </div>

      {/* SELETOR DE MÁQUINA / CARTÕES NA LISTAGEM */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-primary" />
            Selecione uma Máquina para Detalhar
          </h2>
          {dividas.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAbaAtiva('global')}
              className="text-xs text-primary font-semibold hover:bg-primary/10 gap-1"
            >
              <Globe className="w-3.5 h-3.5" /> Ver Demonstrativo Global
            </Button>
          )}
        </div>

        {dividas.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center space-y-3">
            <Coins className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-bold text-foreground">Nenhuma dívida de máquina cadastrada</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Cadastre financiamentos ou compras parceladas de grandes máquinas para acompanhar
              cronogramas irregulares, receitas próprias e projeção de caixa.
            </p>
            <Button
              onClick={() => {
                setDividaParaEditar(null)
                setModalNovaDivida(true)
              }}
              className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs"
            >
              <Plus className="w-4 h-4 mr-1" /> Cadastrar Primeira Máquina
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dividas.map((div) => (
              <DividaCard
                key={div.id}
                divida={div}
                parcelas={parcelasPorDivida.get(div.id) || []}
                receitas={receitasPorDivida.get(div.id) || []}
                despesas={despesasPorDivida.get(div.id) || []}
                isSelected={div.id === dividaSelecionadaId && abaAtiva !== 'global'}
                onClick={() => {
                  setDividaSelecionadaId(div.id)
                  if (abaAtiva === 'global') setAbaAtiva('cronograma')
                }}
                onNovaDespesa={() => {
                  setDividaParaDespesaAvulsa(div)
                }}
                onNovaReceita={() => {
                  setDividaParaReceita(div)
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ÁREA DE DETALHAMENTO DA DÍVIDA SELECIONADA OU DEMONSTRATIVO GLOBAL */}
      {dividas.length > 0 && (
        <div className="space-y-4 pt-2">
          {abaAtiva !== 'global' && dividaSelecionada && (
            <div className="bg-white rounded-xl border border-border p-4 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-foreground">{dividaSelecionada.nome}</h2>
                  <span className="text-xs text-muted-foreground font-medium">
                    ({dividaSelecionada.credor})
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Valor Total: <strong>{formatCurrency(dividaSelecionada.valor_total)}</strong>
                  {dividaSelecionada.taxa_juros
                    ? ` • Juros: ${dividaSelecionada.taxa_juros}% (${dividaSelecionada.taxa_juros_tipo || 'mensal'})`
                    : ''}
                  {' • '}
                  Despesas Avulsas:{' '}
                  <strong className="text-rose-600">
                    {formatCurrency(
                      despesasDaSelecionada.reduce((acc, d) => acc + (d.valor || 0), 0),
                    )}
                  </strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setDividaParaDespesaAvulsa(dividaSelecionada)}
                  className="h-8 text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Despesa Avulsa
                </Button>
                <Button
                  size="sm"
                  onClick={() => setDividaParaReceita(dividaSelecionada)}
                  className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Receita
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDividaParaEditar(dividaSelecionada)
                    setModalNovaDivida(true)
                  }}
                  className="h-8 text-xs gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleExcluirDivida(dividaSelecionada)}
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </Button>
              </div>
            </div>
          )}

          {/* NAVEGAÇÃO POR ABAS: CRONOGRAMA | RECEITAS | DESPESAS AVULSAS | CAIXA POR MÁQUINA | GLOBAL */}
          <Tabs
            value={abaAtiva}
            onValueChange={(val: any) => setAbaAtiva(val)}
            className="w-full space-y-4"
          >
            <TabsList className="bg-slate-100 p-1 rounded-xl grid grid-cols-2 sm:grid-cols-5 w-full h-auto">
              <TabsTrigger
                value="cronograma"
                className="py-2 text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg gap-1.5"
              >
                <Receipt className="w-4 h-4 text-primary" />
                Cronograma de Parcelas
              </TabsTrigger>
              <TabsTrigger
                value="despesas"
                className="py-2 text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg gap-1.5"
              >
                <ReceiptText className="w-4 h-4 text-rose-600" />
                Despesas Avulsas ({despesasDaSelecionada.length})
              </TabsTrigger>
              <TabsTrigger
                value="receitas"
                className="py-2 text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg gap-1.5"
              >
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Receitas & Payback
              </TabsTrigger>
              <TabsTrigger
                value="caixa"
                className="py-2 text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg gap-1.5"
              >
                <Wallet className="w-4 h-4 text-amber-600" />
                Caixa da Máquina
              </TabsTrigger>
              <TabsTrigger
                value="global"
                className="py-2 text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg gap-1.5"
              >
                <Globe className="w-4 h-4 text-blue-600" />
                Demonstrativo Global
              </TabsTrigger>
            </TabsList>

            {/* ABA 1: CRONOGRAMA */}
            <TabsContent value="cronograma" className="focus-visible:outline-none">
              {dividaSelecionada ? (
                <CronogramaParcelas
                  divida={dividaSelecionada}
                  parcelas={parcelasDaSelecionada}
                  onRefresh={carregarDados}
                />
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Selecione uma máquina acima para ver o cronograma.
                </div>
              )}
            </TabsContent>

            {/* ABA 2: DESPESAS AVULSAS */}
            <TabsContent value="despesas" className="focus-visible:outline-none">
              {dividaSelecionada ? (
                <DespesasMaquina
                  divida={dividaSelecionada}
                  despesas={despesasDaSelecionada}
                  onRefresh={carregarDados}
                />
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Selecione uma máquina acima para gerenciar despesas avulsas.
                </div>
              )}
            </TabsContent>

            {/* ABA 3: RECEITAS & PAYBACK */}
            <TabsContent value="receitas" className="focus-visible:outline-none">
              {dividaSelecionada ? (
                <ReceitasMaquina
                  divida={dividaSelecionada}
                  parcelas={parcelasDaSelecionada}
                  receitas={receitasDaSelecionada}
                  despesas={despesasDaSelecionada}
                  onRefresh={carregarDados}
                />
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Selecione uma máquina acima para visualizar as receitas e payback.
                </div>
              )}
            </TabsContent>

            {/* ABA 4: CAIXA POR MÁQUINA */}
            <TabsContent value="caixa" className="focus-visible:outline-none">
              {dividaSelecionada ? (
                <CaixaMaquina
                  divida={dividaSelecionada}
                  parcelas={parcelasDaSelecionada}
                  receitas={receitasDaSelecionada}
                  despesas={despesasDaSelecionada}
                />
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Selecione uma máquina acima para simular o caixa específico.
                </div>
              )}
            </TabsContent>

            {/* ABA 5: DEMONSTRATIVO GLOBAL */}
            <TabsContent value="global" className="focus-visible:outline-none">
              <DemonstrativoGlobalView
                dividas={dividas}
                parcelasPorDivida={parcelasPorDivida}
                receitasPorDivida={receitasPorDivida}
                despesasPorDivida={despesasPorDivida}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* MODAL CRIAR / EDITAR DÍVIDA */}
      {modalNovaDivida && (
        <DividaDialog
          open={modalNovaDivida}
          onOpenChange={setModalNovaDivida}
          dividaParaEditar={dividaParaEditar}
          onSuccess={carregarDados}
        />
      )}

      {/* MODAL RÁPIDO DESPESA AVULSA */}
      {dividaParaDespesaAvulsa && (
        <DespesaAvulsaModal
          open={Boolean(dividaParaDespesaAvulsa)}
          onOpenChange={(op) => !op && setDividaParaDespesaAvulsa(null)}
          dividaId={dividaParaDespesaAvulsa.id}
          dividaNome={dividaParaDespesaAvulsa.nome}
          onSuccess={carregarDados}
        />
      )}

      {/* MODAL RÁPIDO RECEITA */}
      {dividaParaReceita && (
        <ReceitaModal
          open={Boolean(dividaParaReceita)}
          onOpenChange={(op) => !op && setDividaParaReceita(null)}
          dividaId={dividaParaReceita.id}
          dividaNome={dividaParaReceita.nome}
          onSuccess={carregarDados}
        />
      )}
    </div>
  )
}
