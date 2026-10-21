import {
  OrcamentoRecord,
  OrcamentoItemRecord,
  OrcamentoTotalCanal,
  OrcamentoPrecoCanalItem,
  OrcamentoFreteCanalItem,
} from '@/types/orcamento'
import { PrecCanalRecord } from '@/types/precificacao'

/**
 * Formata moeda no padrão brasileiro com 'R$ '
 * Exemplo: 622.5 => 'R$ 622,50'
 */
export function formatarMoedaBR(valor: number): string {
  const v = Number.isFinite(valor) ? valor : 0
  return `R$ ${v.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Formata com segurança qualquer data em ISO ou formato PocketBase para dd/mm/aaaa
 * Ex: '2026-10-14 00:00:00.000Z' -> '14/10/2026'
 * Ex: '2026-10-14T00:00:00.000Z' -> '14/10/2026'
 * Ex: '2026-10-14' -> '14/10/2026'
 */
export function formatarDataBR(dataStr?: string | Date | null): string {
  if (!dataStr) return '-'
  if (dataStr instanceof Date) {
    if (isNaN(dataStr.getTime())) return '-'
    const dia = String(dataStr.getDate()).padStart(2, '0')
    const mes = String(dataStr.getMonth() + 1).padStart(2, '0')
    const ano = dataStr.getFullYear()
    return `${dia}/${mes}/${ano}`
  }
  const str = String(dataStr).trim()
  if (!str) return '-'
  // Extrai apenas a parte da data YYYY-MM-DD
  const parteData = str.split('T')[0].split(' ')[0]
  const partes = parteData.split('-')
  if (partes.length === 3) {
    const [ano, mes, dia] = partes
    if (ano.length === 4 && mes && dia) {
      return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`
    }
  }
  // Se já contiver barras
  if (str.includes('/')) return str
  return str
}

/**
 * Calcula totais por canal para um conjunto de itens e canais selecionados.
 * Total do canal = Soma(quantidade * preco_unitario) + Soma(frete_item)
 */
/**
 * Normaliza um valor desconhecido para array de strings (IDs de canais)
 */
export function normalizarCanaisComparadosIds(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item) return ''
        if (typeof item === 'string') return item.trim()
        if (typeof item === 'object' && 'id' in item) {
          return String((item as { id: unknown }).id || '').trim()
        }
        return String(item).trim()
      })
      .filter((id): id is string => Boolean(id))
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return normalizarCanaisComparadosIds(parsed)
        }
      } catch {
        // Se falhar o parse de JSON, segue adiante
      }
    }
    // Pode vir como id único ou separado por vírgula
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * Normaliza lista de canais expandidos/resgatados para um array seguro de objetos { id, nome }
 */
export function normalizarCanaisExpandidos(
  raw: unknown,
  totaisSalvos?: Record<string, OrcamentoTotalCanal> | null,
): Array<{ id: string; nome: string }> {
  let lista: unknown[] = []
  if (Array.isArray(raw)) {
    lista = raw
  } else if (typeof raw === 'object' && raw !== null) {
    // Caso venha um único registro de relação em vez de array (PocketBase maxSelect: 1 ou expand de 1)
    if ('id' in raw || 'nome' in raw) {
      lista = [raw]
    } else {
      // Caso seja um Record<string, canal>
      lista = Object.values(raw)
    }
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        return normalizarCanaisExpandidos(parsed, totaisSalvos)
      } catch {
        lista = []
      }
    }
  }

  const canaisMapeados = lista
    .filter((c): c is NonNullable<typeof c> => c !== null && typeof c === 'object')
    .map((c: any) => ({
      id: String(c.id || ''),
      nome: String(c.nome || c.canal_nome || c.id || 'Canal'),
    }))
    .filter((c) => Boolean(c.id))

  // Se canais vieram do expand, verifica se totaisSalvos tem nomes mais específicos ou complementares
  if (canaisMapeados.length > 0) {
    return canaisMapeados.map((c) => {
      const totNome = totaisSalvos?.[c.id]?.canal_nome
      return {
        id: c.id,
        nome: totNome && totNome !== c.id ? totNome : c.nome,
      }
    })
  }

  // Se o expand veio vazio (ex: página pública deslogada sem acesso a prec_canais),
  // resgata os canais e seus nomes a partir de totais_por_canal (canal_id / canal_nome)
  if (totaisSalvos && typeof totaisSalvos === 'object' && !Array.isArray(totaisSalvos)) {
    return Object.entries(totaisSalvos)
      .map(([chaveId, tot]) => ({
        id: String(tot?.canal_id || chaveId),
        nome: String(tot?.canal_nome || chaveId || 'Canal'),
      }))
      .filter((c) => Boolean(c.id))
  }

  return []
}

