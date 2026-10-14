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

  // Se não veio no expand mas temos IDs, podemos ter stubs ou aguardar busca
  // Expand de itens
  const rawExpandItens = raw.expand?.itens
  let itensExpandidos: OrcamentoItemRecord[] = []
  if (Array.isArray(rawExpandItens)) {
    itensExpandidos = rawExpandItens
      .filter((it) => it && typeof it === 'object')
      .map((it: any) => ({
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
      }))
  }

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

  return {
    ...raw,
    id: String(raw.id || ''),
    codigo: String(raw.codigo || ''),
    cliente_nome: String(raw.cliente_nome || ''),
    data_orcamento: String(raw.data_orcamento || ''),
    status: raw.status || 'rascunho',
    canais_comparados: canaisIds,
    totais_por_canal: totais,
    expand: {
      ...raw.expand,
      canais_comparados: canaisExpandidos,
      itens: itensExpandidos,
    },
  }
}

/**
 * Calcula totais por canal para um conjunto de itens e canais selecionados.
 * Total do canal = Soma(quantidade * preco_unitario) + Soma(frete_item)
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
    let totalFretes = 0

    for (const item of itens) {
      const qtd = Number(item.quantidade) || 0
      const precoItem = item.precos_canais?.[canal.id]?.preco_unitario || 0
      const freteItem = item.fretes_canais?.[canal.id]?.valor_frete || 0

      totalItens += qtd * precoItem
      totalFretes += freteItem
    }

    // Arredondamento para 2 casas
    totalItens = Math.round(totalItens * 100) / 100
    totalFretes = Math.round(totalFretes * 100) / 100
    const totalGeral = Math.round((totalItens + totalFretes) * 100) / 100

    totais[canal.id] = {
      canal_id: canal.id,
      canal_nome: canal.nome,
      total_itens: totalItens,
      total_fretes: totalFretes,
      total_geral: totalGeral,
    }
  }

  return totais
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
    modelo_nome: string
    quantidade: number
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
    if (tema_nome) {
      cabecalho += ` Tema ${tema_nome.toUpperCase()}`
    }
    if (cor) {
      cabecalho += ` cor ${cor.toUpperCase()}`
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
      const precoUnit = item.precos_canais?.[canal.id]?.preco_unitario || 0
      const subtotalItem = Math.round(qtd * precoUnit * 100) / 100
      const frete = item.fretes_canais?.[canal.id]?.valor_frete || 0

      // Linha do item: * 25 unidades Banho R$ 622,50
      linhas.push(`* ${qtd} unidades ${item.modelo_nome} ${formatarMoedaBR(subtotalItem)}`)

      // Linha de frete: * Frete: 23,87 ou * Frete: R$ 23,87 (usamos formatarMoedaBR para consistência e clareza)
      if (frete > 0) {
        linhas.push(`* Frete: ${formatarMoedaBR(frete)}`)
      }
    }

    const totalCanal = totaisCalculados[canal.id]
    const valorTotal = totalCanal?.total_geral ?? 0
    linhas.push(`* Total: ${formatarMoedaBR(valorTotal)}`)
  }

  if (validade_data) {
    const [ano, mes, dia] = validade_data.split('-')
    if (dia && mes && ano) {
      linhas.push('')
      linhas.push(`Proposta válida até ${dia}/${mes}/${ano}.`)
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
