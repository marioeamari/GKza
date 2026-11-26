import type { ItemComposicaoCusto } from '@/lib/precificacao/calculo'

/** As 7 etapas do trilho do painel de Triagem de Produtos (ordem fixa). */
export const ETAPAS_TRIAGEM = [
  'base',
  'composicao',
  'cenario',
  'aprovado',
  'matriz',
  'comercial',
  'lucro',
] as const

export type TriagemEtapaChave = (typeof ETAPAS_TRIAGEM)[number]

export type TriagemStatusEtapa = 'verde' | 'amarelo' | 'vermelho' | 'cinza'

export interface TriagemEtapaInfo {
  status: TriagemStatusEtapa
  rotulo: string
  /** Data (ISO) do evento que qualificou a etapa, quando houver. */
  quando?: string
}

export interface TriagemEtapaAvaliada extends TriagemEtapaInfo {
  chave: TriagemEtapaChave
  /** Dado real que qualificou a etapa (texto para a linha do tempo do detalhe). */
  dados?: Record<string, string>
}

export interface TriagemKitComponente {
  produto_id: string
  nome: string
  qtd: number
  temUsoComercial: boolean
}

export interface TriagemAvaliacao {
  produto: TriagemProdutoInput
  etapas: Record<TriagemEtapaChave, TriagemEtapaAvaliada>
  /** Última etapa com status verde (número de 1 a 7); 0 se nenhuma. */
  ultimaEtapaAlcancada?: number
  /** Primeira etapa pendente (número de 1 a 7). */
  parouNaEtapaNumero: number
  integrado: boolean
  /** "✅ 100% integrado" ou "⚠️ Parou na etapa X — <nome>" */
  selo: string
  /** "amarelo" quando o bloco da etapa pendente é amarelo (aviso), senão "vermelho". */
  severidadePendencia: 'amarelo' | 'vermelho'
  detalheKitComponentes?: TriagemKitComponente[]
  /** Etapas cinzas ("não se aplica / ainda sem uso") — só informativo. */
  etapasCinzas: TriagemEtapaChave[]
  /** Etapas amarelas (parciais/desatualizadas) — entram no selo de aviso. */
  etapasAmarelas: TriagemEtapaChave[]
}

export interface TriagemProdutoInput {
  id: string
  nome: string
  sku: string
  tipo: string
  categoria?: string
  status?: string
  imagem?: string
  /** id do registro de `produtos` que originou o espelho (legado: ausente).
   */
  origem_id?: string
  base_origem?: string
  fornecedor_produto?: string
  /**
   * Nome REAL do arquivo em produtos.imagem (registro de origem) — injetado
   * por services/triagem.ts. Difere de `imagem` (nome fabricado no espelho).
   */
  imagem_produtos?: string
  /** id do registro de fornecedores_produtos dono da foto física (injetado). */
  fornecedor_produto_id?: string
  /** Nome REAL do arquivo em fornecedores_produtos.imagem (injetado). */
  fornecedor_produto_imagem?: string
  created: string
  updated?: string
  composicao?: ItemComposicaoCusto[]
}

export interface TriagemCenarioInput {
  id: string
  produto: string
  canal: string
  status: string
  preco_aprovado?: number
  aprovado_em?: string
  updated?: string
  created?: string
  modalidade?: string
}

export interface TriagemOrcamentoInput {
  id: string
  codigo?: string
  cliente_nome?: string
  created?: string
  status?: string
}

export interface TriagemOrcamentoItemInput {
  id: string
  orcamento: string
  quantidade?: number
}

export interface TriagemMatrizInput {
  id: string
  canal: string
  legenda: string
  expand?: { legenda?: { ativo?: boolean; nome?: string } }
}