/**
 * Converte Preço Unitário para Preço Cheio em tempo real
 */
export function converterUnitarioParaCheio(precoUnitario: number, quantidade: number): number {
  const qtd = Number(quantidade) || 0
  const unit = Number(precoUnitario) || 0
  return Math.round(unit * qtd * 100) / 100
}

/**
 * Converte Preço Cheio para Preço Unitário em tempo real
 */
export function converterCheioParaUnitario(precoCheio: number, quantidade: number): number {
  const qtd = Number(quantidade) || 0
  const cheio = Number(precoCheio) || 0
  if (qtd <= 0) return 0
  return Math.round((cheio / qtd) * 100) / 100
}

/**
 * Calcula o desconto percentual individual aplicado sobre o preço do canal do item.
 * Retorna:
 * - descontoPct: percentual sanitizado (>= 0)
 * - valorDescontoTotal: valor em R$ do desconto total sobre o subtotal do item (R$)
 * - precoFinalTotal: subtotal final com o desconto aplicado (R$)
 * - precoFinalUnitario: preço unitário final (R$/un)
 * - alertaMargem: boolean indicando se o preço unitário final ficou abaixo do preco_aprovado oficial
 */
export function calcularDescontoIndividualItem(params: {
  precoUnitario: number
  quantidade: number
  precoCheioBase?: number
  descontoPct?: number
  precoAprovadoReferencia?: number
}): {
  descontoPct: number
  valorDescontoTotal: number
  precoFinalTotal: number
  precoFinalUnitario: number
  alertaMargem: boolean
} {
  const qtd = Math.max(1, Number(params.quantidade) || 1)
  const unitarioBase = Number(params.precoUnitario) || 0
  const subtotalBase =
    params.precoCheioBase !== undefined && Number(params.precoCheioBase) > 0
      ? Number(params.precoCheioBase)
      : Math.round(unitarioBase * qtd * 100) / 100

  const pct = Math.max(0, Number(params.descontoPct) || 0)

  if (pct <= 0) {
    const unitFinal =
      subtotalBase > 0 && qtd > 0 ? Math.round((subtotalBase / qtd) * 100) / 100 : unitarioBase
    const alerta =
      typeof params.precoAprovadoReferencia === 'number' && params.precoAprovadoReferencia > 0
        ? unitFinal < params.precoAprovadoReferencia - 0.009 ||
          subtotalBase < Math.round(params.precoAprovadoReferencia * qtd * 100) / 100 - 0.009
        : false

    return {
      descontoPct: 0,
      valorDescontoTotal: 0,
      precoFinalTotal: subtotalBase,
      precoFinalUnitario: unitFinal,
      alertaMargem: alerta,
    }
  }

  const valorDesconto = Math.round(((subtotalBase * pct) / 100) * 100) / 100
  const precoFinal = Math.max(0, Math.round((subtotalBase - valorDesconto) * 100) / 100)
  const precoFinalUnitario = qtd > 0 ? Math.round((precoFinal / qtd) * 100) / 100 : 0

  // Se o preço final unitário ficar abaixo do preço aprovado do cenário de origem, aciona alerta
  const alertaMargem =
    typeof params.precoAprovadoReferencia === 'number' && params.precoAprovadoReferencia > 0
      ? precoFinalUnitario < params.precoAprovadoReferencia - 0.009 ||
        precoFinal < Math.round(params.precoAprovadoReferencia * qtd * 100) / 100 - 0.009
      : false

  return {
    descontoPct: pct,
    valorDescontoTotal: valorDesconto,
    precoFinalTotal: precoFinal,
    precoFinalUnitario,
    alertaMargem,
  }
}

/**
 * Normaliza um registro de Orçamento completo vindo da API/banco,
 * garantindo que canais_comparados, expand.canais_comparados, expand.itens e totais_por_canal
 * sejam SEMPRE arrays/objetos válidos.
 */
