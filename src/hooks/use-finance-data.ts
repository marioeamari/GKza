import { useCallback, useEffect, useState } from 'react'

import { financeService } from '@/services/finance'
import type { Categoria, Conta, Lancamento } from '@/types/domain'

export function useFinanceData() {
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>()

  const refresh = useCallback(async () => {
    try {
      setError(undefined)
      const [nextContas, nextCategorias, nextLancamentos] = await Promise.all([
        financeService.listContas(),
        financeService.listCategorias(),
        financeService.listLancamentos(),
      ])
      setContas(nextContas)
      setCategorias(nextCategorias)
      setLancamentos(nextLancamentos)
    } catch (nextError) {
      setError(nextError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])
  return {
    contas,
    categorias,
    lancamentos,
    loading,
    error,
    refresh,
    setLancamentos,
    setContas,
    setCategorias,
  }
}
