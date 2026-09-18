import type { RecordModel } from 'pocketbase'

export type Role = 'admin' | 'gestor' | 'financeiro' | 'visualizador'
export type TransactionType = 'receita' | 'despesa'
export type TransactionStatus = 'pendente' | 'pago'
export type SaleStatus = 'pendente' | 'paga' | 'repassada'

export interface UserRecord extends RecordModel {
  name: string
  email: string
  avatar: string
  phone: string
  role: Role
  active: boolean
  verified: boolean
}

export interface Empresa extends RecordModel {
  nome_fantasia: string
  razao_social: string
  cnpj: string
  email: string
  telefone: string
  endereco: string
  observacoes: string
}

export interface Pessoa extends RecordModel {
  nome: string
  cpf: string
  email: string
  telefone: string
  observacoes: string
}

export interface Conta extends RecordModel {
  nome: string
  tipo: 'bancaria' | 'caixa' | 'cartao' | 'marketplace'
  saldo_inicial: number
  cor: string
  ativa: boolean
  dia_fechamento?: number
  dia_vencimento?: number
  bandeira?: string
}

export interface TagItem extends RecordModel {
  nome: string
  cor?: string
}

export interface TipoDespesa extends RecordModel {
  nome: string
  codigo: string
  descricao?: string
}

export type MetodoPagamentoTipo =
  | 'pix'
  | 'cartao'
  | 'boleto'
  | 'transferencia'
  | 'dinheiro'
  | 'outro'

export interface MetodoPagamento extends RecordModel {
  nome: string
  codigo: string
  tipo: MetodoPagamentoTipo
  conta_padrao?: string
  ativo: boolean
  expand?: {
    conta_padrao?: Conta
  }
}

export interface TipoDizimo extends RecordModel {
  nome: string
  descricao?: string
  soma_resumo?: boolean
  cor?: string
}

export type SecaoDespesa = 'contas_mensais_pix_boleto' | 'assinaturas_anuais' | 'cartoes_credito'
export type RegraRepeticao = 'mensal' | 'anual' | 'parcelado' | 'avulso'
export type ContextoTipo = 'pessoal' | 'empresa'
export type OcorrenciaStatus = 'prevista' | 'paga' | 'cancelada'

export interface DespesaCompromisso extends RecordModel {
  contexto_tipo: ContextoTipo
  empresa?: string
  pessoa?: string
  descricao: string
  fornecedor?: string
  categoria?: string
  tag?: string
  tipo_despesa?: string
  metodo_pagamento?: string
  conta_padrao?: string
  secao: SecaoDespesa
  regra_repeticao: RegraRepeticao
  total_parcelas?: number
  parcela_inicial?: number
  dia_vencimento?: number
  regra_vencimento_texto?: string
  data_inicio: string
  valor_estimado: number
  link_pagamento?: string
  dizimo?: boolean
  tipo_dizimo?: string
  ativo: boolean
  observacoes?: string
  expand?: {
    empresa?: Empresa
    pessoa?: Pessoa
    categoria?: Categoria
    tag?: TagItem
    tipo_despesa?: TipoDespesa
    metodo_pagamento?: MetodoPagamento
    conta_padrao?: Conta
    tipo_dizimo?: TipoDizimo
  }
}

export interface DespesaOcorrencia extends RecordModel {
  compromisso: string
  contexto_tipo: ContextoTipo
  empresa?: string
  secao: SecaoDespesa
  conta?: string
  competencia: string // 'YYYY-MM'
  numero_parcela?: number
  total_parcelas?: number
  data_vencimento: string
  valor_previsto: number
  status: OcorrenciaStatus
  data_pagamento?: string
  valor_pago?: number
  lancamento?: string
  dizimo?: boolean
  tipo_dizimo?: string
  link_pagamento?: string
  observacoes?: string
  expand?: {
    compromisso?: DespesaCompromisso
    empresa?: Empresa
    conta?: Conta
    lancamento?: Lancamento
    tipo_dizimo?: TipoDizimo
  }
}

export interface Categoria extends RecordModel {
  nome: string
  tipo: TransactionType
  cor: string
}

export interface Lancamento extends RecordModel {
  descricao: string
  valor: number
  tipo: TransactionType
  data: string
  status: TransactionStatus
  conta: string
  categoria: string
  empresa: string
  pessoa: string
  observacoes: string
  expand?: {
    conta?: Conta
    categoria?: Categoria
    empresa?: Empresa
    pessoa?: Pessoa
  }
}

export interface Marketplace extends RecordModel {
  nome: string
  slug: string
  cor: string
}

export interface MarketplaceConta extends RecordModel {
  apelido: string
  marketplace: string
  conta: string
  comissao_percentual: number
  ativa: boolean
  expand?: {
    marketplace?: Marketplace
    conta?: Conta
  }
}

export interface Venda extends RecordModel {
  pedido_id: string
  marketplace_conta: string
  data: string
  valor_bruto: number
  comissao: number
  taxas: number
  valor_liquido: number
  status: SaleStatus
  lancamento: string
  expand?: {
    marketplace_conta?: MarketplaceConta
    lancamento?: Lancamento
  }
}

export interface Repasse extends RecordModel {
  marketplace_conta: string
  periodo_inicio: string
  periodo_fim: string
  valor: number
  data_prevista: string
  data_realizada: string
  status: 'previsto' | 'realizado'
  lancamento: string
  expand?: {
    marketplace_conta?: MarketplaceConta
    lancamento?: Lancamento
  }
}

export type ContextoMembroTipo = 'pessoa' | 'empresa' | 'conta'

export interface ContextoGrupo extends RecordModel {
  nome: string
  cor?: string
  observacoes?: string
  ordem?: number
}

export interface ContextoGrupoMembro extends RecordModel {
  grupo: string
  tipo: ContextoMembroTipo
  pessoa?: string
  empresa?: string
  conta?: string
  expand?: {
    grupo?: ContextoGrupo
    pessoa?: Pessoa
    empresa?: Empresa
    conta?: Conta
  }
}

export interface ContextoGrupoComMembros extends ContextoGrupo {
  membros: ContextoGrupoMembro[]
  pessoas: Pessoa[]
  empresas: Empresa[]
  contas: Conta[]
}

export interface PeriodRange {
  key: 'current' | 'previous' | '90days'
  label: string
  start: Date
  end: Date
  previousStart: Date
  previousEnd: Date
}
