/**
 * Motor de Cálculo Puro e Auditável para Precificação de Produtos & Marketplaces
 * ERP GKza
 */

export type TipoProduto = 'fabricacao_propria' | 'revenda' | 'kit'

export type CategoriaCustoLinha =
  | 'material'
  | 'insumo'
  | 'servico'
  | 'etiqueta'
  | 'embalagem'
  | 'mao_obra'
  | 'aquisicao'
  | 'outro'

export type BaseCustoLinha = 'unidade' | 'lote' | 'pedido' | 'kit'

export interface ItemComposicaoCusto {
  id?: string
  codigo?: string // ex: "C0" .. "C12"
  descricao: string
  qtd: number
  unidade?: string
  custo_unitario: number
  base?: BaseCustoLinha
  categoria_custo?: CategoriaCustoLinha
  fornecedor?: string
  perda_pct?: number
}

export interface DespesaCompraRateio {
  descricao: string
  valor: number
  tipo_rateio?: 'peso' | 'valor' | 'unidade'
}

export interface ItemKitConfig {
  produto_id?: string
  nome?: string
  qtd_efetiva: number
  custo_unitario?: number
}

export interface CustoAdicionalKit {
  descricao: string
  valor: number
}

export interface ProdutoCalculoInput {
  id?: string
  sku: string
  nome: string
  tipo: TipoProduto
  categoria?: string
  peso_g?: number
  dimensao_comprimento_cm?: number
  dimensao_largura_cm?: number
  dimensao_altura_cm?: number
  dimensoes?: {
    comprimento?: number
    largura?: number
    altura?: number
  }
  // Fabricação própria
  composicao?: ItemComposicaoCusto[]
  perda_pct?: number // Perda geral opcional se não informada por linha
  qtd_produzida?: number
  qtd_por_kit?: number
  custo_etiqueta?: number
  custo_adicional_embalagem?: number

  // Revenda
  custo_aquisicao_unitario?: number
  despesas_compra?: DespesaCompraRateio[]

  // Kit
  kit_itens?: ItemKitConfig[]
  kit_custos_adicionais?: CustoAdicionalKit[]
}

export interface TaxaCondicaoInput {
  faixa_preco_min?: number
  faixa_preco_max?: number
  peso_min_kg?: number
  peso_max_kg?: number
  peso_min_g?: number
  peso_max_g?: number
  volume_min_cm3?: number
  volume_max_cm3?: number
  dimensao_max_cm?: number
  categoria?: string
}

export interface TaxaRegraInput {
  id: string
  nome: string
  base_calculo: 'preco_anunciado' | 'preco_pago_cliente' | 'prestacao_fixa' | 'peso' | 'faixa_preco'
  tipo_valor: 'percentual' | 'fixo'
  valor: number
  condicao?: TaxaCondicaoInput
  responsavel: 'vendedor' | 'marketplace'
  tipo_regra:
    | 'comissao'
    | 'tarifa_fixa'
    | 'transacao'
    | 'frete'
    | 'subsidio'
    | 'servico'
    | 'operacao'
    | 'afiliado'
    | 'campanha'
    | 'pagamento'
    | 'cupom'
    | 'desconto_pix'
    | 'cashback'
    | 'anuncios'
    | 'reserva_devolucao'
  financiado_por: 'vendedor' | 'marketplace'
  status_conferencia?: 'pendente_conferencia' | 'conferido'
}

export interface PerfilTributarioInput {
  aliquota_das_pct?: number
  aliquota_icms_pct?: number
  outros_impostos_pct?: number
  aliquota_irpj_csll_pct?: number
  // Impostos mensais ou fixos não duplicados
  das_imposto_total_mes?: number
  pedidos_estimados_mes?: number
  // Valor da NF base quando emitida sobre valor reduzido/parcial
  valor_base_nf?: number
}

export interface DescontoInput {
  nome: string
  tipo: 'percentual' | 'fixo'
  valor: number
  financiado_por: 'vendedor' | 'marketplace'
}

