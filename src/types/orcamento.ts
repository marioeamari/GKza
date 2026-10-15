import { PrecCanalRecord } from './precificacao'
import { KitTema, KitModelo } from './separacaoKits'
import { Pessoa } from './domain'

export type StatusOrcamento = 'rascunho' | 'enviado' | 'aceito' | 'recusado'

export type TipoClienteOrcamento = 'pessoa_fisica' | 'pessoa_juridica'

export interface ClienteOrcamentoRecord {
  id: string
  nome: string
  tipo: TipoClienteOrcamento
  documento?: string
  whatsapp?: string
  email?: string
  telefone?: string
  observacoes?: string
  created?: string
  updated?: string
}

export interface OrcamentoPrecoCanalItem {
  canal_id: string
  canal_nome: string
  preco_unitario: number
  preco_cheio?: number
  preco_sugerido_oficial?: number
  tem_precificacao_oficial?: boolean
  desconto_aplicado?: boolean
  produto_vinculado_id?: string
  produto_vinculado_nome?: string
  produto_vinculado_sku?: string
  precificacao_id?: string
}

export interface OrcamentoProdutoVinculadoCanal {
  canal_id: string
  canal_nome?: string
  produto_id: string
  produto_nome: string
  produto_sku?: string
  preco_aprovado?: number
  precificacao_id?: string
  status_precificacao?: 'aprovada' | 'desatualizada' | string
  desatualizada?: boolean
}

export type ModoFreteOrcamento = 'pago_pelo_cliente' | 'frete_gratis'

export interface OrcamentoFreteCanalItem {
  canal_id: string
  canal_nome: string
  valor_frete: number
  modo_frete?: ModoFreteOrcamento
}

export type TipoItemOrcamento = 'cadastrado' | 'personalizado'

export type TipoComposicaoItem = 'cadastrado' | 'personalizado'

export interface ItemComposicaoOrcamento {
  id: string
  tipo: TipoComposicaoItem
  tema?: string
  tema_nome?: string
  modelo?: string
  modelo_nome?: string
  modelo_codigo?: string
  foto_url?: string
  descricao?: string
  imagem_anexo?: string
  preview_imagem?: string
  cor?: string
  quantidade: number
}

export interface OrcamentoItemRecord {
  id: string
  orcamento: string
  tipo_item?: TipoItemOrcamento
  modelo?: string
  modelo_nome: string
  modelo_codigo?: string
  descricao?: string
  imagem_anexo?: string
  foto_url?: string
  tema?: string
  tema_nome?: string
  cor?: string
  quantidade: number
  precos_canais: Record<string, OrcamentoPrecoCanalItem>
  fretes_canais: Record<string, OrcamentoFreteCanalItem>
  produtos_canais?: Record<string, OrcamentoProdutoVinculadoCanal>
  composicao?: ItemComposicaoOrcamento[]
  ordem?: number
  created?: string
  updated?: string
  expand?: {
    modelo?: KitModelo
    tema?: KitTema
  }
}

export interface OrcamentoTotalCanal {
  canal_id: string
  canal_nome: string
  total_itens: number
  total_fretes: number
  total_geral: number
}

export interface OrcamentoRecord {
  id: string
  codigo: string
  titulo?: string
  cliente?: string
  cliente_pessoa?: string
  cliente_nome: string
  cliente_whatsapp?: string
  data_orcamento: string
  validade_dias?: number
  validade_data?: string
  status: StatusOrcamento
  canais_comparados?: string[]
  tema?: string
  tema_nome?: string
  cor?: string
  observacoes?: string
  public_token?: string
  link_publico_ativo?: boolean
  totais_por_canal?: Record<string, OrcamentoTotalCanal>
  created?: string
  updated?: string
  expand?: {
    cliente?: ClienteOrcamentoRecord
    cliente_pessoa?: Pessoa
    canais_comparados?: PrecCanalRecord[]
    tema?: KitTema
    itens?: OrcamentoItemRecord[]
  }
}

export interface CreateOrcamentoInput {
  codigo?: string
  titulo?: string
  cliente?: string
  cliente_pessoa?: string
  cliente_nome: string
  cliente_whatsapp?: string
  data_orcamento: string
  validade_dias?: number
  validade_data?: string
  status?: StatusOrcamento
  canais_comparados?: string[] | string
  tema?: string
  tema_nome?: string
  cor?: string
  observacoes?: string
  itens: Array<{
    id?: string
    tipo_item?: TipoItemOrcamento
    modelo?: string
    modelo_nome: string
    modelo_codigo?: string
    descricao?: string
    imagem_anexo?: string | File
    foto_url?: string
    tema?: string
    tema_nome?: string
    cor?: string
    quantidade: number
    precos_canais: Record<string, OrcamentoPrecoCanalItem>
    fretes_canais: Record<string, OrcamentoFreteCanalItem>
    produtos_canais?: Record<string, OrcamentoProdutoVinculadoCanal>
    composicao?: ItemComposicaoOrcamento[]
    ordem?: number
  }>
}
