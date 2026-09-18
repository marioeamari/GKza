import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { cadastrosService } from '@/services/cadastros'
import type { Empresa } from '@/types/domain'

export interface ExpenseContextValue {
  type: 'pessoal' | 'empresa'
  empresaId?: string
  empresa?: Empresa
  label: string
  sublabel: string
}

interface AppContextType {
  activeContext: ExpenseContextValue
  setContextPessoal: () => void
  setContextEmpresa: (empresaId: string) => void
  empresas: Empresa[]
  refreshEmpresas: () => Promise<void>
}

const STORAGE_KEY = 'gestao_financeira_contexto'

const AppContext = createContext<AppContextType | null>(null)

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [activeType, setActiveType] = useState<'pessoal' | 'empresa'>('pessoal')
  const [activeEmpresaId, setActiveEmpresaId] = useState<string>('')

  const loadEmpresas = async () => {
    try {
      const list = await cadastrosService.listEmpresas()
      setEmpresas(list)
    } catch (err) {
      console.warn('Erro ao carregar empresas para o seletor de contexto:', err)
    }
  }

  useEffect(() => {
    loadEmpresas()
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.type === 'empresa' && parsed.empresaId) {
          setActiveType('empresa')
          setActiveEmpresaId(parsed.empresaId)
          return
        }
      }
    } catch {
      /* intentionally ignored */
    }
    setActiveType('pessoal')
    setActiveEmpresaId('')
  }, [])

  const setContextPessoal = () => {
    setActiveType('pessoal')
    setActiveEmpresaId('')
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: 'pessoal' }))
    } catch {
      /* intentionally ignored */
    }
  }

  const setContextEmpresa = (id: string) => {
    setActiveType('empresa')
    setActiveEmpresaId(id)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: 'empresa', empresaId: id }))
    } catch {
      /* intentionally ignored */
    }
  }

  const currentEmpresa = empresas.find((e) => e.id === activeEmpresaId)

  const activeContext: ExpenseContextValue =
    activeType === 'empresa' && currentEmpresa
      ? {
          type: 'empresa',
          empresaId: currentEmpresa.id,
          empresa: currentEmpresa,
          label: currentEmpresa.nome_fantasia || currentEmpresa.razao_social,
          sublabel: currentEmpresa.cnpj ? `CNPJ ${currentEmpresa.cnpj}` : 'Empresa PJ',
        }
      : {
          type: 'pessoal',
          label: 'Pessoal (CPF)',
          sublabel: 'Despesas pessoais & domésticas',
        }

  return (
    <AppContext.Provider
      value={{
        activeContext,
        setContextPessoal,
        setContextEmpresa,
        empresas,
        refreshEmpresas: loadEmpresas,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useAppContext deve ser usado dentro de AppContextProvider')
  }
  return ctx
}