export interface CalculoCenarioInput {
  produto: ProdutoCalculoInput
  preco_anunciado: number
  descontos?: DescontoInput[]
  taxas: TaxaRegraInput[]
  tributos?: PerfilTributarioInput
  prazo_recebimento_dias?: number
  frete_vendedor?: number
  frete_subsidio_marketplace?: number
  // Sobrescritas opcionais
  sobrescrita_custo_total?: number
  /** Flag interna para evitar recursão infinita na resolução reversa de meta/equilíbrio */
  skipReverseCalc?: boolean
}

export interface LinhaDemonstrativoTaxa {
  taxa_id?: string
  nome: string
  tipo_regra: string
  responsavel: 'vendedor' | 'marketplace'
  financiado_por: 'vendedor' | 'marketplace'
  base_nome: string
  base_valor: number
  tipo_valor: 'percentual' | 'fixo'
  aliquota_ou_fixo: number
  valor_calculado: number
  aplicada: boolean
  motivo_nao_aplicada?: string
  condicao_resumo?: string
  pendente_conferencia?: boolean
}

export interface DemonstrativoResultado {
  valido: boolean
  incompleto: boolean
  motivos_invalido?: string[]
  avisos?: string[]

  // 1. Preço anunciado
  preco_anunciado: number

  // 2. Descontos
  descontos_vendedor: number
  descontos_marketplace: number
  total_descontos: number
  preco_pago_cliente: number

  // 3 & 4. Taxas e tarifas
  linhas_taxas: LinhaDemonstrativoTaxa[]
  total_taxas_vendedor: number
  total_taxas_marketplace: number
  total_taxas_retidas_canal: number

  // 5. Frete e subsídios
  frete_vendedor: number
  frete_subsidio_marketplace: number

  // 6. Valor a receber do canal
  valor_receber_canal: number
  prazo_recebimento_dias: number

  // 7. Custo
  custo_fabricacao_ou_aquisicao: number
  custo_embalagem: number
  custo_etiqueta: number
  custo_adicional: number
  custo_total_produto: number
  custo_sobrescrito: boolean

  // 8. Tributos
  base_calculo_tributos: number
  aliquota_imposto_efetiva_pct: number
  imposto_das: number
  imposto_icms: number
  outros_impostos: number
  total_tributos: number
  rateio_fixo_imposto_mes: number // ex: DAS total / pedidos mês

  // 9. Lucro líquido e margem
  lucro_liquido: number
  margem_liquida_pct: number // lucro / preco_anunciado * 100
  margem_sobre_cliente_pct: number // lucro / preco_pago_cliente * 100
  markup_sobre_custo_pct: number // (preco_anunciado - custo_total) / custo_total * 100
  ponto_equilibrio: number
}

// -------------------------------------------------------------
// Funções de Arredondamento e Auxiliares
// -------------------------------------------------------------
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

export function round4(num: number): number {
  return Math.round((num + Number.EPSILON) * 10000) / 10000
}

/**
 * Normaliza strings para comparação flexível de categorias:
 * remove acentuação (NFD), pontuações, caracteres especiais e converte para minúsculas
 */