export interface TriagemFontes {
  /** produto comercial (prec_produtos) → registro de produto base */
  basePorOrigem: Map<string, { id: string; nome?: string }>
  /** id do canal → nome (para os rótulos "no canal X") */
  canalNome?: Map<string, string>
  /** id do produto comercial → nome (para os componentes do kit) */
  nomeProdutoPorId?: Map<string, string>
  /** produto comercial → seus cenários de precificação */
  cenariosPorProduto: Map<string, TriagemCenarioInput[]>
  /** produto comercial → classificações da matriz de canais */
  matrizPorProduto: Map<string, TriagemMatrizInput[]>
  /** produto comercial → itens de orçamento (via produto vinculado) */
  orcamentoItensPorProduto: Map<string, TriagemOrcamentoItemInput[]>
  /** orçamento → cabeçalho (para data e cliente) */
  orcamentosPorId: Map<string, TriagemOrcamentoInput>
  /** produto comercial (kit/combo) → configuração do kit (itens) */
  kitPorProdutoPai: Map<string, { itens?: Array<{ produto_id?: string; qtd?: number }> }>
}

const NOMES_ETAPA: Record<TriagemEtapaChave, string> = {
  base: 'Base',
  composicao: 'Composição',
  cenario: 'Cenário',
  aprovado: 'Aprovado',
  matriz: 'Matriz/Canais',
  comercial: 'Comercial',
  lucro: 'Lucro',
}

export function nomeEtapaTriagem(chave: TriagemEtapaChave): string {
  return NOMES_ETAPA[chave]
}

export function numeroEtapaTriagem(chave: TriagemEtapaChave): number {
  return ETAPAS_TRIAGEM.indexOf(chave) + 1
}

