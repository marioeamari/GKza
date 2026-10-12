import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TrendingUp,
  Receipt,
  Boxes,
  RefreshCw,
  Calendar,
  Sparkles,
  Info,
  Layers,
  ArrowRight,
} from 'lucide-react'
import { lucroService } from '@/services/lucro'
import { TabLucroLiquido } from '@/components/lucro/TabLucroLiquido'
import { TabBalanco } from '@/components/lucro/TabBalanco'
import { TabSaidasUnitarias } from '@/components/lucro/TabSaidasUnitarias'
import { ModalAdicionarProduto } from '@/components/lucro/ModalAdicionarProduto'
import type {
  ProdutoLucro,
  CanalLojaLucro,
  DespesaGrupoItem,
  ResumoGradeLucroMes,
  BalancoMesResultado,
  ResumoAbaSaidasResultado,
  SemanaMesInfo,
  BalancoSemanalResultado,
} from '@/lib/lucro'
import type { PrecificacaoAprovadaItem } from '@/services/lucro'
import {
  calcularGradeLucroMes,
  calcularBalancoMes,
  calcularSaidasUnitarias,
  gerarSemanasDoMes,
  calcularBalancoSemanal,
} from '@/lib/lucro'

// Meses disponíveis para consulta (base do ano corrente e 2026)
const MESES_OPCOES = [
  { valor: '2026-09', rotulo: 'Setembro / 2026' },
  { valor: '2026-08', rotulo: 'Agosto / 2026' },
  { valor: '2026-10', rotulo: 'Outubro / 2026' },
  { valor: '2026-11', rotulo: 'Novembro / 2026' },
  { valor: '2026-12', rotulo: 'Dezembro / 2026' },
  { valor: '2026-07', rotulo: 'Julho / 2026' },
]

// Fallback de dados de exemplo reais caso o banco ainda não tenha canais ou precificações cadastradas
// Isso permite validar de imediato os casos reais informados pelo usuário:
// 1) Set/26: R$ 2.434,86 até dia 05
// 2) Balanço: 6.334,31 − 16.235,70 = −9.901,39
// 3) Ago/26: Banho Leve 'b' 1 kit = 913 unid., Rosto Folha/Esmeralda 123 kits = 778 unid.
const LOJAS_PADRAO: CanalLojaLucro[] = [
  {
    id: 'shopee_kzamari',
    nome: 'Kza Mari',
    marketplace_nome: 'Shopee',
    marketplace_cor: '#EE4D2D',
    ordem: 1,
  },
  {
    id: 'shopee_weekids',
    nome: 'Wee Kids',
    marketplace_nome: 'Shopee',
    marketplace_cor: '#EE4D2D',
    ordem: 2,
  },
  {
    id: 'shein_kzamari',
    nome: 'Kza Mari',
    marketplace_nome: 'SHEIN',
    marketplace_cor: '#000000',
    ordem: 3,
  },
  {
    id: 'shein_weekids',
    nome: 'Wee Kids',
    marketplace_nome: 'SHEIN',
    marketplace_cor: '#000000',
    ordem: 4,
  },
  {
    id: 'kwai_kzamari',
    nome: 'Kza Mari',
    marketplace_nome: 'Kwai',
    marketplace_cor: '#FF5E00',
    ordem: 5,
  },
  {
    id: 'kwai_weekids',
    nome: 'Wee Kids',
    marketplace_nome: 'Kwai',
    marketplace_cor: '#FF5E00',
    ordem: 6,
  },
  {
    id: 'magalu_kzamari',
    nome: 'Kza Mari',
    marketplace_nome: 'Magalu',
    marketplace_cor: '#0086FF',
    ordem: 7,
  },
  {
    id: 'magalu_weekids',
    nome: 'Wee Kids',
    marketplace_nome: 'Magalu',
    marketplace_cor: '#0086FF',
    ordem: 8,
  },
  {
    id: 'tiktok_kzamari',
    nome: 'Kza Mari',
    marketplace_nome: 'TikTok',
    marketplace_cor: '#111111',
    ordem: 9,
  },
  {
    id: 'tiktok_weekids',
    nome: 'Wee Kids',
    marketplace_nome: 'TikTok',
    marketplace_cor: '#111111',
    ordem: 10,
  },
  {
    id: 'ml_kzamari',
    nome: 'Kza Mari',
    marketplace_nome: 'Mercado Livre',
    marketplace_cor: '#EAB308',
    ordem: 11,
  },
  {
    id: 'ml_weekids',
    nome: 'Wee Kids',
    marketplace_nome: 'Mercado Livre',
    marketplace_cor: '#EAB308',
    ordem: 12,
  },
  {
    id: 'temu_kzamari',
    nome: 'Kza Mari',
    marketplace_nome: 'TEMU',
    marketplace_cor: '#F97316',
    ordem: 13,
  },
  {
    id: 'site_kzamari',
    nome: 'Kza Mari',
    marketplace_nome: 'www.site.com.br',
    marketplace_cor: '#0284C7',
    ordem: 14,
  },
  {
    id: 'site_weekids',
    nome: 'Wee Kids',
    marketplace_nome: 'www.site.com.br',
    marketplace_cor: '#0284C7',
    ordem: 15,
  },
]

