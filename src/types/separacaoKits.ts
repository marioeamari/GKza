export interface KitTema {
  id: string
  nome: string
  descricao?: string
  ativo: boolean
  ordem: number
  created?: string
  updated?: string
  expand?: {
    modelos?: KitModelo[]
  }
}

export interface KitModelo {
  id: string
  tema: string
  codigo: string
  nome: string
  foto?: string
  ordem: number
  ativo: boolean
  observacoes?: string
  created?: string
  updated?: string
  expand?: {
    tema?: KitTema
  }
}

export type TipoRegra = 'automatica' | 'manual'

export interface ItemComposicaoModelo {
  modelo_id?: string
  codigo: string
  nome: string
  quantidade: number
  foto?: string
}

export interface KitRegra {
  id: string
  tema: string
  tipo: TipoRegra
  quantidade_kit?: number
  descricao?: string
  composicao?: ItemComposicaoModelo[]
  ativo: boolean
  created?: string
  updated?: string
  expand?: {
    tema?: KitTema
  }
}

export type TipoComposicaoPedido = 'padrao' | 'personalizada'
export type StatusSeparacao = 'aguardando' | 'em_separacao' | 'finalizado' | 'cancelado'
export type TriagemPedidoEspecial =
  | 'sem_pedido_especial'
  | 'pendente_analise'
  | 'confirmado_chat'
  | 'descartado'
export type OrigemPedidoEspecial = 'manual' | 'colagem_shopee' | 'agente_ia' | 'chat_shopee'

export interface KitPedido {
  id: string
  numero_pedido: string
  marketplace?: string
  produto_nome: string
  sku?: string
  tema: string
  quantidade_total: number
  tipo_composicao: TipoComposicaoPedido
  composicao_personalizada?: ItemComposicaoModelo[]
  status_separacao: StatusSeparacao
  cliente_nome?: string
  observacoes?: string
  separador_atual?: string

  // Novos campos estruturados para pedido especial e Shopee
  pedido_especial?: string
  tem_pedido_especial?: boolean
  triagem_pedido_especial?: TriagemPedidoEspecial
  origem_pedido_especial?: OrigemPedidoEspecial
  data_expedicao?: string
  variacao_anuncio?: string
  produto_referencia?: string
  shopee_order_id?: string
  codigo_rastreio?: string

  created?: string
  updated?: string
  expand?: {
    tema?: KitTema
    marketplace?: {
      id: string
      nome: string
      slug: string
      cor?: string
    }
    produto_referencia?: {
      id: string
      nome: string
      sku: string
      tipo: string
      qtd_por_kit?: number
      marca?: string
    }
    separador_atual?: {
      id: string
      name?: string
      email?: string
    }
  }
}

export interface ItemSeparacaoCalculada {
  modelo_id?: string
  codigo: string
  nome: string
  quantidade: number
  foto?: string
  separado: boolean
  ativo?: boolean
  inativoAlerta?: boolean
}

export interface ResultadoComposicao {
  origem: 'personalizada' | 'manual' | 'automatica'
  descricaoRegra: string
  totalGeral: number
  itens: ItemSeparacaoCalculada[]
  avisos: string[]
}

export interface KitHistoricoSeparacao {
  id: string
  pedido?: string
  numero_pedido: string
  marketplace?: string
  produto_nome?: string
  sku?: string
  tema?: string
  tema_nome?: string
  quantidade_total: number
  tipo_composicao: TipoComposicaoPedido
  regra_origem?: 'personalizada' | 'manual' | 'automatica'
  composicao_utilizada: ItemSeparacaoCalculada[]
  funcionario?: string
  funcionario_nome?: string
  data_inicio?: string
  data_fim?: string
  status: 'aguardando' | 'em_separacao' | 'finalizado'
  observacoes?: string
  pedido_especial?: string
  shopee_order_id?: string
  codigo_rastreio?: string
  created?: string
  updated?: string
  expand?: {
    marketplace?: {
      id: string
      nome: string
      slug: string
      cor?: string
    }
    pedido?: KitPedido
    tema?: KitTema
  }
}