export function normalizarTextoCategoria(texto?: string): string {
  if (!texto) return ''
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos / acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // pontuações e símbolos viram espaço
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Verifica se a categoria do produto atende à condição da taxa de forma resiliente.
 * - Suporta múltiplos termos na condição separados por vírgula (ex.: "cama, mesa e banho", "eletrônicos, informática")
 * - Compara por inclusão nos dois sentidos (produto contém termo ou termo contém produto)
 * - Categoria vazia no produto continua NÃO casando com condição preenchida, com motivo explícito.
 */
export function verificarCorrespondenciaCategoria(
  categoriaProduto?: string,
  categoriaCondicao?: string,
): { casou: boolean; motivo?: string } {
  if (!categoriaCondicao || categoriaCondicao.trim() === '') {
    return { casou: true }
  }

  const condOriginal = categoriaCondicao.trim()
  const prodOriginal = (categoriaProduto || '').trim()

  if (!prodOriginal) {
    return {
      casou: false,
      motivo: `Categoria do produto não definida (condição: ${condOriginal})`,
    }
  }

  const normProd = normalizarTextoCategoria(prodOriginal)
  if (!normProd) {
    return {
      casou: false,
      motivo: `Categoria do produto não definida (condição: ${condOriginal})`,
    }
  }

  // Se a condição contiver termos separados por vírgula, dividimos em termos
  const termosCondicao = condOriginal
    .split(',')
    .map((t) => normalizarTextoCategoria(t))
    .filter((t) => t.length > 0)

  // Caso não tenha sobrado termos válidos
  if (termosCondicao.length === 0) {
    return { casou: true }
  }

  // Também podemos avaliar a condição inteira normalizada (caso não tenha vírgula ou como conjunto)
  const normCondInteira = normalizarTextoCategoria(condOriginal)

  // Checar match direto ou substring bilateral entre o produto e qualquer termo
  const casou =
    termosCondicao.some((termo) => {
      return normProd === termo || normProd.includes(termo) || termo.includes(normProd)
    }) ||
    (normCondInteira.length > 0 &&
      (normProd === normCondInteira ||
        normProd.includes(normCondInteira) ||
        normCondInteira.includes(normProd)))

  if (!casou) {
    return {
      casou: false,
      motivo: `Categoria do produto (${prodOriginal}) diferente de ${condOriginal}`,
    }
  }

  return { casou: true }
}

/**
 * Retorna dimensões e volume em cm³ do produto
 */
export function extrairDimensoesEVolume(produto: ProdutoCalculoInput): {
  comprimento_cm: number
  largura_cm: number
  altura_cm: number
  volume_cm3: number
  maior_dimensao_cm: number
} {
  const comprimento_cm = produto.dimensao_comprimento_cm ?? produto.dimensoes?.comprimento ?? 0
  const largura_cm = produto.dimensao_largura_cm ?? produto.dimensoes?.largura ?? 0
  const altura_cm = produto.dimensao_altura_cm ?? produto.dimensoes?.altura ?? 0

  const volume_cm3 =
    comprimento_cm > 0 && largura_cm > 0 && altura_cm > 0
      ? round2(comprimento_cm * largura_cm * altura_cm)
      : 0

  const maior_dimensao_cm = Math.max(comprimento_cm, largura_cm, altura_cm)

  return {
    comprimento_cm,
    largura_cm,
    altura_cm,
    volume_cm3,
    maior_dimensao_cm,
  }
}

/**
 * Formata um resumo legível das condições de uma regra de taxa
 */
export function formatarResumoCondicao(cond?: TaxaCondicaoInput): string {
  if (!cond) return ''

  const partes: string[] = []

  // Preço
  if (cond.faixa_preco_min !== undefined && cond.faixa_preco_max !== undefined) {
    partes.push(
      `Preço: R$ ${cond.faixa_preco_min.toFixed(2)} a R$ ${cond.faixa_preco_max.toFixed(2)}`,
    )
  } else if (cond.faixa_preco_min !== undefined) {
    partes.push(`Preço: ≥ R$ ${cond.faixa_preco_min.toFixed(2)}`)
  } else if (cond.faixa_preco_max !== undefined) {
    partes.push(`Preço: < R$ ${cond.faixa_preco_max.toFixed(2)}`)
  }

  // Peso (preferência por kg na exibição se informado ou se em g for múltiplo de 1000)
  const pesoMinKg =
    cond.peso_min_kg !== undefined
      ? cond.peso_min_kg
      : cond.peso_min_g !== undefined
        ? cond.peso_min_g / 1000
        : undefined

  const pesoMaxKg =
    cond.peso_max_kg !== undefined
      ? cond.peso_max_kg
      : cond.peso_max_g !== undefined
        ? cond.peso_max_g / 1000
        : undefined

  if (pesoMinKg !== undefined && pesoMaxKg !== undefined) {
    partes.push(`Peso: ${pesoMinKg}kg a ${pesoMaxKg}kg`)
  } else if (pesoMinKg !== undefined) {
    partes.push(`Peso: ≥ ${pesoMinKg}kg`)
  } else if (pesoMaxKg !== undefined) {
    partes.push(`Peso: ≤ ${pesoMaxKg}kg`)
  }

  // Volume
  if (cond.volume_min_cm3 !== undefined && cond.volume_max_cm3 !== undefined) {
    partes.push(`Volume: ${cond.volume_min_cm3} a ${cond.volume_max_cm3} cm³`)
  } else if (cond.volume_min_cm3 !== undefined) {
    partes.push(`Volume: ≥ ${cond.volume_min_cm3} cm³`)
  } else if (cond.volume_max_cm3 !== undefined) {
    partes.push(`Volume: ≤ ${cond.volume_max_cm3} cm³`)
  }

  // Dimensão máxima
  if (cond.dimensao_max_cm !== undefined) {
    partes.push(`Dimensão: ≤ ${cond.dimensao_max_cm} cm`)
  }

  // Categoria
  if (cond.categoria && cond.categoria.trim() !== '') {
    partes.push(`Categoria: ${cond.categoria}`)
  }

  return partes.join(' · ')
}

/**
 * Avalia se as condições de uma regra de taxa são satisfeitas pelo produto e preço anunciado
 */
export function avaliarCondicaoTaxa(
  condicao: TaxaCondicaoInput | undefined,
  preco_anunciado: number,
  produto: ProdutoCalculoInput,
): { aplicavel: boolean; motivoNaoAplicavel?: string; condicaoSatisfeitaTexto?: string } {
  if (!condicao) {
    return { aplicavel: true }
  }

  const motivos: string[] = []

  // 1. Faixa de preço
  if (condicao.faixa_preco_min !== undefined && preco_anunciado < condicao.faixa_preco_min) {
    motivos.push(`Preço menor que R$ ${condicao.faixa_preco_min.toFixed(2)}`)
  }
  if (condicao.faixa_preco_max !== undefined && preco_anunciado > condicao.faixa_preco_max) {
    motivos.push(`Preço maior que R$ ${condicao.faixa_preco_max.toFixed(2)}`)
  }

  // 2. Peso (kg ou g)
  const pesoKg = (produto.peso_g || 0) / 1000

  // Se condicao definir peso_min_kg ou peso_min_g
  const minKg =
    condicao.peso_min_kg !== undefined
      ? condicao.peso_min_kg
      : condicao.peso_min_g !== undefined
        ? condicao.peso_min_g / 1000
        : undefined

  if (minKg !== undefined && pesoKg < minKg) {
    motivos.push(`Peso (${pesoKg} kg) menor que mínimo de ${minKg} kg`)
  }

  const maxKg =
    condicao.peso_max_kg !== undefined
      ? condicao.peso_max_kg
      : condicao.peso_max_g !== undefined
        ? condicao.peso_max_g / 1000
        : undefined

  if (maxKg !== undefined && pesoKg > maxKg) {
    motivos.push(`Peso (${pesoKg} kg) maior que teto de ${maxKg} kg`)
  }

  // 3. Volume e Dimensão
  const dim = extrairDimensoesEVolume(produto)
  if (condicao.volume_min_cm3 !== undefined && dim.volume_cm3 < condicao.volume_min_cm3) {
    motivos.push(
      `Volume (${dim.volume_cm3} cm³) menor que mínimo de ${condicao.volume_min_cm3} cm³`,
    )
  }
  if (condicao.volume_max_cm3 !== undefined && dim.volume_cm3 > condicao.volume_max_cm3) {
    motivos.push(
      `Volume (${dim.volume_cm3} cm³) maior que máximo de ${condicao.volume_max_cm3} cm³`,
    )
  }
  if (condicao.dimensao_max_cm !== undefined && dim.maior_dimensao_cm > condicao.dimensao_max_cm) {
    motivos.push(
      `Maior dimensão (${dim.maior_dimensao_cm} cm) ultrapassa limite de ${condicao.dimensao_max_cm} cm`,
    )
  }

  // 4. Categoria
  if (condicao.categoria && condicao.categoria.trim() !== '') {
    const matchCat = verificarCorrespondenciaCategoria(produto.categoria, condicao.categoria)
    if (!matchCat.casou && matchCat.motivo) {
      motivos.push(matchCat.motivo)
    }
  }

  if (motivos.length > 0) {
    return {
      aplicavel: false,
      motivoNaoAplicavel: motivos.join('; '),
    }
  }

  const resumo = formatarResumoCondicao(condicao)
  return {
    aplicavel: true,
    condicaoSatisfeitaTexto: resumo || undefined,
  }
}

/**
 * Calcula o custo unitário base de um produto conforme sua categoria (fabricação, revenda ou kit)
 */
export function calcularCustoBaseProduto(produto: ProdutoCalculoInput): {
  custo_direto: number
  custo_embalagem: number
  custo_etiqueta: number
  custo_adicional: number
  custo_total: number
  detalhes: string[]
} {
  let custo_direto = 0
  const detalhes: string[] = []

  if (produto.tipo === 'fabricacao_propria') {
    if (produto.composicao && produto.composicao.length > 0) {
      for (const item of produto.composicao) {
        const perda = (item.perda_pct || 0) / 100
        const qtdAjustada = item.qtd * (1 + perda)
        const subtotal = qtdAjustada * item.custo_unitario
        custo_direto += subtotal
        detalhes.push(
          `${item.codigo || 'C'}: ${item.descricao} - Qtd ${item.qtd} x R$ ${item.custo_unitario.toFixed(2)} = R$ ${subtotal.toFixed(2)}`,
        )
      }
    }
    // Perda global se aplicável e não zerada
    if (produto.perda_pct && produto.perda_pct > 0) {
      const fatorPerda = produto.perda_pct / 100
      custo_direto = custo_direto * (1 + fatorPerda)
    }
  } else if (produto.tipo === 'revenda') {
    custo_direto = produto.custo_aquisicao_unitario || 0
    if (produto.despesas_compra && produto.despesas_compra.length > 0) {
      for (const desp of produto.despesas_compra) {
        custo_direto += desp.valor || 0
        detalhes.push(`Despesa compra (${desp.descricao}): R$ ${(desp.valor || 0).toFixed(2)}`)
      }
    }
  } else if (produto.tipo === 'kit') {
    if (produto.kit_itens && produto.kit_itens.length > 0) {
      for (const kItem of produto.kit_itens) {
        const itemCusto = (kItem.custo_unitario || 0) * (kItem.qtd_efetiva || 1)
        custo_direto += itemCusto
        detalhes.push(
          `Item kit (${kItem.nome || 'SKU'}): ${kItem.qtd_efetiva} un x R$ ${(kItem.custo_unitario || 0).toFixed(2)} = R$ ${itemCusto.toFixed(2)}`,
        )
      }
    }
    if (produto.kit_custos_adicionais && produto.kit_custos_adicionais.length > 0) {
      for (const cad of produto.kit_custos_adicionais) {
        custo_direto += cad.valor || 0
        detalhes.push(`Custo adicional kit (${cad.descricao}): R$ ${(cad.valor || 0).toFixed(2)}`)
      }
    }
  }

  const custo_embalagem = produto.custo_adicional_embalagem || 0
  const custo_etiqueta = produto.custo_etiqueta || 0
  const custo_adicional = 0
  const custo_total = round2(custo_direto + custo_embalagem + custo_etiqueta + custo_adicional)

  return {
    custo_direto: round2(custo_direto),
    custo_embalagem: round2(custo_embalagem),
    custo_etiqueta: round2(custo_etiqueta),
    custo_adicional: round2(custo_adicional),
    custo_total,
    detalhes,
  }
}

/**
 * Motor auditável de precificação
 */
export function calcularDemonstrativo(input: CalculoCenarioInput): DemonstrativoResultado {
  const avisos: string[] = []
  const motivos_invalido: string[] = []

  const preco_anunciado = Number(input.preco_anunciado) || 0
  if (preco_anunciado <= 0) {
    motivos_invalido.push('Preço anunciado deve ser maior que zero.')
  }

  // 1. Descontos
  let descontos_vendedor = 0
  let descontos_marketplace = 0

  if (input.descontos && input.descontos.length > 0) {
    for (const d of input.descontos) {
      let descVal = 0
      if (d.tipo === 'percentual') {
        descVal = round4(preco_anunciado * (d.valor / 100))
      } else {
        descVal = d.valor
      }

      if (d.financiado_por === 'vendedor') {
        descontos_vendedor += descVal
      } else {
        descontos_marketplace += descVal
      }
    }
  }

  const total_descontos = round2(descontos_vendedor + descontos_marketplace)
  const preco_pago_cliente = Math.max(0, round2(preco_anunciado - total_descontos))

  // 2. Custos
  const custoCalc = calcularCustoBaseProduto(input.produto)
  const custo_sobrescrito = typeof input.sobrescrita_custo_total === 'number'
  const custo_total_produto = custo_sobrescrito
    ? Number(input.sobrescrita_custo_total)
    : custoCalc.custo_total

  if (custo_total_produto <= 0) {
    avisos.push('Custo total do produto zerado ou não preenchido.')
  }

  // 3. Taxas e Tarifas
  const linhas_taxas: LinhaDemonstrativoTaxa[] = []
  let total_taxas_vendedor = 0
  let total_taxas_marketplace = 0
  let total_taxas_retidas_canal = 0

  for (const t of input.taxas) {
    // Avaliar condições de aplicação combináveis (preço, peso, volume, dimensões, categoria)
    const avaliacao = avaliarCondicaoTaxa(t.condicao, preco_anunciado, input.produto)
    const aplicavel = avaliacao.aplicavel
    const motivoNaoAplicavel = avaliacao.motivoNaoAplicavel || ''
    const condicao_resumo = avaliacao.condicaoSatisfeitaTexto

    let base_valor = 0
    let base_nome = ''

    switch (t.base_calculo) {
      case 'preco_anunciado':
        base_valor = preco_anunciado
        base_nome = 'Preço Anunciado'
        break
      case 'preco_pago_cliente':
        base_valor = preco_pago_cliente
        base_nome = 'Preço Pago pelo Cliente'
        break
      case 'prestacao_fixa':
        base_valor = 1
        base_nome = 'Por Operação / Pedido'
        break
      case 'peso':
        base_valor = (input.produto.peso_g || 0) / 1000
        base_nome = 'Por Peso (kg)'
        break
      case 'faixa_preco':
        base_valor = preco_anunciado
        base_nome = 'Faixa de Preço'
        break
      default:
        base_valor = preco_anunciado
        base_nome = 'Preço Anunciado'
    }

    let valor_calculado = 0
    if (aplicavel) {
      if (t.tipo_valor === 'percentual') {
        valor_calculado = round4(base_valor * (t.valor / 100))
      } else {
        valor_calculado = t.valor
      }

      // Regra de dedução: se for encargo do vendedor
      if (t.responsavel === 'vendedor') {
        total_taxas_vendedor += valor_calculado
      } else {
        total_taxas_marketplace += valor_calculado
      }

      // Se for comissão/tarifa retida pelo canal da venda
      total_taxas_retidas_canal += valor_calculado
    }

    linhas_taxas.push({
      taxa_id: t.id,
      nome: t.nome,
      tipo_regra: t.tipo_regra,
      responsavel: t.responsavel,
      financiado_por: t.financiado_por,
      base_nome,
      base_valor: round2(base_valor),
      tipo_valor: t.tipo_valor,
      aliquota_ou_fixo: t.valor,
      valor_calculado: round2(valor_calculado),
      aplicada: aplicavel,
      motivo_nao_aplicada: motivoNaoAplicavel || undefined,
      condicao_resumo,
      pendente_conferencia: t.status_conferencia === 'pendente_conferencia',
    })
  }

  // 4. Frete
  const frete_vendedor = Number(input.frete_vendedor) || 0
  const frete_subsidio_marketplace = Number(input.frete_subsidio_marketplace) || 0

  // 5. Valor a receber do canal
  // Fórmula: Preço Pago pelo Cliente (ou Anunciado dependendo do subsídio do marketplace)
  // Menos taxas retidas da plataforma + subsídios pagos pelo marketplace ao vendedor
  // Se o desconto foi do marketplace, o marketplace ressarce o vendedor pelo desconto dado
  const valor_receber_canal = round2(
    preco_pago_cliente +
      descontos_marketplace -
      total_taxas_retidas_canal +
      frete_subsidio_marketplace,
  )

  // 6. Tributos (Simples Nacional / DAS e ICMS)
  // Base legal no Brasil: geralmente sobre a NF emitida (Preço Anunciado - descontos incondicionais)
  const base_calculo_tributos = round2(
    input.tributos?.valor_base_nf !== undefined && input.tributos.valor_base_nf > 0
      ? input.tributos.valor_base_nf
      : preco_anunciado - descontos_vendedor,
  )

  const aliqDas = Number(input.tributos?.aliquota_das_pct) || 0
  const aliqIcms = Number(input.tributos?.aliquota_icms_pct) || 0
  const aliqOutros = Number(input.tributos?.outros_impostos_pct) || 0
  const aliqEfetiva = aliqDas + aliqIcms + aliqOutros

  const imposto_das = round2(base_calculo_tributos * (aliqDas / 100))
  const imposto_icms = round2(base_calculo_tributos * (aliqIcms / 100))
  const outros_impostos = round2(base_calculo_tributos * (aliqOutros / 100))
  const total_tributos = round2(imposto_das + imposto_icms + outros_impostos)

  // Rateio opcional de imposto mensal por pedido (ex: DAS MEI fixo R$ 76,50 / 3000 pedidos = R$ 0,03)
  let rateio_fixo_imposto_mes = 0
  if (
    input.tributos?.das_imposto_total_mes &&
    input.tributos.pedidos_estimados_mes &&
    input.tributos.pedidos_estimados_mes > 0
  ) {
    rateio_fixo_imposto_mes = round4(
      input.tributos.das_imposto_total_mes / input.tributos.pedidos_estimados_mes,
    )
  }

  // 7. Lucro Líquido
  // Lucro = Valor a Receber do Canal - Frete sob minha responsabilidade - Custo Total Produto - Total Tributos - Rateio Fixo
  const lucro_liquido = round2(
    valor_receber_canal -
      frete_vendedor -
      custo_total_produto -
      total_tributos -
      rateio_fixo_imposto_mes,
  )

  // 8. Margens
  const margem_liquida_pct =
    preco_anunciado > 0 ? round2((lucro_liquido / preco_anunciado) * 100) : 0

  const margem_sobre_cliente_pct =
    preco_pago_cliente > 0 ? round2((lucro_liquido / preco_pago_cliente) * 100) : 0

  const markup_sobre_custo_pct =
    custo_total_produto > 0
      ? round2(((preco_anunciado - custo_total_produto) / custo_total_produto) * 100)
      : 0

  // 9. Ponto de Equilíbrio (Lucro Zero)
  const ponto_equilibrio = input.skipReverseCalc ? 0 : calcularPrecoEquilibrio(input)

  const incompleto =
    preco_anunciado <= 0 ||
    custo_total_produto <= 0 ||
    input.taxas.length === 0 ||
    linhas_taxas.some((t) => t.pendente_conferencia)

  return {
    valido: motivos_invalido.length === 0,
    incompleto,
    motivos_invalido: motivos_invalido.length > 0 ? motivos_invalido : undefined,
    avisos: avisos.length > 0 ? avisos : undefined,

    preco_anunciado: round2(preco_anunciado),
    descontos_vendedor: round2(descontos_vendedor),
    descontos_marketplace: round2(descontos_marketplace),
    total_descontos,
    preco_pago_cliente,

    linhas_taxas,
    total_taxas_vendedor: round2(total_taxas_vendedor),
    total_taxas_marketplace: round2(total_taxas_marketplace),
    total_taxas_retidas_canal: round2(total_taxas_retidas_canal),

    frete_vendedor: round2(frete_vendedor),
    frete_subsidio_marketplace: round2(frete_subsidio_marketplace),

    valor_receber_canal,
    prazo_recebimento_dias: input.prazo_recebimento_dias || 0,

    custo_fabricacao_ou_aquisicao: custoCalc.custo_direto,
    custo_embalagem: custoCalc.custo_embalagem,
    custo_etiqueta: custoCalc.custo_etiqueta,
    custo_adicional: custoCalc.custo_adicional,
    custo_total_produto: round2(custo_total_produto),
    custo_sobrescrito,

    base_calculo_tributos,
    aliquota_imposto_efetiva_pct: round2(aliqEfetiva),
    imposto_das,
    imposto_icms,
    outros_impostos,
    total_tributos,
    rateio_fixo_imposto_mes: round2(rateio_fixo_imposto_mes),

    lucro_liquido,
    margem_liquida_pct,
    margem_sobre_cliente_pct,
    markup_sobre_custo_pct,
    ponto_equilibrio,
  }
}

// -------------------------------------------------------------
// Cálculo Reverso Numérico (Iterativo por Bisseção)
// -------------------------------------------------------------

/**
 * Encontra o Preço Anunciado necessário para atingir uma meta (Lucro R$ ou Margem %)
 * Como taxas podem depender de faixas de preço (ex: ML < R$79 taxa fixa),
 * usamos bisseção contínua para convergir precisamente ao centavo.
 */
export function resolverPrecoParaMeta(
  inputBase: CalculoCenarioInput,
  tipoMeta: 'lucro_reais' | 'margem_pct' | 'equilibrio',
  metaValor: number = 0,
): {
  preco_sugerido: number
  preco_arredondado: number
  demonstrativo: DemonstrativoResultado
  convergiu: boolean
  iteracoes: number
} {
  // Limites da busca
  let minPreco = Math.max(0.1, (inputBase.produto.custo_aquisicao_unitario || 1) * 0.2)
  let maxPreco = 100000

  // Função objetivo: avalia lucro ou margem da simulação
  function avaliarErro(p: number): number {
    const dem = calcularDemonstrativo({
      ...inputBase,
      preco_anunciado: p,
      skipReverseCalc: true,
    })

    if (tipoMeta === 'equilibrio') {
      return dem.lucro_liquido // Queremos lucro = 0
    } else if (tipoMeta === 'lucro_reais') {
      return dem.lucro_liquido - metaValor
    } else {
      // margem_pct: margem = lucro / p * 100
      return dem.margem_liquida_pct - metaValor
    }
  }

  // Verificar se o limite superior é suficiente
  let fMax = avaliarErro(maxPreco)
  if (fMax < 0 && tipoMeta !== 'equilibrio') {
    // Mesmo em 100k não bate meta (ex: margem inviável > 100% ou taxas > 100%)
    const dem = calcularDemonstrativo({
      ...inputBase,
      preco_anunciado: maxPreco,
      skipReverseCalc: true,
    })
    return {
      preco_sugerido: maxPreco,
      preco_arredondado: maxPreco,
      demonstrativo: dem,
      convergiu: false,
      iteracoes: 0,
    }
  }

  let iter = 0
  const maxIter = 60
  let mid = minPreco

  while (iter < maxIter) {
    iter++
    mid = (minPreco + maxPreco) / 2
    const erro = avaliarErro(mid)

    if (Math.abs(erro) < 0.005 || maxPreco - minPreco < 0.005) {
      break
    }

    if (erro < 0) {
      minPreco = mid
    } else {
      maxPreco = mid
    }
  }

  const precoFinal = round2(mid)
  const demonstrativo = calcularDemonstrativo({
    ...inputBase,
    preco_anunciado: precoFinal,
    skipReverseCalc: true,
  })

  // Arredondamento comercial comum (.90, .99 ou centavos)
  const precoArredondado = roundComercial(precoFinal)

  return {
    preco_sugerido: precoFinal,
    preco_arredondado: precoArredondado,
    demonstrativo,
    convergiu: iter < maxIter,
    iteracoes: iter,
  }
}

export function calcularPrecoEquilibrio(inputBase: CalculoCenarioInput): number {
  const res = resolverPrecoParaMeta(inputBase, 'equilibrio', 0)
  return res.preco_sugerido
}

/**
 * Arredondamento comercial inteligente (ex: 24.83 -> 24.90)
 */
export function roundComercial(
  valor: number,
  regra: 'padrao_90' | 'inteiro' | 'centavos' = 'padrao_90',
): number {
  if (regra === 'centavos') return round2(valor)
  if (regra === 'inteiro') return Math.ceil(valor)

  // padrao_90: se for R$ 24,12 arredonda para R$ 24,90; se for R$ 24,93 -> R$ 25,90
  const inteiro = Math.floor(valor)
  const decimal = valor - inteiro

  if (decimal <= 0.9) {
    return round2(inteiro + 0.9)
  } else {
    return round2(inteiro + 1.9)
  }
}
