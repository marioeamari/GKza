/**
 * pontoApi — cliente de fetch para as rotas POST /backend/v1/ponto/* (backend
 * PocketBase/Skip Cloud, ETAPA 1 de segurança).
 *
 * A tela de ponto (/funcionarios/ponto) roda SEM usuário PocketBase logado.
 * Aqui nenhuma coleção funcionarios_* é lida direto via SDK: toda leitura e
 * gravação passa pelas rotas do servidor, que autenticam o colaborador pelo
 * header X-Ponto-Token (token_sessao devolvido por /ponto/login) e restringem
 * o acesso AOS REGISTROS DELE. O PIN nunca é comparado no navegador.
 *
 * Erros são lançados como PontoApiError com mensagem em português pronta para
 * exibição. Bloqueio de PIN (5 erros = 15 min, migração 0155) chega como
 * status 423 e é sinalizado por `bloqueado` + `minutosRestantes`.
 */
import { resolvePocketBaseBaseUrl } from '@/lib/pocketbaseBaseUrl'

export const SESSION_STORAGE_KEY = 'gkza_funcionario_session_token'

export interface PontoEstacaoInfo {
  id: string
  nome: string
}

export interface PontoLoginResultado {
  token: string
  funcionarioId: string
}

export interface PausaPonto {
  inicio: string
  fim?: string
}

export interface ChecklistItemExecucao {
  index: number
  marcado: boolean
  observacao?: string
}

export class PontoApiError extends Error {
  status: number
  /** True quando o erro é o bloqueio de PIN (423) — a tela mostra quanto falta. */
  bloqueado: boolean
  minutosRestantes?: number
  tentativasRestantes?: number

  constructor(
    message: string,
    status = 0,
    opts?: { bloqueado?: boolean; minutosRestantes?: number; tentativasRestantes?: number },
  ) {
    super(message)
    this.name = 'PontoApiError'
    this.status = status
    this.bloqueado = opts?.bloqueado ?? false
    this.minutosRestantes = opts?.minutosRestantes
    this.tentativasRestantes = opts?.tentativasRestantes
  }
}

// ---------------------------------------------------------------------------
// Sessão local (token_sessao do funcionário vinculado a este aparelho)
// ---------------------------------------------------------------------------

export function lerTokenSessao(): string {
  try {
    return (
      localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY) || ''
    )
  } catch {
    return ''
  }
}

export function salvarTokenSessao(token: string): void {
  try {
    // localStorage mantém o vínculo do aparelho entre visitas (comportamento anterior)
    localStorage.setItem(SESSION_STORAGE_KEY, token)
  } catch {
    /* storage indisponível */
  }
}

export function limparTokenSessao(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    /* storage indisponível */
  }
}

// ---------------------------------------------------------------------------
// Núcleo de fetch
// ---------------------------------------------------------------------------

function mensagemDeStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Dados incompletos na requisição.'
    case 401:
      return 'Sessão inválida ou expirada.'
    case 403:
      return 'Ação não permitida.'
    case 404:
      return 'Registro não encontrado.'
    case 409:
      return 'Registro duplicado ou já finalizado.'
    case 423:
      return 'Muitas tentativas incorretas. Tente novamente mais tarde.'
    default:
      return status >= 500
        ? 'Erro interno do servidor. Tente novamente.'
        : 'Não foi possível concluir a operação.'
  }
}

