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
export function calcularTotaisPorCanal(
  canais: Array<{ id: string; nome: string }>,
  itens: Array<{
    quantidade: number
    precos_canais?: Record<string, OrcamentoPrecoCanalItem>
    fretes_canais?: Record<string, OrcamentoFreteCanalItem>
  }>,
): Record<string, OrcamentoTotalCanal> {
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
  canais: Array<{ id: string; nome: string }>
  itens: Array<{
    modelo_nome: string
    quantidade: number
    precos_canais?: Record<string, OrcamentoPrecoCanalItem>
    fretes_canais?: Record<string, OrcamentoFreteCanalItem>
  }>
  totaisPorCanal?: Record<string, OrcamentoTotalCanal>
  validade_data?: string
}): string {
  const { titulo, tema_nome, cor, canais, itens, totaisPorCanal, validade_data } = params

  const linhas: string[] = []

  // Cabeçalho descritivo
  let cabecalho = ''
  if (titulo && titulo.trim()) {
    cabecalho = titulo.trim()
  } else {
    const qtdTotal = itens.reduce((acc, i) => acc + (Number(i.quantidade) || 0), 0)
    const modelosNomes = itens
      .map((i) => i.modelo_nome)
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

  const totaisCalculados = totaisPorCanal || calcularTotaisPorCanal(canais, itens)

  for (const canal of canais) {
    linhas.push('')
    // Cabeçalho da seção: ex '#Shopee:'
    linhas.push(`#${canal.nome}:`)

    for (const item of itens) {
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
