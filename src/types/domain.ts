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

export interface Fornecedor extends RecordModel {
  razao_social: string
  nome_fantasia: string
  cnpj?: string
  cpf?: string
  inscricao_estadual?: string
  email?: string
  telefone?: string
  contato_nome?: string
  endereco?: string
  cep?: string
  cidade?: string
  uf?: string
  site?: string
  prazo_entrega_dias?: number
  condicao_pagamento?: string
  observacoes?: string
}

export interface FornecedorProduto extends RecordModel {
  fornecedor: string
  descricao: string
  sku_fornecedor?: string
  codigo_barras?: string
  marca?: string
  categoria?: string
  unidade?: string
  preco_custo_unitario: number
  preco_ultima_compra?: number
  embalagem?: string
  peso_g?: number
  comprimento_cm?: number
  largura_cm?: number
  altura_cm?: number
  moeda?: string
  ncm?: string
  observacoes?: string
  ativo?: boolean
  expand?: {
    fornecedor?: Fornecedor
  }
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

export type TipoCalculoDizimo = 'dizimo' | 'oferta' | 'primicias'

export interface ConfigCalculo extends RecordModel {
  tipo: TipoCalculoDizimo
  percentual: number
  descricao?: string
}

export type SecaoDespesa = 'contas_mensais_pix_boleto' | 'assinaturas_anuais' | 'cartoes_credito'
export type RegraRepeticao = 'mensal' | 'anual' | 'parcelado' | 'avulso'
export type ContextoTipo = 'pessoal' | 'empresa'
export type OcorrenciaStatus = 'prevista' | 'paga' | 'cancelada'

export type TitularTipo = 'cpf' | 'cnpj'
export type TipoValorDespesa = 'fixo' | 'variavel'
export type ModalidadeParcelamento = 'a_vista' | 'parcelado'

export interface DespesaCompromisso extends RecordModel {
  contexto_tipo: ContextoTipo
  empresa?: string
  pessoa?: string
  // Titular da despesa (a quem a obrigação pertence: CPF ou CNPJ)
  titular_tipo?: TitularTipo
  titular_pessoa?: string
  titular_empresa?: string
  // Dados descritivos
  descricao: string // Descrição da despesa
  fornecedor?: string // Fornecedor / favorecido
  categoria?: string // Categoria financeira (finalidade)
  tag?: string // Destino da despesa / Centro de custo
  tipo_despesa?: string // Histórico (preservado)
  metodo_pagamento?: string // Método de pagamento (Pix, boleto, etc.)
  conta_padrao?: string // Conta de pagamento prevista / Cartão
  secao: SecaoDespesa // Seção do painel (visualização)
  // Cobrança e valores independentes
  regra_repeticao: RegraRepeticao // Repetição: única ('avulso') ou recorrente ('mensal'/'anual'/'parcelado')
  tipo_valor?: TipoValorDespesa // Valor previsto: fixo ou variavel
  modalidade_parcelamento?: ModalidadeParcelamento // Parcelamento: a_vista ou parcelado
  total_parcelas?: number
  parcela_inicial?: number
  valor_parcela?: number
  dia_vencimento?: number
  regra_vencimento_texto?: string
  data_inicio: string
  data_fim_calculada?: string
  valor_estimado: number
  link_pagamento?: string
  dizimo?: boolean
  tipo_dizimo?: string
  direcionamento?: string
  ativo: boolean
  observacoes?: string
  precisa_revisao?: boolean
  motivo_revisao?: string
  expand?: {
    empresa?: Empresa
    pessoa?: Pessoa
    titular_pessoa?: Pessoa
    titular_empresa?: Empresa
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
  valor_estimado_original?: number
  valor_ajustado_manualmente?: boolean
  status: OcorrenciaStatus
  data_pagamento?: string
  valor_pago?: number
  lancamento?: string
  dizimo?: boolean
  tipo_dizimo?: string
  direcionamento?: string
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
  competencia?: string // 'YYYY-MM' (competência da fatura para cartão ou do mês)
  fatura_paga?: boolean // indica se a compra no cartão já foi quitada pelo pagamento da fatura
  fatura_pagamento_id?: string // id do lançamento de pagamento de fatura que quitou esta compra
  is_pagamento_fatura?: boolean // true se este lançamento é a saída de caixa referente ao pagamento de fatura
  cartao_fatura_conta?: string // conta do cartão cuja fatura foi paga por este lançamento
  expand?: {
    conta?: Conta
    categoria?: Categoria
    empresa?: Empresa
    pessoa?: Pessoa
    cartao_fatura_conta?: Conta
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

export type TelegramRegistroStatus = 'pendente' | 'aprovado' | 'descartado'

export interface TelegramRegistroPendente extends RecordModel {
  descricao: string
  valor: number
  tipo: TransactionType
  data: string
  status: TelegramRegistroStatus
  conta?: string
  categoria?: string
  empresa?: string
  pessoa?: string
  contexto_nome?: string
  telegram_chat_id?: string
  telegram_message_id?: string
  telegram_origem?: string
  comprovante_texto?: string
  comprovante_foto?: string
  comprovante_foto_url?: string
  observacoes?: string
  lancamento_gerado?: string
  compromisso_gerado?: string
  // Campos Open Finance / Pluggy
  external_id?: string
  origem_tipo?: 'telegram' | 'open_finance' | string
  banco_nome?: string
  pluggy_item_id?: string
  expand?: {
    conta?: Conta
    categoria?: Categoria
    empresa?: Empresa
    pessoa?: Pessoa
    lancamento_gerado?: Lancamento
    compromisso_gerado?: DespesaCompromisso
  }
}

export interface PluggyItemRecord extends RecordModel {
  item_id: string
  connector_id?: number
  connector_name: string
  connector_image_url?: string
  status?: string
  last_sync_at?: string
  error_message?: string
}

// ----------------------------------------------------
// Metas, Hábitos, Rotinas, Agenda, Projetos e Tarefas
// ----------------------------------------------------

export type HabitoStatusRegistro = 'feito' | 'nao_feito' | 'dispensado'

export interface MetaHabito extends RecordModel {
  nome: string
  descricao?: string
  contexto_tipo: ContextoTipo
  pessoa?: string
  empresa?: string
  dias_semana: number[] // 0: Dom, 1: Seg, ..., 6: Sab
  horario?: string // HH:mm
  data_inicio: string
  ativo: boolean
  cor?: string
  expand?: {
    pessoa?: Pessoa
    empresa?: Empresa
  }
}

export interface MetaHabitoRegistro extends RecordModel {
  habito: string
  data: string // YYYY-MM-DD
  status: HabitoStatusRegistro
  observacao?: string
  expand?: {
    habito?: MetaHabito
  }
}

export type AgendaEventoStatus = 'ativo' | 'cancelado' | 'concluido'
export type AgendaEventoRecorrencia = 'nenhuma' | 'diaria' | 'semanal' | 'mensal' | 'anual'
export type AgendaEventoOrigem = 'sistema' | 'google'

export interface AgendaEvento extends RecordModel {
  titulo: string
  descricao?: string
  contexto_tipo: ContextoTipo
  pessoa?: string
  empresa?: string
  data_inicio: string
  data_fim?: string
  dia_inteiro?: boolean
  local?: string
  recorrencia?: AgendaEventoRecorrencia
  status: AgendaEventoStatus
  origem: AgendaEventoOrigem
  google_event_id?: string
  cor?: string
  expand?: {
    pessoa?: Pessoa
    empresa?: Empresa
  }
}

export type ProjetoStatus = 'planejamento' | 'em_andamento' | 'concluido' | 'pausado' | 'cancelado'

export interface Projeto extends RecordModel {
  nome: string
  objetivo?: string
  descricao?: string
  contexto_tipo: ContextoTipo
  pessoa?: string
  empresa?: string
  prazo?: string
  status: ProjetoStatus
  cor?: string
  expand?: {
    pessoa?: Pessoa
    empresa?: Empresa
  }
}

export type TarefaEtapa = 'a_fazer' | 'em_progresso' | 'concluida'
export type TarefaPrioridade = 'baixa' | 'media' | 'alta' | 'urgente'

export interface TarefaChecklistItem {
  id: string
  texto: string
  feito: boolean
}

export interface Tarefa extends RecordModel {
  titulo: string
  descricao?: string
  projeto?: string
  responsavel?: string
  etapa: TarefaEtapa
  prioridade: TarefaPrioridade
  contexto_tipo: ContextoTipo
  pessoa?: string
  empresa?: string
  prazo?: string
  checklist?: TarefaChecklistItem[]
  ordem?: number
  evento_agenda?: string
  expand?: {
    projeto?: Projeto
    responsavel?: UserRecord
    pessoa?: Pessoa
    empresa?: Empresa
    evento_agenda?: AgendaEvento
  }
}

export type MetaTipoProgresso = 'manual' | 'tarefas'
export type MetaStatus = 'em_andamento' | 'atingida' | 'cancelada'

export interface MetaMeta extends RecordModel {
  titulo: string
  descricao?: string
  contexto_tipo: ContextoTipo
  pessoa?: string
  empresa?: string
  prazo?: string
  tipo_progresso: MetaTipoProgresso
  progresso_manual?: number
  alvo_descricao?: string
  projeto?: string
  tarefas?: string[]
  status: MetaStatus
  cor?: string
  expand?: {
    pessoa?: Pessoa
    empresa?: Empresa
    projeto?: Projeto
    tarefas?: Tarefa[]
  }
}

export interface GoogleCalendarStatusResponse {
  configured: boolean
  client_id_present: boolean
  client_secret_present: boolean
  redirect_uri: string
  is_connected: boolean
  connected_email?: string
  last_sync_at?: string
  last_error?: string
  sync_ativo: boolean
}

export interface PeriodRange {
  key: 'current' | 'previous' | '90days'
  label: string
  start: Date
  end: Date
  previousStart: Date
  previousEnd: Date
}

export type DiaSemanaOferta =
  | 'domingo'
  | 'segunda'
  | 'terca'
  | 'quarta'
  | 'quinta'
  | 'sexta'
  | 'sabado'

export interface OfertaVoluntaria extends RecordModel {
  data: string
  valor: number
  direcionamento?: string
  descricao?: string
  recorrente?: boolean
  dia_semana?: DiaSemanaOferta
  regra_id?: string
  tipo?: 'voluntaria'
  contexto_tipo?: string
}

export type TipoMovimentacaoCaixaOferta = 'entrada' | 'saida'

export interface MovimentacaoCaixaOferta extends RecordModel {
  tipo: TipoMovimentacaoCaixaOferta
  data: string
  valor: number
  descricao?: string
  direcionamento?: string
  referencia_oferta?: string
  expand?: {
    referencia_oferta?: OfertaVoluntaria
  }
}

export interface ResumoCaixaOfertas {
  totalEntradasMes: number
  totalSaidasMes: number
  saldoMes: number
  saldoAcumuladoGeral: number
}
