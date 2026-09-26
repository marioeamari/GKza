import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Calculator,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
  DollarSign,
  TrendingUp,
  Percent,
  Layers,
  HelpCircle,
  Clock,
  Eye,
  Sliders,
  Check,
  Building2,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { precificacaoService } from '@/services/precificacao'
import { useAuth } from '@/contexts/AuthContext'
import {
  PrecCanalModalidadeRecord,
  PrecCanalRecord,
  PrecPerfilTributarioRecord,
  PrecPrecificacaoRecord,
  PrecProdutoRecord,
  PrecTaxaRecord,
} from '@/types/precificacao'
import {
  calcularCustoBaseProduto,
  calcularDemonstrativo,
  DemonstrativoResultado,
  resolverPrecoParaMeta,
  round2,
} from '@/lib/precificacao/calculo'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'

export default function PrecificacaoComparar() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [produtos, setProdutos] = useState<PrecProdutoRecord[]>([])
  const [canais, setCanais] = useState<PrecCanalRecord[]>([])
  const [modalidades, setModalidades] = useState<PrecCanalModalidadeRecord[]>([])
  const [taxas, setTaxas] = useState<PrecTaxaRecord[]>([])
  const [perfisTributarios, setPerfisTributarios] = useState<PrecPerfilTributarioRecord[]>([])
  const [precificacoesExistentes, setPrecificacoesExistentes] = useState<PrecPrecificacaoRecord[]>(
    [],
  )

  // Produto selecionado para o estudo
  const [selectedProdutoId, setSelectedProdutoId] = useState<string>('')

  // Modo de precificação
  const [modoCalculo, setModoCalculo] = useState<
    'mesmo_preco' | 'meta_lucro' | 'meta_margem' | 'manual'
  >('mesmo_preco')
  const [valorPrecoGlobal, setValorPrecoGlobal] = useState<number>(24.9)
  const [metaLucroReais, setMetaLucroReais] = useState<number>(5.0)
  const [metaMargemPct, setMetaMargemPct] = useState<number>(20.0)

  // Preços manuais por modalidade/canal (quando em modo manual)
  const [precosPorColuna, setPrecosPorColuna] = useState<Record<string, number>>({})

  // Descontos simulados por coluna
  const [descontosPorColuna, setDescontosPorColuna] = useState<
    Record<string, { pctCliente: number; descPixPct: number }>
  >({})

  // Canais/Modalidades ativas na visualização
  const [colunasAtivas, setColunasAtivas] = useState<Record<string, boolean>>({})

  // Diferença entre canais selecionados para comparação detalhada
  const [colunaDiffA, setColunaDiffA] = useState<string>('')
  const [colunaDiffB, setColunaDiffB] = useState<string>('')

  // Parâmetros tributários configuráveis na tela (espelho da planilha: DAS 6.95%, ICMS 2.23%)
  const [aliquotaDas, setAliquotaDas] = useState<number>(6.95)
  const [aliquotaIcms, setAliquotaIcms] = useState<number>(2.23)
  const [dasImpostoMes, setDasImpostoMes] = useState<number>(76.5)
  const [pedidosMes, setPedidosMes] = useState<number>(3000)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [prods, chans, mods, txs, tribs, precs] = await Promise.all([
          precificacaoService.listProdutos(),
          precificacaoService.listCanais(true),
          precificacaoService.listModalidades(),
          precificacaoService.listTaxas(),
          precificacaoService.listPerfisTributarios(),
          precificacaoService.listPrecificacoes(),
        ])

        setProdutos(prods)
        setCanais(chans)
        setModalidades(mods)
        setTaxas(txs)
        setPerfisTributarios(tribs)
        setPrecificacoesExistentes(precs)

        // Inicializar produto da URL ou o primeiro disponível
        const paramSku = searchParams.get('sku')
        if (paramSku && prods.length > 0) {
          const match = prods.find((p) => p.sku === paramSku)
          if (match) setSelectedProdutoId(match.id)
          else setSelectedProdutoId(prods[0]?.id || '')
        } else if (prods.length > 0) {
          setSelectedProdutoId(prods[0].id)
        }

        // Ativar colunas padrão (todas ativas inicialmente)
        const initialAtivas: Record<string, boolean> = {}
        for (const m of mods) {
          initialAtivas[m.id] = true
        }
        setColunasAtivas(initialAtivas)
      } catch (err) {
        console.error('Erro ao inicializar comparador:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const produtoAtual = useMemo(() => {
    return produtos.find((p) => p.id === selectedProdutoId) || null
  }, [produtos, selectedProdutoId])

  // Custo base calculado do produto
  const custoBaseAtual = useMemo(() => {
    if (!produtoAtual) return null
    return calcularCustoBaseProduto({
      sku: produtoAtual.sku,
      nome: produtoAtual.nome,
      tipo: produtoAtual.tipo,
      peso_g: produtoAtual.peso_g,
      composicao: produtoAtual.composicao,
      perda_pct: produtoAtual.perda_pct,
      custo_aquisicao_unitario: produtoAtual.custo_aquisicao_unitario,
      despesas_compra: produtoAtual.despesas_compra,
      custo_etiqueta: produtoAtual.custo_etiqueta,
      custo_adicional_embalagem: produtoAtual.custo_adicional_embalagem,
    })
  }, [produtoAtual])

  // Lista de colunas (modalidades agrupadas por canal)
  const colunasModalidade = useMemo(() => {
    const list: Array<{
      modalidade: PrecCanalModalidadeRecord
      canal: PrecCanalRecord
      taxasDoCanal: PrecTaxaRecord[]
    }> = []

    for (const m of modalidades) {
      if (!m.ativo && m.ativo !== undefined) continue
      const canal = canais.find((c) => c.id === m.canal)
      if (!canal || canal.ativo === false) continue

      // Taxas aplicáveis: pertencentes a esta modalidade específica OU ao canal como um todo (modalidade vazia)
      const txs = taxas.filter(
        (t) => t.canal === canal.id && (!t.modalidade || t.modalidade === m.id),
      )

      list.push({
        modalidade: m,
        canal,
        taxasDoCanal: txs,
      })
    }

    return list
  }, [modalidades, canais, taxas])

  // Inicializar seleção de comparação A x B
  useEffect(() => {
    if (colunasModalidade.length >= 2 && !colunaDiffA) {
      setColunaDiffA(colunasModalidade[0].modalidade.id)
      setColunaDiffB(colunasModalidade[1].modalidade.id)
    }
  }, [colunasModalidade, colunaDiffA])

  // Cálculo individualizado por coluna
  const demonstrativosPorColuna = useMemo(() => {
    if (!produtoAtual || !custoBaseAtual) return {}

    const res: Record<
      string,
      {
        demonstrativo: DemonstrativoResultado
        precoAnunciado: number
        modalidade: PrecCanalModalidadeRecord
        canal: PrecCanalRecord
        taxas: PrecTaxaRecord[]
        precoSugeridoEquilibrio: number
        precoSugeridoMeta: number
        convergiuMeta: boolean
      }
    > = {}

    for (const col of colunasModalidade) {
      const modId = col.modalidade.id
      const canal = col.canal

      // Determinar preço anunciado da coluna
      let precoColuna = valorPrecoGlobal
      if (modoCalculo === 'manual') {
        precoColuna = precosPorColuna[modId] ?? valorPrecoGlobal
      }

      // Descontos
      const descConf = descontosPorColuna[modId] || { pctCliente: 0, descPixPct: 0 }
      const descontosInput = []
      if (descConf.pctCliente > 0) {
        descontosInput.push({
          nome: 'Desconto ao Cliente',
          tipo: 'percentual' as const,
          valor: descConf.pctCliente,
          financiado_por: 'vendedor' as const,
        })
      }
      if (descConf.descPixPct > 0) {
        descontosInput.push({
          nome: 'Desconto Pix',
          tipo: 'percentual' as const,
          valor: descConf.descPixPct,
          financiado_por: 'vendedor' as const,
        })
      }

      const cenarioBase = {
        produto: {
          sku: produtoAtual.sku,
          nome: produtoAtual.nome,
          tipo: produtoAtual.tipo,
          peso_g: produtoAtual.peso_g,
          composicao: produtoAtual.composicao,
          perda_pct: produtoAtual.perda_pct,
          custo_aquisicao_unitario: produtoAtual.custo_aquisicao_unitario,
          despesas_compra: produtoAtual.despesas_compra,
          custo_etiqueta: produtoAtual.custo_etiqueta,
          custo_adicional_embalagem: produtoAtual.custo_adicional_embalagem,
        },
        preco_anunciado: precoColuna,
        descontos: descontosInput,
        taxas: col.taxasDoCanal.map((t) => ({
          id: t.id,
          nome: t.nome,
          base_calculo: t.base_calculo,
          tipo_valor: t.tipo_valor,
          valor: t.valor,
          condicao: t.condicao,
          responsavel: t.responsavel,
          tipo_regra: t.tipo_regra,
          financiado_por: t.financiado_por,
          status_conferencia: t.status_conferencia,
        })),
        tributos: {
          aliquota_das_pct: aliquotaDas,
          aliquota_icms_pct: aliquotaIcms,
          das_imposto_total_mes: dasImpostoMes,
          pedidos_estimados_mes: pedidosMes,
        },
        prazo_recebimento_dias: col.modalidade.prazo_recebimento_dias || 0,
      }

      // Se o modo for 'meta_lucro' ou 'meta_margem', encontramos o preço ótimo
      let precoSugeridoMeta = precoColuna
      let convergiuMeta = true

      if (modoCalculo === 'meta_lucro') {
        const sol = resolverPrecoParaMeta(cenarioBase, 'lucro_reais', metaLucroReais)
        precoColuna = sol.preco_sugerido
        precoSugeridoMeta = sol.preco_sugerido
        convergiuMeta = sol.convergiu
      } else if (modoCalculo === 'meta_margem') {
        const sol = resolverPrecoParaMeta(cenarioBase, 'margem_pct', metaMargemPct)
        precoColuna = sol.preco_sugerido
        precoSugeridoMeta = sol.preco_sugerido
        convergiuMeta = sol.convergiu
      }

      // Recalcular demonstrativo final para o preço resolvido
      const demonstrativoFinal = calcularDemonstrativo({
        ...cenarioBase,
        preco_anunciado: precoColuna,
      })

      // Ponto de equilíbrio
      const eqSol = resolverPrecoParaMeta(cenarioBase, 'equilibrio', 0)

      res[modId] = {
        demonstrativo: demonstrativoFinal,
        precoAnunciado: precoColuna,
        modalidade: col.modalidade,
        canal,
        taxas: col.taxasDoCanal,
        precoSugeridoEquilibrio: eqSol.preco_sugerido,
        precoSugeridoMeta,
        convergiuMeta,
      }
    }

    return res
  }, [
    produtoAtual,
    custoBaseAtual,
    colunasModalidade,
    valorPrecoGlobal,
    modoCalculo,
    precosPorColuna,
    descontosPorColuna,
    metaLucroReais,
    metaMargemPct,
    aliquotaDas,
    aliquotaIcms,
    dasImpostoMes,
    pedidosMes,
  ])

  // Encontrar o canal mais rentável (com premissas completas)
  const melhorCenario = useMemo(() => {
    let melhorModId: string | null = null
    let maiorLucro = -Infinity

    for (const [modId, item] of Object.entries(demonstrativosPorColuna)) {
      if (!colunasAtivas[modId]) continue
      // Não considerar cenários incompletos ou inválidos como mais lucrativos
      if (!item.demonstrativo.valido || item.demonstrativo.preco_anunciado <= 0) continue

      if (item.demonstrativo.lucro_liquido > maiorLucro) {
        maiorLucro = item.demonstrativo.lucro_liquido
        melhorModId = modId
      }
    }

    return melhorModId
  }, [demonstrativosPorColuna, colunasAtivas])

  // Salvar Cenário de Simulação
  async function handleSalvarCenario(modId: string, aprovar = false) {
    if (!produtoAtual) return
    const colData = demonstrativosPorColuna[modId]
    if (!colData) return

    try {
      setSalvando(true)
      const dem = colData.demonstrativo

      const record = await precificacaoService.saveCenarioPrecificacao({
        produto: produtoAtual.id,
        empresa: produtoAtual.empresa,
        canal: colData.canal.id,
        modalidade: modId,
        premissas: {
          preco_venda: dem.preco_anunciado,
          aliquota_das_pct: aliquotaDas,
          aliquota_icms_pct: aliquotaIcms,
        },
        resultado: dem as unknown as Record<string, unknown>,
        status: aprovar ? 'aprovada' : 'rascunho',
        custo_snapshot: {
          custo_total: dem.custo_total_produto,
          atualizado_em: new Date().toISOString(),
        },
        taxas_snapshot: {
          taxas_count: colData.taxas.length,
          atualizado_em: new Date().toISOString(),
        },
        preco_aprovado: aprovar ? dem.preco_anunciado : undefined,
      })

      if (aprovar && user?.id) {
        await precificacaoService.aprovarPreco(record.id, dem.preco_anunciado, user.id)
      }

      toast({
        title: aprovar ? 'Preço Aprovado!' : 'Cenário Salvo com Sucesso',
        description: `${produtoAtual.nome} em ${colData.canal.nome} (${colData.modalidade.nome}) registrado como ${aprovar ? 'aprovado' : 'rascunho'}.`,
      })
    } catch (err) {
      console.error('Erro ao salvar cenário:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o cenário no banco de dados.',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Comparação entre dois canais escolhidos (Diff A x B)
  const calculoDiff = useMemo(() => {
    if (!colunaDiffA || !colunaDiffB) return null
    const a = demonstrativosPorColuna[colunaDiffA]
    const b = demonstrativosPorColuna[colunaDiffB]
    if (!a || !b) return null

    const lucroDiff = a.demonstrativo.lucro_liquido - b.demonstrativo.lucro_liquido
    const margemDiff = a.demonstrativo.margem_liquida_pct - b.demonstrativo.margem_liquida_pct

    return {
      a,
      b,
      lucroDiff,
      margemDiff,
    }
  }, [demonstrativosPorColuna, colunaDiffA, colunaDiffB])

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Comparador de Preços Lado a Lado"
        subtitulo="Simulação comparativa espelho da planilha de custos, com demonstrativo auditável por canal de venda"
        acoes={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPrecosPorColuna({})
                setDescontosPorColuna({})
                setValorPrecoGlobal(24.9)
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Resetar Premissas
            </Button>
          </div>
        }
      />

      {/* Seleção do SKU / Produto Base */}
      <Card className="border-border bg-white shadow-xs">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Selecione o Produto / SKU para Estudo
              </Label>
              <div className="flex items-center gap-3">
                <div className="w-full max-w-md">
                  <Select
                    value={selectedProdutoId}
                    onValueChange={(val) => {
                      setSelectedProdutoId(val)
                      const p = produtos.find((x) => x.id === val)
                      if (p) setSearchParams({ sku: p.sku })
                    }}
                  >
                    <SelectTrigger className="font-bold text-sm h-10">
                      <SelectValue placeholder="Selecione um produto..." />
                    </SelectTrigger>
                    <SelectContent>
                      {produtos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="font-mono font-bold text-primary mr-2">[{p.sku}]</span>
                          <span>{p.nome}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {produtoAtual && (
                  <Badge variant="outline" className="h-7 px-2 font-mono text-xs">
                    {produtoAtual.tipo.replace('_', ' ')}
                  </Badge>
                )}
              </div>
            </div>

            {/* Controle de Modo de Simulação */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-secondary/40 p-2.5 rounded-xl border border-border">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-muted-foreground uppercase">
                  Modo de Simulação
                </Label>
                <Tabs
                  value={modoCalculo}
                  onValueChange={(v) => setModoCalculo(v as typeof modoCalculo)}
                  className="w-auto"
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="mesmo_preco" className="text-xs px-2.5">
                      Mesmo Preço
                    </TabsTrigger>
                    <TabsTrigger value="meta_lucro" className="text-xs px-2.5">
                      Meta Lucro R$
                    </TabsTrigger>
                    <TabsTrigger value="meta_margem" className="text-xs px-2.5">
                      Meta Margem %
                    </TabsTrigger>
                    <TabsTrigger value="manual" className="text-xs px-2.5">
                      Manual
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Valor de Entrada do Modo */}
              <div className="w-28 space-y-1">
                <Label className="text-[11px] font-bold text-muted-foreground uppercase">
                  {modoCalculo === 'mesmo_preco'
                    ? 'Preço (R$)'
                    : modoCalculo === 'meta_lucro'
                      ? 'Meta Lucro (R$)'
                      : modoCalculo === 'meta_margem'
                        ? 'Meta Margem (%)'
                        : 'Preço Base'}
                </Label>
                <Input
                  type="number"
                  step="0.10"
                  className="h-8 text-xs font-bold"
                  value={
                    modoCalculo === 'mesmo_preco' || modoCalculo === 'manual'
                      ? valorPrecoGlobal
                      : modoCalculo === 'meta_lucro'
                        ? metaLucroReais
                        : metaMargemPct
                  }
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    if (modoCalculo === 'mesmo_preco' || modoCalculo === 'manual') {
                      setValorPrecoGlobal(val)
                    } else if (modoCalculo === 'meta_lucro') {
                      setMetaLucroReais(val)
                    } else {
                      setMetaMargemPct(val)
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Painel Horizontal com Coluna Fixa do Produto + Colunas Rolantes dos Canais */}
      {!produtoAtual ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum produto cadastrado para precificar.
        </Card>
      ) : (
        <div className="flex flex-col lg:flex-row items-stretch gap-4 overflow-hidden">
          {/* ========================================================
              COLUNA FIXA DO PRODUTO (ESPELHO DA PLANILHA DO USUÁRIO)
              ======================================================== */}
          <div className="w-full lg:w-[320px] shrink-0 space-y-3">
            <Card className="h-full border-primary/30 shadow-xs bg-white flex flex-col justify-between">
              <CardHeader className="bg-primary/5 pb-3 border-b border-primary/10">
                <div className="flex items-center justify-between">
                  <Badge className="bg-primary text-white font-mono text-[10px]">
                    PRODUTO FIXO
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">
                    SKU: {produtoAtual.sku}
                  </span>
                </div>
                <CardTitle className="text-base font-extrabold text-foreground line-clamp-1 mt-1">
                  {produtoAtual.nome}
                </CardTitle>
                <CardDescription className="text-xs">
                  {produtoAtual.expand?.empresa?.nome_fantasia || 'Empresa Própria'}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4 space-y-4 text-xs flex-1">
                {/* Imagem do Produto */}
                <div className="h-36 w-full rounded-xl bg-secondary/60 border border-border flex items-center justify-center overflow-hidden">
                  {produtoAtual.imagem ? (
                    <img
                      src={`${import.meta.env.VITE_POCKETBASE_URL || ''}/api/files/prec_produtos/${produtoAtual.id}/${produtoAtual.imagem}`}
                      alt={produtoAtual.nome}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="text-center p-3 text-muted-foreground">
                      <Layers className="h-8 w-8 mx-auto text-muted-foreground/40 mb-1" />
                      <span className="text-[11px]">Sem foto anexada</span>
                    </div>
                  )}
                </div>

                {/* Composição / Custo Direto (C0..C12) */}
                <div className="space-y-1.5 border-t border-border pt-3">
                  <div className="flex justify-between items-center text-[11px] font-bold text-muted-foreground uppercase">
                    <span>Composição de Custo</span>
                    <span>Valor R$</span>
                  </div>

                  {produtoAtual.tipo === 'fabricacao_propria' ? (
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                      {(produtoAtual.composicao || []).map((c, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center text-[11px] py-0.5 border-b border-border/30"
                        >
                          <span className="truncate max-w-[170px] text-foreground">
                            <span className="font-mono text-primary font-bold mr-1">
                              {c.codigo || `C${idx}`}
                            </span>
                            {c.descricao}
                          </span>
                          <span className="font-mono font-medium">
                            {formatCurrency(c.qtd * c.custo_unitario)}
                          </span>
                        </div>
                      ))}
                      {(produtoAtual.composicao || []).length === 0 && (
                        <p className="text-[11px] text-muted-foreground italic py-1">
                          Nenhum insumo C0..C12 informado
                        </p>
                      )}
                    </div>
                  ) : produtoAtual.tipo === 'revenda' ? (
                    <div className="py-1 space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span>Custo Aquisição:</span>
                        <span className="font-mono font-bold">
                          {formatCurrency(produtoAtual.custo_aquisicao_unitario || 0)}
                        </span>
                      </div>
                      {(produtoAtual.despesas_compra || []).map((d, i) => (
                        <div
                          key={i}
                          className="flex justify-between text-[10px] text-muted-foreground"
                        >
                          <span>{d.descricao}:</span>
                          <span className="font-mono">{formatCurrency(d.valor)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">
                      Kit com múltiplos itens agregados
                    </p>
                  )}
                </div>

                {/* Custos Adicionais: Embalagem + Etiqueta + Perda */}
                <div className="space-y-1 bg-secondary/30 p-2.5 rounded-lg border border-border/60">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Embalagem:</span>
                    <span className="font-mono">
                      {formatCurrency(produtoAtual.custo_adicional_embalagem || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Etiqueta:</span>
                    <span className="font-mono">
                      {formatCurrency(produtoAtual.custo_etiqueta || 0)}
                    </span>
                  </div>
                  {Boolean(produtoAtual.perda_pct) && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Perda (%):</span>
                      <span className="font-mono">{produtoAtual.perda_pct}%</span>
                    </div>
                  )}
                  {Boolean(produtoAtual.peso_g) && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Peso:</span>
                      <span className="font-mono">{produtoAtual.peso_g}g</span>
                    </div>
                  )}
                </div>

                {/* Custo Total Final do Produto */}
                <div className="rounded-xl bg-primary text-white p-3 flex justify-between items-center shadow-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider block opacity-90">
                      Custo Total Produto
                    </span>
                    <span className="text-lg font-black font-mono">
                      {formatCurrency(custoBaseAtual?.custo_total || 0)}
                    </span>
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-white/20 text-white border-0 text-[10px]"
                  >
                    Calculado
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ========================================================
              COLUNAS DOS CANAIS / MARKETPLACES (ROLAGEM HORIZONTAL)
              ======================================================== */}
          <div className="flex-1 overflow-x-auto pb-4 scrollbar-thin">
            <div className="flex items-stretch gap-4 min-w-max">
              {colunasModalidade.map((col) => {
                const modId = col.modalidade.id
                const cenario = demonstrativosPorColuna[modId]
                if (!cenario) return null

                const dem = cenario.demonstrativo
                const isMelhor = melhorCenario === modId
                const lucroNegativo = dem.lucro_liquido < 0

                return (
                  <Card
                    key={modId}
                    className={`w-[290px] shrink-0 border flex flex-col justify-between transition-shadow shadow-xs ${
                      isMelhor
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                        : lucroNegativo
                          ? 'border-red-300 bg-red-50/10'
                          : 'border-border'
                    }`}
                  >
                    {/* Header da Coluna com o Canal */}
                    <CardHeader
                      className="p-3 border-b border-border/80"
                      style={{
                        backgroundColor: col.canal.cor ? `${col.canal.cor}12` : '#f4f4f5',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="secondary"
                          className="font-bold text-[10px] px-2"
                          style={{
                            color: col.canal.cor || 'inherit',
                            borderColor: col.canal.cor || 'transparent',
                          }}
                        >
                          {col.canal.nome}
                        </Badge>
                        {isMelhor && (
                          <Badge className="bg-emerald-600 text-white text-[9px] font-bold">
                            Maior Lucro
                          </Badge>
                        )}
                        {dem.incompleto && (
                          <Badge variant="destructive" className="text-[9px]">
                            Pendente Conf.
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-sm font-bold text-foreground mt-1 truncate">
                        {col.modalidade.nome}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>Recebimento: {col.modalidade.prazo_recebimento_dias || 0} dias</span>
                      </div>
                    </CardHeader>

                    {/* Corpo Auditável da Coluna */}
                    <CardContent className="p-3 space-y-3 text-xs flex-1">
                      {/* Preço Anunciado */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <Label className="text-[11px] font-bold text-muted-foreground uppercase">
                            Preço Anunciado
                          </Label>
                          {modoCalculo !== 'mesmo_preco' && (
                            <span className="text-[10px] text-primary font-bold">
                              {modoCalculo === 'meta_lucro' || modoCalculo === 'meta_margem'
                                ? 'Calculado p/ meta'
                                : 'Manual'}
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.10"
                            disabled={modoCalculo === 'mesmo_preco'}
                            className="font-mono font-bold text-sm h-9 bg-white"
                            value={cenario.precoAnunciado}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0
                              setPrecosPorColuna((prev) => ({ ...prev, [modId]: v }))
                            }}
                          />
                        </div>
                      </div>

                      {/* Preço Pago pelo Cliente (após descontos) */}
                      <div className="bg-secondary/40 p-2 rounded-lg flex justify-between items-center text-[11px]">
                        <span className="text-muted-foreground font-medium">Preço Cliente:</span>
                        <span className="font-mono font-bold text-foreground">
                          {formatCurrency(dem.preco_pago_cliente)}
                        </span>
                      </div>

                      {/* Taxas do Canal (Linha a Linha Auditável) */}
                      <div className="space-y-1 border-t border-border/80 pt-2">
                        <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase">
                          <span>Taxas & Comissões</span>
                          <span>Retenção</span>
                        </div>

                        <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5 scrollbar-thin">
                          {dem.linhas_taxas.map((tx, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center text-[11px] py-0.5 border-b border-border/20"
                            >
                              <div className="truncate max-w-[160px]">
                                <span className="font-medium text-foreground block truncate">
                                  {tx.nome}
                                </span>
                                <span className="text-[9px] text-muted-foreground">
                                  {tx.tipo_valor === 'percentual'
                                    ? `${tx.aliquota_ou_fixo}% sobre ${tx.base_nome}`
                                    : `R$ ${tx.aliquota_ou_fixo.toFixed(2)} fixo`}
                                </span>
                              </div>
                              <span className="font-mono text-red-600 font-semibold">
                                -{formatCurrency(tx.valor_calculado)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center text-[11px] font-bold pt-1">
                          <span>Total Retido Canal:</span>
                          <span className="font-mono text-red-600">
                            -{formatCurrency(dem.total_taxas_retidas_canal)}
                          </span>
                        </div>
                      </div>

                      {/* Valor a Receber da Plataforma */}
                      <div className="bg-blue-50/70 border border-blue-200 p-2 rounded-lg flex justify-between items-center text-[11px]">
                        <span className="text-blue-900 font-bold">A Receber Canal:</span>
                        <span className="font-mono font-black text-blue-950 text-sm">
                          {formatCurrency(dem.valor_receber_canal)}
                        </span>
                      </div>

                      {/* Impostos / Tributos Declarados */}
                      <div className="space-y-1 border-t border-border/80 pt-2 text-[11px]">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Tributos ({dem.aliquota_imposto_efetiva_pct}%):</span>
                          <span className="font-mono text-red-600">
                            -{formatCurrency(dem.total_tributos)}
                          </span>
                        </div>
                        {dem.rateio_fixo_imposto_mes > 0 && (
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Rateio MEI/fixo ({pedidosMes} ped):</span>
                            <span className="font-mono">
                              -{formatCurrency(dem.rateio_fixo_imposto_mes)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-muted-foreground">
                          <span>Custo do Produto:</span>
                          <span className="font-mono text-red-600">
                            -{formatCurrency(dem.custo_total_produto)}
                          </span>
                        </div>
                      </div>

                      {/* RESULTADO FINAL DO CANAL: LUCRO E MARGEM */}
                      <div
                        className={`p-3 rounded-xl border ${
                          lucroNegativo
                            ? 'bg-red-50 border-red-300 text-red-950'
                            : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        }`}
                      >
                        <div className="flex justify-between items-baseline">
                          <span className="text-[10px] uppercase font-bold tracking-wider">
                            Lucro Líquido:
                          </span>
                          <span
                            className={`text-lg font-black font-mono ${
                              lucroNegativo ? 'text-red-700' : 'text-emerald-700'
                            }`}
                          >
                            {formatCurrency(dem.lucro_liquido)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] mt-1 pt-1 border-t border-black/5 font-semibold">
                          <span>Margem Líquida:</span>
                          <span className={lucroNegativo ? 'text-red-700' : 'text-emerald-700'}>
                            {dem.margem_liquida_pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-0.5">
                          <span>Markup / Custo:</span>
                          <span>{dem.markup_sobre_custo_pct.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                          <span>Pto. Equilíbrio:</span>
                          <span className="font-mono">
                            {formatCurrency(cenario.precoSugeridoEquilibrio)}
                          </span>
                        </div>
                      </div>

                      {/* Selo de Conferência */}
                      {col.taxasDoCanal.some(
                        (t) => t.status_conferencia === 'pendente_conferencia',
                      ) && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[10px] text-amber-800 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span>Taxas da planilha (pendentes de conferência)</span>
                        </div>
                      )}

                      {/* Botões de Ação na Coluna */}
                      <div className="pt-2 flex flex-col gap-1.5">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                          disabled={salvando || !dem.valido}
                          onClick={() => handleSalvarCenario(modId, true)}
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          Aprovar Preço Canal
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-full text-[11px] border-border text-muted-foreground"
                          disabled={salvando}
                          onClick={() => handleSalvarCenario(modId, false)}
                        >
                          <Save className="mr-1 h-3 w-3" />
                          Salvar Rascunho
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TABELA COMPARATIVA CONSOLIDADA (ABAIXO DAS COLUNAS)
          ======================================================== */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-2">
          <div>
            <CardTitle className="text-base font-bold">
              Tabela Comparativa Geral por Canal & Modalidade
            </CardTitle>
            <CardDescription>
              Comparativo direto de lucro, margem e preço de equilíbrio para o SKU{' '}
              {produtoAtual?.sku}
            </CardDescription>
          </div>

          {/* Seletor de Comparação entre 2 canais (Diff R$ e p.p.) */}
          {colunasModalidade.length >= 2 && (
            <div className="flex items-center gap-2 text-xs bg-secondary/50 p-1.5 rounded-lg border border-border">
              <span className="font-semibold text-muted-foreground">Comparar:</span>
              <Select value={colunaDiffA} onValueChange={setColunaDiffA}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colunasModalidade.map((c) => (
                    <SelectItem key={c.modalidade.id} value={c.modalidade.id}>
                      {c.canal.nome} - {c.modalidade.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="font-bold">vs</span>
              <Select value={colunaDiffB} onValueChange={setColunaDiffB}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colunasModalidade.map((c) => (
                    <SelectItem key={c.modalidade.id} value={c.modalidade.id}>
                      {c.canal.nome} - {c.modalidade.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>

        {/* Destaque da Diferença entre Canal A e Canal B */}
        {calculoDiff && (
          <div className="mx-6 mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">
                Diferença ({calculoDiff.a.canal.nome} vs {calculoDiff.b.canal.nome}):
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-muted-foreground mr-1.5">Spread de Lucro:</span>
                <span
                  className={`font-black font-mono ${
                    calculoDiff.lucroDiff >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {calculoDiff.lucroDiff >= 0 ? '+' : ''}
                  {formatCurrency(calculoDiff.lucroDiff)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground mr-1.5">Spread de Margem:</span>
                <span
                  className={`font-black ${
                    calculoDiff.margemDiff >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {calculoDiff.margemDiff >= 0 ? '+' : ''}
                  {calculoDiff.margemDiff.toFixed(2)} p.p.
                </span>
              </div>
            </div>
          </div>
        )}

        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-y border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-4 font-bold">Canal / Modalidade</th>
                <th className="py-2.5 px-3 font-bold text-right">Preço Anunc.</th>
                <th className="py-2.5 px-3 font-bold text-right">Preço Cliente</th>
                <th className="py-2.5 px-3 font-bold text-right">Taxas Retidas</th>
                <th className="py-2.5 px-3 font-bold text-right">A Receber</th>
                <th className="py-2.5 px-3 font-bold text-right">Custo Total</th>
                <th className="py-2.5 px-3 font-bold text-right">Tributos</th>
                <th className="py-2.5 px-3 font-bold text-right">Lucro R$</th>
                <th className="py-2.5 px-3 font-bold text-right">Margem %</th>
                <th className="py-2.5 px-3 font-bold text-right">Pto. Equilíbrio</th>
                <th className="py-2.5 px-3 font-bold text-center">Prazo</th>
                <th className="py-2.5 px-4 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {colunasModalidade.map((col) => {
                const modId = col.modalidade.id
                const cenario = demonstrativosPorColuna[modId]
                if (!cenario) return null

                const dem = cenario.demonstrativo
                const isMelhor = melhorCenario === modId
                const lucroNegativo = dem.lucro_liquido < 0

                return (
                  <tr
                    key={modId}
                    className={`hover:bg-secondary/20 transition-colors ${
                      isMelhor ? 'bg-emerald-50/40 font-semibold' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{col.canal.nome}</span>
                        <span className="text-muted-foreground">({col.modalidade.nome})</span>
                        {isMelhor && (
                          <Badge className="bg-emerald-600 text-white text-[9px] h-4 px-1.5">
                            Melhor
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold">
                      {formatCurrency(dem.preco_anunciado)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                      {formatCurrency(dem.preco_pago_cliente)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-red-600">
                      -{formatCurrency(dem.total_taxas_retidas_canal)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-blue-900">
                      {formatCurrency(dem.valor_receber_canal)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                      {formatCurrency(dem.custo_total_produto)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                      {formatCurrency(dem.total_tributos)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono font-black ${
                        lucroNegativo ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(dem.lucro_liquido)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-bold ${
                        lucroNegativo ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {dem.margem_liquida_pct.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                      {formatCurrency(cenario.precoSugeridoEquilibrio)}
                    </td>
                    <td className="py-3 px-3 text-center text-muted-foreground">
                      {col.modalidade.prazo_recebimento_dias || 0}d
                    </td>
                    <td className="py-3 px-4 text-center">
                      {dem.incompleto ? (
                        <Badge
                          variant="outline"
                          className="text-amber-600 border-amber-300 text-[10px]"
                        >
                          Pendente
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-emerald-600 border-emerald-300 text-[10px]"
                        >
                          Auditado
                        </Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