export function normalizarOrcamentoRecord(raw: any): OrcamentoRecord {
  if (!raw || typeof raw !== 'object') {
    return {
      id: '',
      codigo: '',
      cliente_nome: '',
      data_orcamento: '',
      status: 'rascunho',
      canais_comparados: [],
      totais_por_canal: {},
      expand: {
        canais_comparados: [],
        itens: [],
      },
    }
  }

  const canaisIds = normalizarCanaisComparadosIds(raw.canais_comparados)

  // Expand de canais_comparados
  const rawExpandCanais = raw.expand?.canais_comparados
  let canaisExpandidos: PrecCanalRecord[] = []
  if (Array.isArray(rawExpandCanais)) {
    canaisExpandidos = rawExpandCanais.filter((c) => c && typeof c === 'object')
  } else if (rawExpandCanais && typeof rawExpandCanais === 'object') {
    canaisExpandidos = [rawExpandCanais]
  }

  // Se canaisIds estiver vazio ou incompleto mas totais_por_canal tiver chaves,
  // normaliza para incluir as chaves de totais_por_canal
  let totais = raw.totais_por_canal
  if (typeof totais === 'string') {
    try {
      totais = JSON.parse(totais)
    } catch {
      totais = {}
    }
  }
  if (!totais || typeof totais !== 'object' || Array.isArray(totais)) {
    totais = {}
  }

  const chavesTotais = Object.keys(totais)
  let canaisIdsFinais = canaisIds
  if (chavesTotais.length > 0 && canaisIds.length < chavesTotais.length) {
    canaisIdsFinais = Array.from(new Set([...canaisIds, ...chavesTotais]))
  }

  // Expand de itens
  const rawExpandItens = raw.expand?.itens
  let itensExpandidos: OrcamentoItemRecord[] = []
  if (Array.isArray(rawExpandItens)) {
    itensExpandidos = rawExpandItens
      .filter((it) => it && typeof it === 'object')
      .map((it: any) => {
        let composicaoArray: any[] = []
        if (Array.isArray(it.composicao)) {
          composicaoArray = it.composicao
        } else if (typeof it.composicao === 'string' && it.composicao.trim()) {
          try {
            const parsed = JSON.parse(it.composicao)
            if (Array.isArray(parsed)) composicaoArray = parsed
          } catch {
            composicaoArray = []
          }
        }
        return {
          ...it,
          precos_canais:
            it.precos_canais &&
            typeof it.precos_canais === 'object' &&
            !Array.isArray(it.precos_canais)
              ? it.precos_canais
              : {},
          fretes_canais:
            it.fretes_canais &&
            typeof it.fretes_canais === 'object' &&
            !Array.isArray(it.fretes_canais)
              ? it.fretes_canais
              : {},
          composicao: composicaoArray,
        }
      })
  }

  return {
    ...raw,
    id: String(raw.id || ''),
    codigo: String(raw.codigo || ''),
    cliente_nome: String(raw.cliente_nome || ''),
    data_orcamento: String(raw.data_orcamento || ''),
    status: raw.status || 'rascunho',
    canais_comparados: canaisIdsFinais,
    totais_por_canal: totais,
    expand: {
      ...raw.expand,
      canais_comparados:
        canaisExpandidos.length >= canaisIdsFinais.length
          ? canaisExpandidos
          : normalizarCanaisExpandidos(canaisExpandidos, totais),
      itens: itensExpandidos,
    },
  }
}

/**
 * Calcula totais por canal para um conjunto de itens e canais selecionados.
 * Regra acordada:
 * - 'pago_pelo_cliente': o frete SOMA no total pago pelo cliente (faturamento do canal)
 * - 'frete_gratis': a loja paga, NÃO soma no total do cliente (total_geral = total_itens)
 */
