import type {
  KitTema,
  KitModelo,
  KitRegra,
  KitPedido,
  ResultadoComposicao,
  ItemSeparacaoCalculada,
} from '@/types/separacaoKits'

export interface CalcularComposicaoOptions {
  tema: KitTema
  modelos: KitModelo[]
  quantidadeTotal: number
  regrasDoTema?: KitRegra[]
  pedidoPersonalizado?: KitPedido | null
}

/**
 * Calcula a composição exata da separação do kit respeitando as seguintes prioridades:
 * 1. Distribuição personalizada do pedido (se existir e for do tipo 'personalizada')
 * 2. Regra manual cadastrada para aquela quantidade exata de kit (se existir e estiver ativa)
 * 3. Modo 1 — Distribuição Automática Equilibrada: divide a quantidade total entre todos os modelos ativos do tema.
 *    Se a divisão não for exata, distribui os excedentes estritamente segundo a ordem de distribuição dos modelos.
 *
 * Garantia invariável: A soma das quantidades de cada modelo é SEMPRE rigorosamente igual à quantidadeTotal informada.
 */
export function calcularComposicaoKit(options: CalcularComposicaoOptions): ResultadoComposicao {
  const { tema, modelos, quantidadeTotal, regrasDoTema = [], pedidoPersonalizado } = options
  const avisos: string[] = []

  const total = Math.max(0, Math.floor(quantidadeTotal || 0))

  if (total <= 0) {
    return {
      origem: 'automatica',
      descricaoRegra: 'Quantidade total inválida ou zero',
      totalGeral: 0,
      itens: [],
      avisos: ['A quantidade total comprada deve ser maior que zero.'],
    }
  }

  // Mapa de modelos por código e por id para busca rápida
  const modeloPorCodigo = new Map<string, KitModelo>()
  const modeloPorId = new Map<string, KitModelo>()
  for (const m of modelos) {
    modeloPorCodigo.set(m.codigo.trim().toUpperCase(), m)
    modeloPorId.set(m.id, m)
  }

  // PRIORIDADE 1: Distribuição personalizada do pedido
  if (
    pedidoPersonalizado &&
    pedidoPersonalizado.tipo_composicao === 'personalizada' &&
    Array.isArray(pedidoPersonalizado.composicao_personalizada) &&
    pedidoPersonalizado.composicao_personalizada.length > 0
  ) {
    const itens: ItemSeparacaoCalculada[] = []
    let somaPersonalizada = 0

    for (const item of pedidoPersonalizado.composicao_personalizada) {
      const qtd = Math.max(0, Math.floor(Number(item.quantidade) || 0))
      if (qtd <= 0) continue

      somaPersonalizada += qtd
      const mod =
        (item.modelo_id && modeloPorId.get(item.modelo_id)) ||
        modeloPorCodigo.get((item.codigo || '').trim().toUpperCase())

      const inativoAlerta = mod ? !mod.ativo : false
      if (inativoAlerta) {
        avisos.push(
          `Atenção: O modelo "${item.codigo} - ${item.nome}" está marcado como inativo no cadastro.`,
        )
      }

      itens.push({
        modelo_id: mod?.id || item.modelo_id,
        codigo: mod?.codigo || item.codigo,
        nome: mod?.nome || item.nome,
        quantidade: qtd,
        foto: mod?.foto,
        separado: false,
        ativo: mod ? mod.ativo : true,
        inativoAlerta,
      })
    }

    if (somaPersonalizada !== total) {
      avisos.push(
        `Alerta de divergência: A soma dos modelos personalizados (${somaPersonalizada}) difere do total do pedido (${total}).`,
      )
    }

    return {
      origem: 'personalizada',
      descricaoRegra: 'Composição personalizada definida pelo cliente no pedido',
      totalGeral: somaPersonalizada,
      itens,
      avisos,
    }
  }

  // PRIORIDADE 2: Regra manual cadastrada para aquela quantidade de kit
  const regraManual = regrasDoTema.find(
    (r) => r.ativo && r.tipo === 'manual' && Number(r.quantidade_kit) === total,
  )

  if (regraManual && Array.isArray(regraManual.composicao) && regraManual.composicao.length > 0) {
    const itens: ItemSeparacaoCalculada[] = []
    let somaManual = 0

    for (const item of regraManual.composicao) {
      const qtd = Math.max(0, Math.floor(Number(item.quantidade) || 0))
      if (qtd <= 0) continue

      somaManual += qtd
      const mod =
        (item.modelo_id && modeloPorId.get(item.modelo_id)) ||
        modeloPorCodigo.get((item.codigo || '').trim().toUpperCase())

      const inativoAlerta = mod ? !mod.ativo : false
      if (inativoAlerta) {
        avisos.push(
          `Atenção: A regra manual utiliza o modelo "${item.codigo} - ${item.nome}", que foi posteriormente inativado.`,
        )
      }

      itens.push({
        modelo_id: mod?.id || item.modelo_id,
        codigo: mod?.codigo || item.codigo,
        nome: mod?.nome || item.nome,
        quantidade: qtd,
        foto: mod?.foto,
        separado: false,
        ativo: mod ? mod.ativo : true,
        inativoAlerta,
      })
    }

    if (somaManual === total) {
      return {
        origem: 'manual',
        descricaoRegra:
          regraManual.descricao || `Regra manual cadastrada para kit de ${total} unidades`,
        totalGeral: somaManual,
        itens,
        avisos,
      }
    } else {
      avisos.push(
        `Regra manual para kit de ${total} un somava ${somaManual} un. Recaindo para distribuição automática equilibrada para manter o total de ${total} unidades.`,
      )
    }
  }

  // PRIORIDADE 3: Distribuição Automática Equilibrada entre modelos ativos do tema
  const modelosAtivos = modelos
    .filter((m) => m.ativo)
    .sort((a, b) => {
      const ordA = a.ordem !== undefined ? a.ordem : 999
      const ordB = b.ordem !== undefined ? b.ordem : 999
      if (ordA !== ordB) return ordA - ordB
      return a.codigo.localeCompare(b.codigo)
    })

  if (modelosAtivos.length === 0) {
    return {
      origem: 'automatica',
      descricaoRegra: 'Nenhum modelo ativo encontrado para o tema',
      totalGeral: 0,
      itens: [],
      avisos: [`Não há modelos ativos cadastrados para o tema "${tema.nome}".`],
    }
  }

  const numModelos = modelosAtivos.length
  const baseQtd = Math.floor(total / numModelos)
  const sobra = total % numModelos

  // Atribui baseQtd para todos e adiciona 1 unidade excedente para os primeiros `sobra` modelos
  // seguindo a ordem cadastrada
  const itens: ItemSeparacaoCalculada[] = modelosAtivos.map((mod, index) => {
    const qtd = baseQtd + (index < sobra ? 1 : 0)
    return {
      modelo_id: mod.id,
      codigo: mod.codigo,
      nome: mod.nome,
      quantidade: qtd,
      foto: mod.foto,
      separado: false,
      ativo: true,
      inativoAlerta: false,
    }
  })

  // Filtra itens com quantidade > 0 (caso a quantidade total seja menor que o número de modelos)
  const itensFiltrados = itens.filter((it) => it.quantidade > 0)
  const somaFinal = itensFiltrados.reduce((acc, it) => acc + it.quantidade, 0)

  return {
    origem: 'automatica',
    descricaoRegra: `Distribuição automática equilibrada (${modelosAtivos.length} modelos ativos)`,
    totalGeral: somaFinal,
    itens: itensFiltrados,
    avisos,
  }
}
