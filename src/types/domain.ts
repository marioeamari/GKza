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

export interface PeriodRange {
  key: 'current' | 'previous' | '90days'
  label: string
  start: Date
  end: Date
  previousStart: Date
  previousEnd: Date
}