async function chamar<T>(
  acao: string,
  corpo: Record<string, unknown>,
  opts?: { token?: string },
): Promise<T> {
  const base = resolvePocketBaseBaseUrl()
  const token = opts?.token ?? lerTokenSessao()

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['X-Ponto-Token'] = token

  let resp: Response
  try {
    resp = await fetch(`${base}/backend/v1/ponto/${acao}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(corpo),
    })
  } catch {
    throw new PontoApiError('Falha de conexão com o servidor. Verifique sua internet.')
  }

  let data: any = null
  try {
    data = await resp.json()
  } catch {
    data = null
  }

  if (!resp.ok) {
    const msg =
      (data && typeof data.error === 'string' && data.error) || mensagemDeStatus(resp.status)
    throw new PontoApiError(msg, resp.status, {
      bloqueado: resp.status === 423,
      minutosRestantes: data?.minutos_restantes,
      tentativasRestantes: data?.tentativas_restantes,
    })
  }

  return data as T
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Lista [{id, nome}] dos funcionários ativos da estação (rota pública). */
export async function listarFuncionariosEstacao(tokenEstacao: string): Promise<PontoEstacaoInfo[]> {
  const lista = await chamar<PontoEstacaoInfo[]>('estacao', { token: tokenEstacao })
  return Array.isArray(lista) ? lista : []
}

/**
 * Login do colaborador: o PIN é comparado SOMENTE no servidor; em caso de
 * sucesso devolve o token_sessao (gravado localmente).
 */
export async function loginPonto(params: {
  tokenEstacao: string
  funcionarioId: string
  pin: string
}): Promise<PontoLoginResultado> {
  const resp = await chamar<{ token: string }>('login', {
    token: params.tokenEstacao,
    funcionario_id: params.funcionarioId,
    pin: params.pin,
  })
  if (!resp?.token) {
    throw new PontoApiError('Não foi possível iniciar a sessão. Tente novamente.', 500)
  }
  salvarTokenSessao(resp.token)
  return { token: resp.token, funcionarioId: params.funcionarioId }
}

// ---------------------------------------------------------------------------
// Ponto (ações) — todas exigem X-Ponto-Token e revalidam a estação no corpo
// ---------------------------------------------------------------------------

export interface PontoRegistroApi {
  id: string
  data: string
  entrada: string
  saida?: string
  pausas?: PausaPonto[]
  origem: string
}

export async function registrarEntrada(
  tokenEstacao: string,
  observacao?: string,
): Promise<PontoRegistroApi> {
  const resp = await chamar<{ ponto: PontoRegistroApi }>('ponto/entrada', {
    token: tokenEstacao,
    ...(observacao ? { observacao } : {}),
  })
  return resp.ponto
}

export async function registrarSaida(
  tokenEstacao: string,
  observacao?: string,
): Promise<PontoRegistroApi> {
  const resp = await chamar<{ ponto: PontoRegistroApi }>('ponto/saida', {
    token: tokenEstacao,
    ...(observacao ? { observacao } : {}),
  })
  return resp.ponto
}

export async function iniciarPausa(tokenEstacao: string): Promise<PontoRegistroApi> {
  const resp = await chamar<{ ponto: PontoRegistroApi }>('ponto/pausa', { token: tokenEstacao })
  return resp.ponto
}

export async function retomarPausa(tokenEstacao: string): Promise<PontoRegistroApi> {
  const resp = await chamar<{ ponto: PontoRegistroApi }>('ponto/retomar', { token: tokenEstacao })
  return resp.ponto
}

// ---------------------------------------------------------------------------
// Consultas (X-Ponto-Token) — devolvem SOMENTE os registros do próprio funcionário
// ---------------------------------------------------------------------------

export interface PontoDiaItem extends PontoRegistroApi {
  estacao?: string
  observacao?: string
  horas?: number
}

export interface PontoDiaResposta {
  data: string
  pontos: PontoDiaItem[]
  minutos_total: number
  horas_total: number
}

export async function pontosDoDia(data?: string): Promise<PontoDiaResposta> {
  return await chamar<PontoDiaResposta>('pontos-dia', data ? { data } : {})
}

export interface PontoHistoricoItem {
  id: string
  data: string
  entrada: string
  saida: string
  pausas?: PausaPonto[]
  origem: string
  observacao?: string
}

export async function pontosHistorico(page = 1, perPage = 30): Promise<PontoHistoricoItem[]> {
  const resp = await chamar<{ items: PontoHistoricoItem[] }>('pontos-historico', {
    page,
    per_page: perPage,
  })
  return resp?.items || []
}

export interface PontoConfirmacaoApi {
  id: string
  data: string
  confirmado: boolean
  divergencia_apontada: boolean
  motivo_divergencia?: string
  observacao?: string
}

export async function listarConfirmacoes(): Promise<PontoConfirmacaoApi[]> {
  const resp = await chamar<{ items: PontoConfirmacaoApi[] }>('confirmacoes-listar', {})
  return resp?.items || []
}

/** Confirma um dia trabalhado (ou aponta divergência). Data YYYY-MM-DD. */
export async function salvarConfirmacao(
  data: string,
  divergencia: boolean,
  motivo?: string,
): Promise<void> {
  await chamar('confirmacao-salvar', { data, divergencia, ...(motivo ? { motivo } : {}) })
}

export interface PontoDividaApi {
  id: string
  descricao: string
  valor_total: number
  saldo_atual: number
  percentual_abatimento: number
}

export async function listarDividas(): Promise<PontoDividaApi[]> {
  const resp = await chamar<{ items: PontoDividaApi[] }>('dividas', {})
  return resp?.items || []
}

export interface PontoFolhaApi {
  id: string
  periodo_inicio: string
  periodo_fim: string
  ganho_total: number
  descontos?: unknown[]
  divida_semanal: number
  a_receber: number
  quitada: boolean
  data_quitacao?: string
  status_conferencia_colaborador?: string
  conferido_colaborador_em?: string
  motivo_divergencia_colaborador?: string
  dias_pendentes_fechamento?: string[]
}

export async function listarFolhas(): Promise<PontoFolhaApi[]> {
  const resp = await chamar<{ items: PontoFolhaApi[] }>('folha', {})
  return resp?.items || []
}

export interface FolhaConferenciaResultado {
  id: string
  status_conferencia_colaborador: 'confirmado' | 'divergente'
}

export async function conferirFolha(
  folhaId: string,
  status: 'confirmado' | 'divergente',
  motivo?: string,
): Promise<FolhaConferenciaResultado> {
  return await chamar<FolhaConferenciaResultado>('folha-conferir', {
    folha_id: folhaId,
    status,
    ...(motivo ? { motivo } : {}),
  })
}

// ---------------------------------------------------------------------------
// Checklists (X-Ponto-Token)
// ---------------------------------------------------------------------------

export interface PontoChecklistApi {
  id: string
  nome: string
  periodo: string
  dia_semana: number
  dia_mes: number
  itens: { texto: string }[]
}

export async function listarChecklistsDoDia(data?: string): Promise<PontoChecklistApi[]> {
  const resp = await chamar<{ items: PontoChecklistApi[] }>('checklists', data ? { data } : {})
  return resp?.items || []
}

export interface PontoChecklistExecucaoApi {
  id: string
  checklist: string
  data: string
  itens: ChecklistItemExecucao[]
  observacao?: string
}

export async function listarExecucoesDoDia(data?: string): Promise<PontoChecklistExecucaoApi[]> {
  const resp = await chamar<{ items: PontoChecklistExecucaoApi[] }>(
    'checklist-execucoes',
    data ? { data } : {},
  )
  return resp?.items || []
}

/**
 * Marca/desmarca item do checklist do PRÓPRIO funcionário (execução nasce
 * preguiçosamente no servidor). Devolve a execução atualizada.
 */
export async function marcarItemChecklist(
  checklistId: string,
  index: number,
  marcado: boolean,
  data?: string,
): Promise<PontoChecklistExecucaoApi> {
  return await chamar<PontoChecklistExecucaoApi>('checklist-marcar', {
    checklist_id: checklistId,
    index,
    marcado,
    ...(data ? { data } : {}),
  })
}
