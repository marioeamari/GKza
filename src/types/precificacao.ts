import {
  CustoAdicionalKit,
  DespesaCompraRateio,
  ItemComposicaoCusto,
  ItemKitConfig,
  TaxaCondicaoInput,
  TipoProduto,
} from '@/lib/precificacao/calculo'

export interface PrecProdutoRecord {
  id: string
  created: string
  updated: string
  sku: string
  nome: string
  marca?: string
  categoria?: string
  tipo: TipoProduto
  imagem?: string
  unidade?: string
  status: 'ativo' | 'inativo' | 'rascunho'
  peso_g?: number
  dimensao_comprimento_cm?: number
  dimensao_largura_cm?: number
  dimensao_altura_cm?: number
  empresa?: string
  fornecedor?: string
  fornecedor_produto?: string
  codigo_barras?: string
  embalagem?: string
  sku_por_canal?: Array<{ canal: string; sku_externo: string }>
  composicao?: ItemComposicaoCusto[]
  custo_aquisicao_unitario?: number
  despesas_compra?: DespesaCompraRateio[]
  custo_adicional_embalagem?: number
  custo_etiqueta?: number
  perda_pct?: number
  qtd_produzida?: number
  qtd_por_kit?: number
  expand?: {
    empresa?: {
      id: string
      nome_fantasia: string
      razao_social: string
    }
    fornecedor?: {
      id: string
      nome_fantasia: string
      razao_social: string
      cnpj?: string
    }
    fornecedor_produto?: {
      id: string
      descricao: string
      sku_fornecedor?: string
      preco_custo_unitario: number
    }
  }
}

export interface PrecKitRecord {
  id: string
  created: string
  updated: string
  produto_pai: string
  itens?: ItemKitConfig[]
  custos_adicionais?: CustoAdicionalKit[]
}

export interface PrecCanalRecord {
  id: string
  created: string
  updated: string
  nome: string
  tipo: 'site_proprio' | 'marketplace'
  marketplace?: string
  ativo?: boolean
  programas_frete?: unknown
  formas_pagamento?: unknown
  vigencia?: string
  cor?: string
  ordem?: number
  expand?: {
    marketplace?: {
      id: string
      nome: string
      slug: string
      cor: string
    }
  }
}

export interface ModalidadeTributosConfig {
  habilitado?: boolean
  regime_tributario?:
    | 'mei'
    | 'simples_nacional'
    | 'lucro_presumido'
    | 'lucro_real'
    | 'personalizado'
  categoria_operacao?: string
  aliquota_das_pct?: number
  aliquota_icms_pct?: number
  outros_impostos_pct?: number
  das_imposto_total_mes?: number
  pedidos_estimados_mes?: number
  valor_base_nf?: number
  observacoes?: string
}

export interface PrecCanalModalidadeRecord {
  id: string
  created: string
  updated: string
  canal: string
  nome: string
  formas_pagamento?: unknown
  prazo_recebimento_dias?: number
  ativo?: boolean
  tributos_config?: ModalidadeTributosConfig | null
  expand?: {
    canal?: PrecCanalRecord
  }
}

export interface PrecTaxaRecord {
  id: string
  created: string
  updated: string
  canal: string
  modalidade?: string
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
  vigencia_inicio?: string
  vigencia_fim?: string
  status_conferencia: 'pendente_conferencia' | 'conferido'
  data_conferencia?: string
  expand?: {
    canal?: PrecCanalRecord
    modalidade?: PrecCanalModalidadeRecord
  }
}

export interface PrecPerfilTributarioRecord {
  id: string
  created: string
  updated: string
  escopo: 'empresa' | 'produto' | 'operacao'
  empresa?: string
  produto?: string
  aliquota_das_pct?: number
  aliquota_icms_pct?: number
  outros?: {
    das_imposto_total_mes?: number
    pedidos_estimados_mes?: number
    valor_base_nf?: number
    outros_impostos_pct?: number
    descricao_regime?: string
  }
  vigencia?: string
}

export interface PrecPrecificacaoRecord {
  id: string
  created: string
  updated: string
  produto: string
  empresa?: string
  canal: string
  modalidade?: string
  versao: number
  premissas: {
    preco_venda: number
    descontos?: Array<{
      nome: string
      tipo: 'percentual' | 'fixo'
      valor: number
      financiado_por: 'vendedor' | 'marketplace'
    }>
    frete_vendedor?: number
    frete_subsidio_marketplace?: number
    sobrescrita_custo_total?: number
    aliquota_das_pct?: number
    aliquota_icms_pct?: number
  }
  resultado: Record<string, unknown>
  status: 'rascunho' | 'aprovada' | 'desatualizada'
  custo_snapshot?: {
    custo_total: number
    hash?: string
    atualizado_em?: string
  }
  taxas_snapshot?: {
    taxas_count: number
    taxas_hash?: string
    atualizado_em?: string
  }
  aprovado_por?: string
  aprovado_em?: string
  preco_aprovado?: number
  expand?: {
    produto?: PrecProdutoRecord
    canal?: PrecCanalRecord
    modalidade?: PrecCanalModalidadeRecord
    empresa?: {
      id: string
      nome_fantasia: string
    }
    aprovado_por?: {
      id: string
      name: string
    }
  }
}