export function calcularTotaisPorCanal(
  canaisInput: Array<{ id: string; nome: string }>,
  itensInput: Array<{
    quantidade: number
    precos_canais?: Record<string, OrcamentoPrecoCanalItem>
    fretes_canais?: Record<string, OrcamentoFreteCanalItem>
  }>,
): Record<string, OrcamentoTotalCanal> {
  const canais = Array.isArray(canaisInput) ? canaisInput : []
  const itens = Array.isArray(itensInput) ? itensInput : []
  const totais: Record<string, OrcamentoTotalCanal> = {}

  for (const canal of canais) {
    let totalItens = 0
    let totalFretesCliente = 0

    for (const item of itens) {
      const qtd = Number(item.quantidade) || 0
      const precoObj = item.precos_canais?.[canal.id]
      const precoUnit = precoObj?.preco_unitario || 0
      const precoCheioBase =
        precoObj?.preco_cheio !== undefined && Number(precoObj.preco_cheio) > 0
          ? Number(precoObj.preco_cheio)
          : qtd * precoUnit
      const subtotalItem =
        precoObj?.preco_final !== undefined && Number(precoObj.preco_final) >= 0
          ? Number(precoObj.preco_final)
          : precoCheioBase

      const freteObj = item.fretes_canais?.[canal.id]
      const valorFrete = Number(freteObj?.valor_frete) || 0
      const modoFrete = freteObj?.modo_frete || 'pago_pelo_cliente'

      totalItens += subtotalItem
      if (modoFrete === 'pago_pelo_cliente') {
        totalFretesCliente += valorFrete
      }
    }

    // Arredondamento para 2 casas
    totalItens = Math.round(totalItens * 100) / 100
    totalFretesCliente = Math.round(totalFretesCliente * 100) / 100
    const totalGeral = Math.round((totalItens + totalFretesCliente) * 100) / 100

    totais[canal.id] = {
      canal_id: canal.id,
      canal_nome: canal.nome,
      total_itens: totalItens,
      total_fretes: totalFretesCliente,
      total_geral: totalGeral,
    }
  }

  return totais
}

/**
 * Calcula o montante financeiro consolidado por canal somando todos os itens
 * (faturamento total por canal, lucro líquido total, margem % consolidada).
 * Regras acordadas:
 * - 'pago_pelo_cliente': soma no faturamento do canal (total pago pelo cliente) e NÃO entra no custo (não afeta lucro).
 * - 'frete_gratis': a loja paga -> entra no custo do produto (reduz lucro líquido e margem %) e NÃO soma no total do cliente.
 */
export function calcularMontanteConsolidadoPorCanal(params: {
  canais: Array<{ id: string; nome: string; tipo?: string }>
  itens: Array<{
    quantidade: number
    precos_canais?: Record<string, OrcamentoPrecoCanalItem>
    fretes_canais?: Record<string, OrcamentoFreteCanalItem>
    produtos_canais?: Record<string, any>
  }>
  mapaPrecificacoesAprovadas?: Record<string, any>
  aliquotaDas?: number
  aliquotaIcms?: number
}): Array<{
  canalId: string
  canalNome: string
  tipoCanal?: string
  totalItens: number
  totalFretes: number
  faturamentoTotal: number
  custoTotalProdutos: number
  tributosTotal: number
  taxasTotal: number
  lucroLiquidoTotal: number
  margemConsolidadaPct: number
}> {
  const {
    canais,
    itens,
    mapaPrecificacoesAprovadas = {},
    aliquotaDas = 4,
    aliquotaIcms = 0,
  } = params

  return canais.map((canal) => {
    let totalItens = 0
    let totalFretesCliente = 0
    let totalCustos = 0
    let totalTributos = 0
    let totalTaxas = 0

    for (const it of itens) {
      const qtd = Number(it.quantidade) || 1
      const precoObj = it.precos_canais?.[canal.id]
      const precoUnit = precoObj?.preco_unitario || 0
      const precoCheioBase =
        precoObj?.preco_cheio !== undefined && Number(precoObj.preco_cheio) > 0
          ? Number(precoObj.preco_cheio)
          : Math.round(precoUnit * qtd * 100) / 100
      const precoCheio =
        precoObj?.preco_final !== undefined && Number(precoObj.preco_final) >= 0
          ? Number(precoObj.preco_final)
          : precoCheioBase

      const freteObj = it.fretes_canais?.[canal.id]
      const frete = Number(freteObj?.valor_frete) || 0
      const modoFrete = freteObj?.modo_frete || 'pago_pelo_cliente'

      totalItens += precoCheio
      if (modoFrete === 'pago_pelo_cliente') {
        totalFretesCliente += frete
      }

      // Custo do produto: custo base dos produtos + frete grátis (quando a loja banca o frete)
      const prodVinculado = it.produtos_canais?.[canal.id]
      const precKey = prodVinculado?.precificacao_id || precoObj?.precificacao_id
      const precRec = precKey ? mapaPrecificacoesAprovadas[precKey] : null

      const custoUnitario =
        Number(precRec?.resultado?.custo_total_produto) ||
        Number(precRec?.custo_snapshot?.custo_total) ||
        Number(precRec?.premissas?.sobrescrita_custo_total) ||
        Number(precRec?.expand?.produto?.custo_aquisicao_unitario) ||
        0
      const custoItemBase = Math.round(custoUnitario * qtd * 100) / 100
      const freteGratisItem = modoFrete === 'frete_gratis' ? frete : 0
      const custoItemTotal = Math.round((custoItemBase + freteGratisItem) * 100) / 100
      totalCustos += custoItemTotal

      // Taxas estimadas do canal
      const taxasGravadas = Number(precRec?.resultado?.total_taxas_retidas_canal) || 0
      const precoAprovadoOficial = Number(precRec?.preco_aprovado) || precoUnit
      const proporcaoPreco = precoAprovadoOficial > 0 ? precoCheio / precoAprovadoOficial : qtd

      const taxaItem =
        taxasGravadas > 0
          ? Math.round(taxasGravadas * proporcaoPreco * 100) / 100
          : canal.tipo === 'site_proprio'
            ? 0
            : Math.round(precoCheio * 0.18 * 100) / 100
      totalTaxas += taxaItem

      // Tributos (DAS + ICMS) sobre precoCheio
      const aliqEfetiva =
        (typeof aliquotaDas === 'number' && aliquotaDas > 0 ? aliquotaDas : 4) +
        (typeof aliquotaIcms === 'number' ? aliquotaIcms : 0)
      const tributoItem = Math.round(precoCheio * (aliqEfetiva / 100) * 100) / 100
      totalTributos += tributoItem
    }

    totalItens = Math.round(totalItens * 100) / 100
    totalFretesCliente = Math.round(totalFretesCliente * 100) / 100
    const faturamentoTotal = Math.round((totalItens + totalFretesCliente) * 100) / 100
    totalCustos = Math.round(totalCustos * 100) / 100
    totalTaxas = Math.round(totalTaxas * 100) / 100
    totalTributos = Math.round(totalTributos * 100) / 100

    // Lucro Líquido = totalItens - totalTaxas - totalCustos (que já inclui frete grátis da loja) - totalTributos
    const lucroLiquidoTotal =
      Math.round((totalItens - totalTaxas - totalCustos - totalTributos) * 100) / 100
    const margemConsolidadaPct =
      totalItens > 0 ? Math.round((lucroLiquidoTotal / totalItens) * 1000) / 10 : 0

    return {
      canalId: canal.id,
      canalNome: canal.nome,
      tipoCanal: canal.tipo,
      totalItens,
      totalFretes: totalFretesCliente,
      faturamentoTotal,
      custoTotalProdutos: totalCustos,
      tributosTotal: totalTributos,
      taxasTotal: totalTaxas,
      lucroLiquidoTotal,
      margemConsolidadaPct,
    }
  })
}