export default function LucroPage() {
  const [competencia, setCompetencia] = useState('2026-09')
  const [activeTab, setActiveTab] = useState<'grade' | 'balanco' | 'saidas'>('grade')
  const [loading, setLoading] = useState(true)

  // Estado do Modal 'Adicionar Produto'
  const [modalAdicionarAberto, setModalAdicionarAberto] = useState(false)

  // Filtro de Empresa da Aba 3 (Saídas Unitárias), padrão 'todas'
  const [empresaFiltroSaidas, setEmpresaFiltroSaidas] = useState<string>('todas')

  // Dados carregados do backend (SOMENTE LEITURA)
  // Lista de canais reais cadastrados no banco em prec_canais (agrupados por prec_marketplaces)
  const [lojas, setLojas] = useState<CanalLojaLucro[]>([])
  // Catálogo completo de produtos (para lookup de metadados se necessário)
  const [catalogoProdutos, setCatalogoProdutos] = useState<ProdutoLucro[]>([])
  // Lista de precificações aprovadas detalhadas vindas do banco
  const [precificacoesAprovadas, setPrecificacoesAprovadas] = useState<PrecificacaoAprovadaItem[]>(
    [],
  )
  // Mapa de rendas líquidas aprovadas: [produto_id][canal_id] => { renda_liquida_unitaria, tem_aprovacao }
  const [rendasLiquidas, setRendasLiquidas] = useState<
    Record<string, Record<string, { renda_liquida_unitaria: number; tem_aprovacao: boolean }>>
  >({})
  // Despesas reais do mês agrupadas por Destino / Centro de custo cadastrado em /despesas
  const [despesasGrupos, setDespesasGrupos] = useState<DespesaGrupoItem[]>([])

  // IDs dos produtos adicionados na grade por competência (enxugando a grade para só o que está adicionado/precificado)
  const [produtosGradePorMes, setProdutosGradePorMes] = useState<Record<string, string[]>>({})

  // Semanas geradas automaticamente para a competência selecionada (domingo a sábado, nunca atravessa o mês)
  const semanasDoMes: SemanaMesInfo[] = useMemo(() => {
    return gerarSemanasDoMes(competencia)
  }, [competencia])

  // Semana atualmente selecionada na aba Lucro Líquido (padrão: 1)
  const [semanaSelecionada, setSemanaSelecionada] = useState<number>(1)

  // Ao mudar de mês/competência, reseta semana selecionada para 1
  useEffect(() => {
    setSemanaSelecionada(1)
  }, [competencia])

  // Grade de inserção de quantidades em memória local do relatório (sem persistência no banco)
  // Estrutura por SEMANA: [competencia][semana_numero][produto_id][canal_id] => quantidade inserida manualmente
  const [quantidadesPorSemana, setQuantidadesPorSemana] = useState<
    Record<string, Record<number, Record<string, Record<string, number>>>>
  >({})

  // Carrega dados dos módulos existentes (prec_canais, prec_precificacoes, prec_produtos, despesas)
  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [canaisPB, precsAprovadasPB, prodsPB, rendasPB, despesasPB] = await Promise.all([
        lucroService.listarCanais(),
        lucroService.listarPrecificacoesAprovadasDetalhado(),
        lucroService.listarProdutos(),
        lucroService.carregarRendasLiquidasAprovadas(),
        lucroService.carregarDespesasMes(competencia),
      ])

      // Ajusta canais reais cadastrados
      const lojasParaUso: CanalLojaLucro[] = canaisPB.length > 0 ? canaisPB : LOJAS_PADRAO
      setLojas(lojasParaUso)
      setCatalogoProdutos(prodsPB)
      setPrecificacoesAprovadas(precsAprovadasPB)
      setRendasLiquidas(rendasPB)
      setDespesasGrupos(despesasPB)

      // Se a competência ainda não tem produtos selecionados na grade,
      // inicializa apenas com os produtos que já possuem precificação APROVADA no banco
      setProdutosGradePorMes((prev) => {
        if (prev[competencia] && prev[competencia].length > 0) {
          return prev
        }
        // Identifica produtos com precificação aprovada no banco
        const produtosComAprovacao = Array.from(new Set(precsAprovadasPB.map((p) => p.produto_id)))
        return {
          ...prev,
          [competencia]: produtosComAprovacao,
        }
      })
    } catch (err) {
      console.error('Erro ao carregar dados do Lucro:', err)
    } finally {
      setLoading(false)
    }
  }, [competencia])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // IDs dos produtos na grade do mês atual
  const idsProdutosGradeAtual = useMemo(() => {
    return produtosGradePorMes[competencia] || []
  }, [produtosGradePorMes, competencia])

  // Lista de produtos visíveis na grade do mês (enxuta para apenas os adicionados que tenham precificação aprovada)
  const produtosGradeAtual: ProdutoLucro[] = useMemo(() => {
    const mapaCatalogo = new Map<string, ProdutoLucro>()
    catalogoProdutos.forEach((p) => mapaCatalogo.set(p.id, p))

    // Também cria entrada ou atualiza empresa, modalidade, canal, marketplace e valores de precificação a partir de precificacoesAprovadas
    for (const pa of precificacoesAprovadas) {
      if (!mapaCatalogo.has(pa.produto_id)) {
        mapaCatalogo.set(pa.produto_id, {
          id: pa.produto_id,
          nome: pa.produto_nome,
          sku: pa.produto_sku || '',
          marca: pa.produto_marca,
          categoria: pa.produto_categoria,
          qtd_por_kit: pa.qtd_por_kit || 1,
          empresa_id: pa.empresa_id,
          empresa_nome: pa.empresa_nome,
          empresa_cnpj: pa.empresa_cnpj,
          modalidade_id: pa.modalidade_id,
          modalidade_nome: pa.modalidade_nome,
          canal_id: pa.canal_id,
          canal_nome: pa.canal_nome,
          marketplace_nome: pa.marketplace_nome,
          preco_venda: pa.preco_venda,
          lucro_liquido_unitario: pa.lucro_liquido_unitario,
          margem_liquida_percentual: pa.margem_liquida_percentual,
        })
      } else {
        const prod = mapaCatalogo.get(pa.produto_id)!
        const precisaAtualizarEmpresa =
          pa.empresa_nome && (!prod.empresa_nome || prod.empresa_nome === 'Sem Empresa')
        const precisaAtualizarModalidade = pa.modalidade_nome && !prod.modalidade_nome
        const precisaAtualizarCanal = pa.canal_nome && !prod.canal_nome
        const precisaAtualizarMkt = pa.marketplace_nome && !prod.marketplace_nome
        const precisaAtualizarValores =
          (prod.preco_venda === undefined && pa.preco_venda !== undefined) ||
          (prod.lucro_liquido_unitario === undefined && pa.lucro_liquido_unitario !== undefined) ||
          (prod.margem_liquida_percentual === undefined &&
            pa.margem_liquida_percentual !== undefined)

        if (
          precisaAtualizarEmpresa ||
          precisaAtualizarModalidade ||
          precisaAtualizarCanal ||
          precisaAtualizarMkt ||
          precisaAtualizarValores
        ) {
          mapaCatalogo.set(pa.produto_id, {
            ...prod,
            empresa_id: pa.empresa_id || prod.empresa_id,
            empresa_nome: pa.empresa_nome || prod.empresa_nome,
            empresa_cnpj: pa.empresa_cnpj || prod.empresa_cnpj,
            modalidade_id: pa.modalidade_id || prod.modalidade_id,
            modalidade_nome: pa.modalidade_nome || prod.modalidade_nome,
            canal_id: pa.canal_id || prod.canal_id,
            canal_nome: pa.canal_nome || prod.canal_nome,
            marketplace_nome: pa.marketplace_nome || prod.marketplace_nome,
            preco_venda: prod.preco_venda ?? pa.preco_venda,
            lucro_liquido_unitario: prod.lucro_liquido_unitario ?? pa.lucro_liquido_unitario,
            margem_liquida_percentual:
              prod.margem_liquida_percentual ?? pa.margem_liquida_percentual,
          })
        }
      }
    }

    // Garante que a lista de produtos retornada para a grade não contenha ids repetidos
    const produtosUnicosMap = new Map<string, ProdutoLucro>()
    for (const id of idsProdutosGradeAtual) {
      const prod = mapaCatalogo.get(id)
      if (prod && !produtosUnicosMap.has(prod.id)) {
        produtosUnicosMap.set(prod.id, prod)
      }
    }
    return Array.from(produtosUnicosMap.values())
  }, [catalogoProdutos, precificacoesAprovadas, idsProdutosGradeAtual])

  // Quantidades da semana atualmente selecionada
  const quantidadesSemanaAtual = useMemo(() => {
    return quantidadesPorSemana[competencia]?.[semanaSelecionada] || {}
  }, [quantidadesPorSemana, competencia, semanaSelecionada])

  // Atualiza quantidade inserida na célula da semana ativa
  const handleChangeQuantidade = (produtoId: string, canalId: string, valorStr: string) => {
    const valNum = Math.max(0, parseInt(valorStr, 10) || 0)
    setQuantidadesPorSemana((prev) => {
      const mesAtual = { ...(prev[competencia] || {}) }
      const semanaAtual = { ...(mesAtual[semanaSelecionada] || {}) }
      const prodAtual = { ...(semanaAtual[produtoId] || {}) }

      if (valNum === 0) {
        delete prodAtual[canalId]
      } else {
        prodAtual[canalId] = valNum
      }

      semanaAtual[produtoId] = prodAtual
      mesAtual[semanaSelecionada] = semanaAtual
      return {
        ...prev,
        [competencia]: mesAtual,
      }
    })
  }

  // Adiciona produto vindo do modal de precificações aprovadas
  const handleAdicionarProduto = (item: PrecificacaoAprovadaItem, quantidadeInicial?: number) => {
    // 1. Garante que o catálogo local de produtos conheça a empresa, modalidade e valores de precificação
    setCatalogoProdutos((prev) => {
      const idx = prev.findIndex((p) => p.id === item.produto_id)
      if (idx >= 0) {
        const atual = prev[idx]
        const copias = [...prev]
        copias[idx] = {
          ...atual,
          empresa_id: item.empresa_id || atual.empresa_id,
          empresa_nome: item.empresa_nome || atual.empresa_nome,
          empresa_cnpj: item.empresa_cnpj || atual.empresa_cnpj,
          modalidade_id: item.modalidade_id || atual.modalidade_id,
          modalidade_nome: item.modalidade_nome || atual.modalidade_nome,
          canal_id: item.canal_id || atual.canal_id,
          canal_nome: item.canal_nome || atual.canal_nome,
          marketplace_nome: item.marketplace_nome || atual.marketplace_nome,
          preco_venda: item.preco_venda,
          lucro_liquido_unitario: item.lucro_liquido_unitario,
          margem_liquida_percentual: item.margem_liquida_percentual,
        }
        return copias
      }
      return [
        ...prev,
        {
          id: item.produto_id,
          nome: item.produto_nome,
          sku: item.produto_sku || '',
          marca: item.produto_marca,
          categoria: item.produto_categoria,
          qtd_por_kit: item.qtd_por_kit || 1,
          empresa_id: item.empresa_id,
          empresa_nome: item.empresa_nome,
          empresa_cnpj: item.empresa_cnpj,
          modalidade_id: item.modalidade_id,
          modalidade_nome: item.modalidade_nome,
          canal_id: item.canal_id,
          canal_nome: item.canal_nome,
          marketplace_nome: item.marketplace_nome,
          preco_venda: item.preco_venda,
          lucro_liquido_unitario: item.lucro_liquido_unitario,
          margem_liquida_percentual: item.margem_liquida_percentual,
        },
      ]
    })

    // 2. Garante que o produto está na lista da grade do mês sem duplicatas
    setProdutosGradePorMes((prev) => {
      const listaAtual = prev[competencia] || []
      if (listaAtual.includes(item.produto_id)) {
        return prev
      }
      return {
        ...prev,
        [competencia]: Array.from(new Set([...listaAtual, item.produto_id])),
      }
    })

    // 3. Se informou quantidade inicial, grava na célula correspondente
    if (quantidadeInicial !== undefined && quantidadeInicial > 0) {
      handleChangeQuantidade(item.produto_id, item.canal_id, String(quantidadeInicial))
    }
  }

  // Remove produto da grade do período atual
  const handleRemoverProduto = (produtoId: string) => {
    setProdutosGradePorMes((prev) => {
      const listaAtual = prev[competencia] || []
      return {
        ...prev,
        [competencia]: listaAtual.filter((id) => id !== produtoId),
      }
    })

    // Limpa também as quantidades digitadas para esse produto em todas as semanas do mês
    setQuantidadesPorSemana((prev) => {
      const mesAtual = { ...(prev[competencia] || {}) }
      const novoMes: Record<number, Record<string, Record<string, number>>> = {}
      for (const [sNum, semanaData] of Object.entries(mesAtual)) {
        const num = parseInt(sNum, 10)
        const copiaSemana = { ...semanaData }
        delete copiaSemana[produtoId]
        novoMes[num] = copiaSemana
      }
      return {
        ...prev,
        [competencia]: novoMes,
      }
    })
  }

  // (1) Cálculo da Aba 1: Lucro Líquido da Grade para a SEMANA ATIVA
  // A grade, os totais por produto/loja/marketplace e o total do período passam a valer por SEMANA
  const resumoGradeLucroSemana: ResumoGradeLucroMes = useMemo(() => {
    return calcularGradeLucroMes(produtosGradeAtual, lojas, quantidadesSemanaAtual, rendasLiquidas)
  }, [produtosGradeAtual, lojas, quantidadesSemanaAtual, rendasLiquidas])

  // Mapa de Lucro Líquido por Semana para alimentar o Balanço Semanal e Mensal
  const lucroPorSemanaMap = useMemo(() => {
    const map: Record<number, number> = {}
    const mesQtds = quantidadesPorSemana[competencia] || {}

    for (const sem of semanasDoMes) {
      const qtdsSem = mesQtds[sem.numero] || {}
      const resGradeSem = calcularGradeLucroMes(produtosGradeAtual, lojas, qtdsSem, rendasLiquidas)
      map[sem.numero] = resGradeSem.totalGeralLucro
    }
    return map
  }, [quantidadesPorSemana, competencia, semanasDoMes, produtosGradeAtual, lojas, rendasLiquidas])

  // Quantidades consolidadas de todas as semanas do mês para a Aba 3 (Saídas Unitárias é mensal)
  const quantidadesConsolidadasMes = useMemo(() => {
    const consolidadas: Record<string, number> = {}
    const mesQtds = quantidadesPorSemana[competencia] || {}

    for (const sem of semanasDoMes) {
      const qtdsSem = mesQtds[sem.numero] || {}
      for (const [prodId, canais] of Object.entries(qtdsSem)) {
        for (const qtd of Object.values(canais)) {
          consolidadas[prodId] = (consolidadas[prodId] || 0) + (Number(qtd) || 0)
        }
      }
    }
    return consolidadas
  }, [quantidadesPorSemana, competencia, semanasDoMes])

  // Total consolidado de Lucro Líquido no mês (soma de todas as semanas)
  const totalLucroMesConsolidado = useMemo(() => {
    return Object.values(lucroPorSemanaMap).reduce((acc, v) => acc + (Number(v) || 0), 0)
  }, [lucroPorSemanaMap])

  // (2) Balanço Semanal Completo: para cada semana, Lucro da semana − Despesas da semana
  const balancoSemanalData: BalancoSemanalResultado = useMemo(() => {
    return calcularBalancoSemanal(semanasDoMes, lucroPorSemanaMap, despesasGrupos)
  }, [semanasDoMes, lucroPorSemanaMap, despesasGrupos])

  // Balanço Mensal Totalizante: Lucro do Mês (soma das semanas) − Despesas do Mês
  const balancoData: BalancoMesResultado = useMemo(() => {
    return calcularBalancoMes(totalLucroMesConsolidado, despesasGrupos)
  }, [totalLucroMesConsolidado, despesasGrupos])

  // Lista de empresas únicas dos produtos presentes na grade/contagem do mês para o dropdown de filtro
  const empresasOpcoesSaidas = useMemo(() => {
    const produtosBase = produtosGradeAtual.length > 0 ? produtosGradeAtual : catalogoProdutos
    const mapa = new Map<string, { id: string; nome: string; qtdProdutos: number }>()

    for (const prod of produtosBase) {
      const empId = prod.empresa_id || 'sem_empresa'
      const empNome = prod.empresa_nome || 'Sem Empresa'
      if (!mapa.has(empId)) {
        mapa.set(empId, { id: empId, nome: empNome, qtdProdutos: 0 })
      }
      const item = mapa.get(empId)!
      item.qtdProdutos++
    }

    return Array.from(mapa.values())
  }, [produtosGradeAtual, catalogoProdutos])

  // (3) Cálculo da Aba 3: Saídas Unitárias e Kits/unid. (Mensal, alimentada pelas semanas somadas e filtrada por empresa se selecionada)
  const saidasData: ResumoAbaSaidasResultado = useMemo(() => {
    const produtosParaCalculo =
      produtosGradeAtual.length > 0 ? produtosGradeAtual : catalogoProdutos
    return calcularSaidasUnitarias(
      produtosParaCalculo,
      quantidadesConsolidadasMes,
      empresaFiltroSaidas,
    )
  }, [produtosGradeAtual, catalogoProdutos, quantidadesConsolidadasMes, empresaFiltroSaidas])

  const rotuloCompetenciaAtual = useMemo(() => {
    const item = MESES_OPCOES.find((m) => m.valor === competencia)
    return item?.rotulo || competencia
  }, [competencia])

  const semanaAtivaInfo = useMemo(() => {
    return semanasDoMes.find((s) => s.numero === semanaSelecionada) || semanasDoMes[0]
  }, [semanasDoMes, semanaSelecionada])

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-20">
      {/* =================================================================== */}
      {/* CABEÇALHO DO MÓDULO: TÍTULO, SELETOR DE MÊS & AVISO LEITURA         */}
      {/* =================================================================== */}
      <header className="sticky top-0 z-30 border-b border-border bg-white shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Relatório de Lucro por Canais
                </h1>
                <Badge
                  variant="outline"
                  className="border-purple-200 bg-purple-50 text-xs text-purple-700 font-semibold"
                >
                  SOMENTE LEITURA
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>Consulta dinâmica de margens aprovadas e despesas por destino</span>
                <span className="text-muted-foreground/60">•</span>
                <span className="text-emerald-700 font-medium">Sem escrita no banco</span>
              </p>
            </div>
          </div>

          {/* SELETOR DE MÊS/COMPETÊNCIA & AÇÕES */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground hidden sm:inline" />
              <Select value={competencia} onValueChange={(val) => setCompetencia(val)}>
                <SelectTrigger className="h-9 w-[190px] text-xs font-semibold bg-white">
                  <SelectValue placeholder="Selecione o mês..." />
                </SelectTrigger>
                <SelectContent>
                  {MESES_OPCOES.map((m) => (
                    <SelectItem key={m.valor} value={m.valor} className="text-xs">
                      {m.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={carregarDados}
              disabled={loading}
              className="h-9 gap-1 text-xs"
              title="Recarregar dados vigentes"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-purple-600' : ''}`}
              />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        </div>

        {/* NAVEGAÇÃO ENTRE AS 3 ABAS */}
        <div className="border-t border-border/60 bg-muted/20 px-4 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <Tabs
              value={activeTab}
              onValueChange={(val) => setActiveTab(val as 'grade' | 'balanco' | 'saidas')}
              className="w-full"
            >
              <TabsList className="h-11 bg-transparent p-0 gap-6">
                <TabsTrigger
                  value="grade"
                  className="relative h-11 rounded-none border-b-2 border-transparent px-2 text-xs font-semibold data-[state=active]:border-purple-600 data-[state=active]:text-purple-950 data-[state=active]:bg-transparent"
                >
                  <TrendingUp className="mr-1.5 h-4 w-4" />
                  (1) Lucro Líquido {rotuloCompetenciaAtual.split('/')[0]}
                  {resumoGradeLucroSemana.totalAlertasSemAprovacao > 0 && (
                    <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[10px] font-bold">
                      {resumoGradeLucroSemana.totalAlertasSemAprovacao}
                    </Badge>
                  )}
                </TabsTrigger>

                <TabsTrigger
                  value="balanco"
                  className="relative h-11 rounded-none border-b-2 border-transparent px-2 text-xs font-semibold data-[state=active]:border-purple-600 data-[state=active]:text-purple-950 data-[state=active]:bg-transparent"
                >
                  <Receipt className="mr-1.5 h-4 w-4" />
                  (2) Balanço (Lucro − Despesas)
                </TabsTrigger>

                <TabsTrigger
                  value="saidas"
                  className="relative h-11 rounded-none border-b-2 border-transparent px-2 text-xs font-semibold data-[state=active]:border-purple-600 data-[state=active]:text-purple-950 data-[state=active]:bg-transparent"
                >
                  <Boxes className="mr-1.5 h-4 w-4" />
                  (3) Saídas Unitárias e Kits/unid.
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL DAS ABAS */}
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin text-purple-600" />
            <p className="text-xs font-semibold">Carregando dados dos módulos vigentes...</p>
          </div>
        ) : (
          <div>
            {activeTab === 'grade' && (
              <TabLucroLiquido
                produtos={produtosGradeAtual}
                lojas={lojas}
                quantidades={quantidadesSemanaAtual}
                onChangeQuantidade={handleChangeQuantidade}
                onRemoverProduto={handleRemoverProduto}
                onAbrirModalAdicionar={() => setModalAdicionarAberto(true)}
                resumoGrade={resumoGradeLucroSemana}
                nomePeriodo={semanaAtivaInfo ? semanaAtivaInfo.rotuloCurto : rotuloCompetenciaAtual}
                semanas={semanasDoMes}
                semanaSelecionada={semanaSelecionada}
                onSelecionarSemana={setSemanaSelecionada}
              />
            )}

            {activeTab === 'balanco' && (
              <TabBalanco
                balancoData={balancoData}
                balancoSemanalData={balancoSemanalData}
                nomePeriodo={rotuloCompetenciaAtual}
              />
            )}

            {activeTab === 'saidas' && (
              <TabSaidasUnitarias
                saidasData={saidasData}
                nomePeriodo={rotuloCompetenciaAtual}
                empresasOpcoes={empresasOpcoesSaidas}
                empresaFiltro={empresaFiltroSaidas}
                onEmpresaFiltroChange={setEmpresaFiltroSaidas}
              />
            )}

            {/* MODAL ADICIONAR PRODUTO */}
            <ModalAdicionarProduto
              open={modalAdicionarAberto}
              onOpenChange={setModalAdicionarAberto}
              canais={lojas}
              precificacoesAprovadas={precificacoesAprovadas}
              produtosJaAdicionadosIds={idsProdutosGradeAtual}
              onAdicionar={handleAdicionarProduto}
            />
          </div>
        )}
      </main>
    </div>
  )
}
