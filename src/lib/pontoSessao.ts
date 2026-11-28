/**
 * Sessão local do colaborador na estação de ponto.
 * O token_sessao vem SEMPRE do servidor (/backend/v1/ponto/login, rota autenticada
 * com X-Ponto-Token); o PIN nunca é comparado nem persistido no navegador.
 */

const CHAVE_TOKEN = 'gkza_funcionario_session_token'
const CHAVE_VINCULO = 'gkza_funcionario_session_vinculo'

export interface PontoSessaoVinculo {
  funcionarioId: string
  funcionarioNome: string
  estacaoId: string
}

export function lerTokenSessao(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN)
  } catch {
    return null
  }
}

export function lerVinculoSessao(): PontoSessaoVinculo | null {
  try {
    const bruto = localStorage.getItem(CHAVE_VINCULO)
    if (!bruto) return null
    const dados = JSON.parse(bruto) as Partial<PontoSessaoVinculo>
    if (!dados.funcionarioId || !dados.funcionarioNome || !dados.estacaoId) return null
    return {
      funcionarioId: dados.funcionarioId,
      funcionarioNome: dados.funcionarioNome,
      estacaoId: dados.estacaoId,
    }
  } catch {
    return null
  }
}

export function gravarSessao(token: string, vinculo: PontoSessaoVinculo): void {
  try {
    localStorage.setItem(CHAVE_TOKEN, token)
    localStorage.setItem(
      CHAVE_VINCULO,
      JSON.stringify({
        funcionarioId: vinculo.funcionarioId,
        funcionarioNome: vinculo.funcionarioNome,
        estacaoId: vinculo.estacaoId,
      }),
    )
  } catch {
    // localStorage indisponível — a sessão só vive em memória nesta aba
  }
}

export function limparSessao(): void {
  try {
    localStorage.removeItem(CHAVE_TOKEN)
    localStorage.removeItem(CHAVE_VINCULO)
  } catch {
    // nada a limpar
  }
}
