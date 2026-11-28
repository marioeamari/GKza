import { useCallback, useEffect, useState } from 'react'
import {
  gravarSessao,
  lerTokenSessao,
  lerVinculoSessao,
  limparSessao,
  type PontoSessaoVinculo,
} from '@/lib/pontoSessao'
import { pontoApi, PontoApiError } from '@/services/pontoApi'
import type { PontoEstacaoInfo } from '@/services/pontoApi'

export interface UsePontoSessaoRetorno {
  token: string | null
  vinculo: PontoSessaoVinculo | null
  estacao: PontoEstacaoInfo | null
  carregandoEstacao: boolean
  erroEstacao: string | null
  recarregarEstacao: () => Promise<void>
  entrar: (funcionarioId: string, pin: string) => Promise<void>
  sair: () => void
}

export function usePontoSessao(estacaoIdRota?: string): UsePontoSessaoRetorno {
  const [token, setToken] = useState<string | null>(() => lerTokenSessao())
  const [vinculo, setVinculo] = useState<PontoSessaoVinculo | null>(() => lerVinculoSessao())
  const [estacao, setEstacao] = useState<PontoEstacaoInfo | null>(null)
  const [carregandoEstacao, setCarregandoEstacao] = useState(true)
  const [erroEstacao, setErroEstacao] = useState<string | null>(null)

  const recarregarEstacao = useCallback(async () => {
    if (!estacaoIdRota) {
      setCarregandoEstacao(false)
      setErroEstacao('Estação não informada na URL.')
      return
    }
    setCarregandoEstacao(true)
    setErroEstacao(null)
    try {
      const info = await pontoApi.estacao(estacaoIdRota)
      setEstacao(info)
    } catch (err) {
      setErroEstacao(
        err instanceof PontoApiError
          ? err.message
          : 'Não foi possível carregar a estação. Verifique a conexão e tente novamente.',
      )
    } finally {
      setCarregandoEstacao(false)
    }
  }, [estacaoIdRota])

  useEffect(() => {
    void recarregarEstacao()
  }, [recarregarEstacao])

  const entrar = useCallback(async (funcionarioId: string, pin: string): Promise<void> => {
    if (!estacaoIdRota) throw new Error('Estação não informada.')
    if (!pin) throw new Error('Digite o PIN.')
    try {
      const r = await pontoApi.login({ estacaoId: estacaoIdRota, funcionarioId, pin })
      gravarSessao(r.token_sessao, {
        funcionarioId,
        funcionarioNome: r.funcionario.nome,
        estacaoId: estacaoIdRota,
      })
      setToken(r.token_sessao)
      setVinculo({
        funcionarioId,
        funcionarioNome: r.funcionario.nome,
        estacaoId: estacaoIdRota,
      })
    } catch (err) {
      // PontoApiError (incluindo bloqueio 423) é propagado para a UI tratar
      throw err
    }
  }, [])

  const sair = useCallback(() => {
    limparSessao()
    setToken(null)
    setVinculo(null)
  }, [])

  return {
    token,
    vinculo,
    estacao,
    carregandoEstacao,
    erroEstacao,
    recarregarEstacao,
    entrar,
    sair,
  }
}