function formatarData(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Cenário vigente de um produto: qualquer cenário com preco_aprovado > 0,
 * status 'aprovada' tem prioridade sobre 'desatualizada' (aceita COM AVISO),
 * desempate pelo cenário mais recente. Igual a /precificacao/aprovados.
 */
export function cenarioVigenteTriagem(
  cenarios: TriagemCenarioInput[],
): { cenario: TriagemCenarioInput; desatualizado: boolean } | null {
  const validos = (cenarios || []).filter(
    (c) =>
      c.preco_aprovado !== undefined &&
      Number(c.preco_aprovado) > 0 &&
      (c.status === 'aprovada' || c.status === 'desatualizada'),
  )
  if (validos.length === 0) return null
  const parseTime = (val?: string) => (val ? new Date(val).getTime() : 0)
  validos.sort((a, b) => {
    const aAprov = a.status === 'aprovada' ? 1 : 0
    const bAprov = b.status === 'aprovada' ? 1 : 0
    if (aAprov !== bAprov) return bAprov - aAprov
    return (
      Math.max(parseTime(b.aprovado_em), parseTime(b.updated), parseTime(b.created)) -
      Math.max(parseTime(a.aprovado_em), parseTime(a.updated), parseTime(a.created))
    )
  })
  const vigente = validos[0]
  return { cenario: vigente, desatualizado: vigente.status === 'desatualizada' }
}

/** Soma das quantidades da composição do produto comercial (campo da mig 0120). */
function somaComposicao(comp?: ItemComposicaoCusto[]): number {
  if (!comp || comp.length === 0) return 0
  return comp.reduce((s, item) => s + (Number(item.qtd) || 0), 0)
}

/** Soma das quantidades dos itens do kit (prec_kits.itens). */
function somaKitItens(kit?: { itens?: Array<{ produto_id?: string; qtd?: number }> }): number {
  if (!kit?.itens || kit.itens.length === 0) return 0
  return kit.itens.reduce((s, it) => s + (Number(it.qtd) || 0), 0)
}

function verde(
  rotulo: string,
  quando?: string,
  dados?: Record<string, string>,
): TriagemEtapaAvaliada {
  return { chave: 'base', status: 'verde', rotulo, quando, dados }
}

function etapa(
  chave: TriagemEtapaChave,
  status: TriagemStatusEtapa,
  rotulo: string,
  quando?: string,
  dados?: Record<string, string>,
): TriagemEtapaAvaliada {
  return { chave, status, rotulo, quando, dados }
}

/**
 * Avalia as 7 etapas de um produto comercial (prec_produtos).
 * Regra do usuário: kit/combo é avaliado como produto próprio (o detalhe
 * lista os componentes); a etapa Comercial do próprio kit não herda os
 * filhos — ela segue cinza até o kit entrar em um orçamento.
 */
export function avaliarProdutoTriagem(
  produto: TriagemProdutoInput,
  fontes: TriagemFontes,
): TriagemAvaliacao {
  const etapas = {} as Record<TriagemEtapaChave, TriagemEtapaAvaliada>

  // ② Base — registro de produto base vinculado a este produto comercial
  const base = produto.base_origem ? fontes.basePorOrigem.get(produto.base_origem) : undefined
  etapas.base = base
    ? etapa('base', 'verde', base.nome || 'Produto base vinculado')
    : etapa('base', 'vermelho', 'Sem produto base no catálogo')

  // ③ Composição — campo composicao (JSON da migração 0120)
  const somaComp = somaComposicao(produto.composicao)
  const kitConfig =
    produto.tipo === 'kit' || produto.tipo === 'combo'
      ? fontes.kitPorProdutoPai.get(produto.id)
      : undefined
  const somaKit = somaKitItens(kitConfig)
  if (somaComp > 0) {
    if (somaKit > 0 && Math.abs(somaKit - somaComp) > 0.0001) {
      etapas.composicao = etapa(
        'composicao',
        'amarelo',
        `Composição soma ${formatarMoeda(somaComp)} un. e o kit declara ${formatarMoeda(somaKit)} un.`,
        undefined,
        {
          rotulo: `Soma da composição (${formatarMoeda(somaComp)}) ≠ itens do kit (${formatarMoeda(somaKit)})`,
        },
      )
    } else {
      etapas.composicao = etapa(
        'composicao',
        'verde',
        `${produto.composicao!.length} item(ns) de composição`,
      )
    }
  } else {
    etapas.composicao = etapa('composicao', 'vermelho', 'Composição vazia')
  }

  // ④ Cenário + ⑤ Aprovado — prec_precificacoes
  const cenarios = fontes.cenariosPorProduto.get(produto.id) || []
  const vigente = cenarioVigenteTriagem(cenarios)
  const totalCenarios = cenarios.length
  if (totalCenarios === 0) {
    etapas.cenario = etapa('cenario', 'vermelho', 'Nenhum cenário salvo')
    etapas.aprovado = etapa('aprovado', 'vermelho', 'Aguarda cenário com preço aprovado')
  } else if (vigente) {
    const nomeCanal = fontes.canalNome?.get(vigente.cenario.canal) || ''
    const quando = vigente.cenario.aprovado_em || vigente.cenario.updated || vigente.cenario.created
    etapas.cenario = etapa(
      'cenario',
      'verde',
      vigente.desatualizado
        ? `Cenário vigente desatualizado (R$ ${formatarMoeda(vigente.cenario.preco_aprovado || 0)})`
        : `Cenário vigente R$ ${formatarMoeda(vigente.cenario.preco_aprovado || 0)}${nomeCanal ? ` · ${nomeCanal}` : ''}`,
      quando,
      {
        rotulo: vigente.desatualizado
          ? 'Vigente desatualizado (custo/taxa mudou)'
          : 'Preço aprovado vigente',
      },
    )
    etapas.aprovado = vigente.desatualizado
      ? etapa(
          'aprovado',
          'amarelo',
          `Preço aprovado desatualizado: R$ ${formatarMoeda(vigente.cenario.preco_aprovado || 0)}${nomeCanal ? ` no canal ${nomeCanal}` : ''} em ${formatarData(quando)}`,
          quando,
          { rotulo: 'Custo ou taxa mudou após a aprovação — rever o cenário' },
        )
      : etapa(
          'aprovado',
          'verde',
          `R$ ${formatarMoeda(vigente.cenario.preco_aprovado || 0)}${nomeCanal ? ` no canal ${nomeCanal}` : ''} em ${formatarData(quando)}`,
          quando,
        )
  } else {
    etapas.cenario = etapa(
      'cenario',
      'amarelo',
      `${totalCenarios} cenário(s) só rascunho`,
      cenarios[0]?.updated || cenarios[0]?.created,
      { rotulo: 'Rascunho não aprovado' },
    )
    etapas.aprovado = etapa('aprovado', 'vermelho', 'Nenhum preço aprovado')
  }

  // ⑥ Matriz/Canais — prec_matriz_classificacoes com legenda ativa
  const matriz = fontes.matrizPorProduto.get(produto.id) || []
  const matrizAtiva = matriz.filter((m) => m.legenda && m.expand?.legenda?.ativo !== false)
  if (matriz.length === 0) {
    etapas.matriz = etapa('matriz', 'vermelho', 'Fora da matriz de canais')
  } else if (matrizAtiva.length > 0) {
    etapas.matriz = etapa('matriz', 'verde', `${matrizAtiva.length} canal(is) classificado(s)`)
  } else {
    etapas.matriz = etapa('matriz', 'amarelo', `Só classificação(ões) inativa(s)`, undefined, {
      rotulo: 'Legenda da matriz inativa — rever em Canais & Taxas',
    })
  }

  // ⑦ Comercial — orcamento_itens via produtos vinculados (sem venda = CINZA)
  const itens = fontes.orcamentoItensPorProduto.get(produto.id) || []
  if (itens.length === 0) {
    etapas.comercial = etapa(
      'comercial',
      'cinza',
      'Ainda sem uso comercial (nenhum orçamento ou pedido)',
      undefined,
      { rotulo: 'Sem uso comercial ainda — normal para produto recém-cadastrado' },
    )
  } else {
    let dataMaisRecente = ''
    let clienteNome = ''
    for (const item of itens) {
      const orc = fontes.orcamentosPorId.get(item.orcamento)
      if (!orc) continue
      const quando = orc.created || ''
      if (!dataMaisRecente || quando > dataMaisRecente) {
        dataMaisRecente = quando
        clienteNome = orc.cliente_nome || ''
      }
    }
    const quando = dataMaisRecente || undefined
    const rotulo = [
      `${itens.length} uso(s) comercial(is)`,
      clienteNome ? `em ${clienteNome}` : '',
      quando ? `em ${formatarData(quando)}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    etapas.comercial = etapa('comercial', 'verde', rotulo, quando)
  }

  // ⑧ Lucro — etapa final automática: verde quando todo o trilho anterior é verde
  const anterioresVerdes = (
    ['base', 'composicao', 'cenario', 'aprovado', 'matriz', 'comercial'] as const
  ).every(
    (chave) =>
      etapas[chave]?.status === 'verde' ||
      (etapas[chave]?.status === 'cinza' && chave !== 'aprovado'),
  )
  etapas.lucro = anterioresVerdes
    ? etapa('lucro', 'verde', 'Consolidado no Lucro por Canais')
    : etapa(
        'lucro',
        'cinza',
        'Aguarda o trilho anterior 100% verde (consolidação automática)',
        undefined,
        { rotulo: 'Somente leitura — consolida sozinho quando as etapas anteriores fecham' },
      )

  // Selo geral e etapa pendente
  // Defesa: leitura opcional — etapa ausente é tratada como pendente/vermelha
  // e nunca derruba o cálculo com "Cannot read properties of undefined".
  const etapasCinzas = ETAPAS_TRIAGEM.filter((k) => etapas[k]?.status === 'cinza')
  const etapasAmarelas = ETAPAS_TRIAGEM.filter((k) => etapas[k]?.status === 'amarelo')
  const pendentes = ETAPAS_TRIAGEM.filter((k) => {
    const s = etapas[k]?.status
    return s === undefined || s === 'vermelho' || s === 'amarelo'
  })
  const integrado = pendentes.length === 0
  let ultima = 0
  for (let i = ETAPAS_TRIAGEM.length - 1; i >= 0; i--) {
    if (etapas[ETAPAS_TRIAGEM[i]]?.status === 'verde') {
      ultima = i + 1
      break
    }
  }
  const parou = pendentes.length > 0 ? numeroEtapaTriagem(pendentes[0]) : ETAPAS_TRIAGEM.length
  const severidadePendencia: 'amarelo' | 'vermelho' = pendentes.some(
    (k) => etapas[k]?.status === 'amarelo',
  )
    ? 'amarelo'
    : 'vermelho'

  // Detalhe do kit: componentes do prec_kits (avaliados como produto próprio)
  let detalheKitComponentes: TriagemKitComponente[] | undefined
  if (kitConfig?.itens && kitConfig.itens.length > 0) {
    detalheKitComponentes = kitConfig.itens
      .map((it, i) => {
        const pid = it.produto_id || ''
        const nome = fontes.nomeProdutoPorId?.get(pid) || `Componente ${i + 1}`
        const temUso = (fontes.orcamentoItensPorProduto.get(pid) || []).length > 0
        return { produto_id: pid, nome, qtd: Number(it.qtd) || 0, temUsoComercial: temUso }
      })
      .sort((a, b) => Number(b.temUsoComercial) - Number(a.temUsoComercial))
  }

  const selo = integrado
    ? '✅ 100% integrado'
    : `⚠️ Parou na etapa ${parou} — ${nomeEtapaTriagem(ETAPAS_TRIAGEM[parou - 1])}`

  return {
    produto,
    etapas,
    ultimaEtapaAlcancada: ultima > 0 ? ultima : undefined,
    parouNaEtapaNumero: parou,
    integrado,
    selo,
    severidadePendencia,
    detalheKitComponentes,
    etapasCinzas: [...etapasCinzas],
    etapasAmarelas: [...etapasAmarelas],
  }
}

export interface TriagemResumo {
  total: number
  integrados: number
  pararamEtapa: { chave: TriagemEtapaChave; nome: string; quantidade: number } | null
  semNenhumCenario: number
}

export function resumirTriagem(avaliacoes: TriagemAvaliacao[]): TriagemResumo {
  const total = avaliacoes.length
  const integrados = avaliacoes.filter((a) => a.integrado).length
  const semNenhumCenario = avaliacoes.filter(
    (a) =>
      a.etapas.cenario.status === 'vermelho' && a.etapas.cenario.rotulo === 'Nenhum cenário salvo',
  ).length
  const contagemPorEtapa = new Map<TriagemEtapaChave, number>()
  for (const a of avaliacoes) {
    if (a.integrado) continue
    const chave = ETAPAS_TRIAGEM[a.parouNaEtapaNumero - 1]
    contagemPorEtapa.set(chave, (contagemPorEtapa.get(chave) || 0) + 1)
  }
  let pararamEtapa: TriagemResumo['pararamEtapa'] = null
  let melhorQtd = 0
  for (const [chave, quantidade] of contagemPorEtapa.entries()) {
    if (quantidade > melhorQtd) {
      melhorQtd = quantidade
      pararamEtapa = { chave, nome: nomeEtapaTriagem(chave), quantidade }
    }
  }
  return { total, integrados, pararamEtapa, semNenhumCenario }
}

/**
 * Rótulo compacto da etapa pendente, para listagens enxutas (membros de grupo):
 * "⚠️ Etapa 1 — Base" (ou "✅ 100% integrado"). Sem integrado, o ícone sai da
 * severidade da pendência (amarelo = aviso, vermelho = nunca feita).
 */
export function rotuloEtapaCompacto(
  avaliacao: Pick<TriagemAvaliacao, 'parouNaEtapaNumero' | 'severidadePendencia' | 'integrado'>,
): string {
  if (avaliacao.integrado) return '✅ 100% integrado'
  const chave = ETAPAS_TRIAGEM[avaliacao.parouNaEtapaNumero - 1]
  const nome = chave ? nomeEtapaTriagem(chave) : 'Etapa desconhecida'
  const icone = avaliacao.severidadePendencia === 'amarelo' ? '⚠️' : '🔴'
  return `${icone} Etapa ${avaliacao.parouNaEtapaNumero} — ${nome}`
}

/** Ordenação padrão: mais atrasados primeiro (menor última etapa alcançada; empate: mais antigo). */
export function ordenarPorAtraso(avaliacoes: TriagemAvaliacao[]): TriagemAvaliacao[] {
  return [...avaliacoes].sort((a, b) => {
    const ua = a.ultimaEtapaAlcancada ?? 0
    const ub = b.ultimaEtapaAlcancada ?? 0
    if (ua !== ub) return ua - ub
    return new Date(a.produto.created).getTime() - new Date(b.produto.created).getTime()
  })
}