/**
 * Gera o texto exato para WhatsApp conforme o padrão do usuário:
 * Exemplo acordado:
 * "Combo 25 unidades Toalhas de Banho e Rosto Tema BLUEY cor AZUL
 *
 * #Shopee:
 * * 25 unidades Banho R$ 622,50
 * * Frete: 23,87
 * * 25 unidades Rosto R$ 89,90
 * * Frete: R$ 9,62
 * * Total: R$ 745,89
 *
 * #Site
 * * 25 unidades Banho R$ 497,50
 * * Frete: R$ 33,91
 * * 25 unidades Rosto R$ 79,90
 * * Frete: R$ 21,96
 * * Total: R$ 633,27"
 */
export function gerarTextoWhatsappOrcamento(params: {
  titulo?: string
  tema_nome?: string
  cor?: string
  canais?: Array<{ id: string; nome: string }>
  itens?: Array<{
    tipo_item?: string
    modelo_nome: string
    descricao?: string
    tema_nome?: string
    cor?: string
    quantidade: number
    composicao?: Array<{
      tipo?: string
      tema_nome?: string
      modelo_nome?: string
      descricao?: string
      quantidade: number
    }>
    precos_canais?: Record<string, OrcamentoPrecoCanalItem>
    fretes_canais?: Record<string, OrcamentoFreteCanalItem>
  }>
  totaisPorCanal?: Record<string, OrcamentoTotalCanal>
  validade_data?: string
}): string {
  const {
    titulo,
    tema_nome,
    cor,
    canais: canaisRaw,
    itens: itensRaw,
    totaisPorCanal,
    validade_data,
  } = params

  const canais = Array.isArray(canaisRaw) ? canaisRaw : []
  const itens = Array.isArray(itensRaw) ? itensRaw : []

  const linhas: string[] = []

  // Cabeçalho descritivo
  let cabecalho = ''
  if (titulo && titulo.trim()) {
    cabecalho = titulo.trim()
  } else {
    const qtdTotal = itens.reduce((acc, i) => acc + (Number(i?.quantidade) || 0), 0)
    const modelosNomes = itens
      .map((i) => i?.modelo_nome)
      .filter(Boolean)
      .join(' e ')
    cabecalho = `Combo ${qtdTotal} unidades ${modelosNomes || 'Itens'}`
    const temaFinal = tema_nome || itens.find((i) => i.tema_nome)?.tema_nome
    const corFinal = cor || itens.find((i) => i.cor)?.cor
    if (temaFinal) {
      cabecalho += ` Tema ${temaFinal.toUpperCase()}`
    }
    if (corFinal) {
      cabecalho += ` cor ${corFinal.toUpperCase()}`
    }
  }

  linhas.push(cabecalho)

  const totaisCalculados =
    totaisPorCanal && typeof totaisPorCanal === 'object' && !Array.isArray(totaisPorCanal)
      ? totaisPorCanal
      : calcularTotaisPorCanal(canais, itens)

  for (const canal of canais) {
    if (!canal || !canal.id) continue
    linhas.push('')
    // Cabeçalho da seção: ex '#Shopee:'
    linhas.push(`#${canal.nome}:`)

    for (const item of itens) {
      if (!item) continue
      const qtd = Number(item.quantidade) || 0
      const precoObj = item.precos_canais?.[canal.id]
      const precoUnit = precoObj?.preco_unitario || 0
      const precoCheioGravado = precoObj?.preco_cheio
      const subtotalBase =
        precoCheioGravado !== undefined && precoCheioGravado > 0
          ? precoCheioGravado
          : Math.round(qtd * precoUnit * 100) / 100
      const subtotalItem =
        precoObj?.preco_final !== undefined && Number(precoObj.preco_final) >= 0
          ? Number(precoObj.preco_final)
          : subtotalBase
      const frete = item.fretes_canais?.[canal.id]?.valor_frete || 0

      // Linha do item: * 25 unidades Banho R$ 622,50
      let linhaItem = `* ${qtd} unidades ${item.modelo_nome} ${formatarMoedaBR(subtotalItem)}`
      if (item.descricao) {
        linhaItem += ` (${item.descricao})`
      }
      linhas.push(linhaItem)

      // Sub-lista de composição para expedição/detalhe do kit se houver
      if (Array.isArray(item.composicao) && item.composicao.length > 0) {
        for (const comp of item.composicao) {
          const compNome = comp.modelo_nome || comp.tema_nome || comp.descricao || 'Item'
          const compTema = comp.tema_nome ? ` [${comp.tema_nome}]` : ''
          linhas.push(`  - ${comp.quantidade}x ${compNome}${compTema}`)
        }
      }

      // Linha de frete:
      // Se modo for 'frete_gratis', exibe '* Frete: Grátis'
      // Se frete > 0 e 'pago_pelo_cliente', exibe '* Frete: R$ X (pago pelo cliente)'
      const freteObj = item.fretes_canais?.[canal.id]
      const modoFrete = freteObj?.modo_frete || 'pago_pelo_cliente'

      if (modoFrete === 'frete_gratis') {
        linhas.push('* Frete: Grátis')
      } else if (frete > 0) {
        linhas.push(`* Frete: ${formatarMoedaBR(frete)} (pago pelo cliente)`)
      }
    }

    const totalCanal = totaisCalculados[canal.id]
    const valorTotal = totalCanal?.total_geral ?? 0
    linhas.push(`* Total: ${formatarMoedaBR(valorTotal)}`)
  }

  if (validade_data) {
    const dataFormatada = formatarDataBR(validade_data)
    if (dataFormatada !== '-') {
      linhas.push('')
      linhas.push(`Proposta válida até ${dataFormatada}.`)
    }
  }

  return linhas.join('\n')
}

/**
 * Cria o link wa.me direto com o texto codificado
 */
export function criarLinkWhatsapp(numeroTelefone: string | undefined, texto: string): string {
  const numeroLimpo = (numeroTelefone || '').replace(/\D/g, '')
  const textoEncoded = encodeURIComponent(texto)
  if (!numeroLimpo) {
    return `https://wa.me/?text=${textoEncoded}`
  }
  // Se não tiver DDI 55, adiciona se for telefone brasileiro com 10 ou 11 dígitos
  const numeroFinal =
    numeroLimpo.length >= 10 && !numeroLimpo.startsWith('55') ? `55${numeroLimpo}` : numeroLimpo
  return `https://wa.me/${numeroFinal}?text=${textoEncoded}`
}
