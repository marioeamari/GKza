import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { contextoService } from '@/services/contexto'
import { cadastrosService } from '@/services/cadastros'
import type { Conta, ContextoGrupo, ContextoGrupoComMembros, Empresa, Pessoa } from '@/types/domain'

export interface ActiveContextValue {
  /** 'all' se todos visíveis, ou 'group' quando filtrado por grupo de contexto */
  mode: 'all' | 'group'
  groupId?: string
  group?: ContextoGrupoComMembros
  label: string
  sublabel: string
  color: string
  // Identificadores de membros que pertencem ao grupo ativo (vazio se mode === 'all')
  pessoaIds: string[]
  empresaIds: string[]
  contaIds: string[]
  // IDs de todas as contas vinculadas a pelo menos um grupo de contexto (para identificar órfãs)
  linkedContaIds: string[]
  // IDs de todas as empresas e pessoas vinculadas a pelo menos um grupo de contexto
  linkedEmpresaIds: string[]
  linkedPessoaIds: string[]
  // Flags para compatibilidade com código existente
  isAll: boolean
  /** Se o grupo tiver vínculo com pessoa ou for modo pessoal legado */
  hasPessoas: boolean
  /** Se o grupo tiver vínculo com empresa */
  hasEmpresas: boolean

  // Campos legados para compatibilidade reversa com componentes de despesas antigos
  type: 'pessoal' | 'empresa' | 'all'
  empresaId?: string
}

interface AppContextType {
  activeContext: ActiveContextValue
  setContextAll: () => void
  setContextGroup: (groupId: string) => void
  grupos: ContextoGrupoComMembros[]
  loadingGrupos: boolean
  refreshGrupos: () => Promise<void>
  // Cadastros auxiliares legados mantidos para quem usa empresas
  empresas: Empresa[]
  refreshEmpresas: () => Promise<void>
  // Helpers de verificação rápida
  matchesContext: (item: {
    pessoa?: string | null
    empresa?: string | null
    conta?: string | null
    contexto_tipo?: 'pessoal' | 'empresa' | null
  }) => boolean
}

const STORAGE_KEY = 'gestao_financeira_contexto_grupo_v2'
const LEGACY_STORAGE_KEY = 'gestao_financeira_contexto'

const AppContext = createContext<AppContextType | null>(null)

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [grupos, setGrupos] = useState<ContextoGrupoComMembros[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loadingGrupos, setLoadingGrupos] = useState(true)
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all')

  const loadGrupos = useCallback(async () => {
    try {
      const listPromise = contextoService.listGruposComMembros()
      const timeoutPromise = new Promise<ContextoGrupoComMembros[]>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout ao carregar grupos')), 6000),
      )
      const list = await Promise.race([listPromise, timeoutPromise])
      setGrupos(list)
    } catch (err) {
      console.warn('Erro ou timeout ao carregar grupos de contexto:', err)
    } finally {
      setLoadingGrupos(false)
    }
  }, [])

  const loadEmpresas = useCallback(async () => {
    try {
      const listPromise = cadastrosService.listEmpresas()
      const timeoutPromise = new Promise<Empresa[]>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout ao carregar empresas')), 6000),
      )
      const list = await Promise.race([listPromise, timeoutPromise])
      setEmpresas(list)
    } catch (err) {
      console.warn('Erro ou timeout ao carregar empresas:', err)
    }
  }, [])

  useEffect(() => {
    // Carrega grupos e empresas em segundo plano e nunca trava a inicialização
    // Garante que loadingGrupos vá para false em no máximo 5 segundos
    const fallbackTimer = setTimeout(() => {
      setLoadingGrupos(false)
    }, 5000)

    Promise.allSettled([loadGrupos(), loadEmpresas()])
      .catch(() => {})
      .finally(() => {
        clearTimeout(fallbackTimer)
        setLoadingGrupos(false)
      })

    return () => {
      clearTimeout(fallbackTimer)
    }
  }, [loadGrupos, loadEmpresas])

  // Recupera escolha persistida (localStorage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.groupId) {
          setSelectedGroupId(parsed.groupId)
          return
        }
      }

      // Migração de estado legado do seletor anterior ('gestao_financeira_contexto')
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (legacy) {
        const parsed = JSON.parse(legacy)
        if (parsed.type === 'empresa' && parsed.empresaId) {
          // Procura grupo com essa empresa
          const matchedGroup = grupos.find((g) => g.empresas.some((e) => e.id === parsed.empresaId))
          if (matchedGroup) {
            setSelectedGroupId(matchedGroup.id)
            return
          }
        }
      }
    } catch {
      /* intentionally ignored */
    }
    // Default: 'all' (Todos)
    setSelectedGroupId('all')
  }, [grupos])

  const setContextAll = () => {
    setSelectedGroupId('all')
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ groupId: 'all' }))
    } catch {
      /* intentionally ignored */
    }
  }

  const setContextGroup = (groupId: string) => {
    setSelectedGroupId(groupId)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ groupId }))
    } catch {
      /* intentionally ignored */
    }
  }

  // Resolver grupo ativo
  const currentGroup = grupos.find((g) => g.id === selectedGroupId)
  const isGroupActive = selectedGroupId !== 'all' && !!currentGroup

  const pessoaIds = currentGroup?.pessoas.map((p) => p.id) || []
  const empresaIds = currentGroup?.empresas.map((e) => e.id) || []
  const contaIds = currentGroup?.contas.map((c) => c.id) || []

  // Conjunto e lista de todos os IDs de conta, empresa e pessoa vinculados a pelo menos um grupo
  const linkedContaIds = useMemo(() => {
    const set = new Set<string>()
    for (const g of grupos) {
      for (const c of g.contas) {
        set.add(c.id)
      }
    }
    return Array.from(set)
  }, [grupos])

  const linkedContaIdsSet = useMemo(() => new Set(linkedContaIds), [linkedContaIds])

  const linkedEmpresaIds = useMemo(() => {
    const set = new Set<string>()
    for (const g of grupos) {
      for (const e of g.empresas) {
        set.add(e.id)
      }
    }
    return Array.from(set)
  }, [grupos])

  const linkedEmpresaIdsSet = useMemo(() => new Set(linkedEmpresaIds), [linkedEmpresaIds])

  const linkedPessoaIds = useMemo(() => {
    const set = new Set<string>()
    for (const g of grupos) {
      for (const p of g.pessoas) {
        set.add(p.id)
      }
    }
    return Array.from(set)
  }, [grupos])

  const linkedPessoaIdsSet = useMemo(() => new Set(linkedPessoaIds), [linkedPessoaIds])

  // Constrói objeto de contexto ativo
  const activeContext: ActiveContextValue = useMemo(() => {
    if (isGroupActive && currentGroup) {
      const resumoPartes: string[] = []
      if (currentGroup.pessoas.length > 0)
        resumoPartes.push(`${currentGroup.pessoas.length} pessoa(s)`)
      if (currentGroup.empresas.length > 0)
        resumoPartes.push(`${currentGroup.empresas.length} empresa(s)`)
      if (currentGroup.contas.length > 0)
        resumoPartes.push(`${currentGroup.contas.length} conta(s)`)

      const sublabel =
        resumoPartes.length > 0
          ? resumoPartes.join(' · ')
          : currentGroup.observacoes || 'Grupo de visualização'

      return {
        mode: 'group',
        groupId: currentGroup.id,
        group: currentGroup,
        label: currentGroup.nome,
        sublabel,
        color: currentGroup.cor || '#DF5830',
        pessoaIds,
        empresaIds,
        contaIds,
        linkedContaIds,
        linkedEmpresaIds,
        linkedPessoaIds,
        isAll: false,
        hasPessoas: pessoaIds.length > 0,
        hasEmpresas: empresaIds.length > 0,
        type: empresaIds.length > 0 && pessoaIds.length === 0 ? 'empresa' : 'pessoal',
        empresaId: empresaIds[0],
      }
    }

    return {
      mode: 'all',
      label: 'Todos os cadastros',
      sublabel: 'Visão global consolidada (sem filtros)',
      color: '#DF5830',
      pessoaIds: [],
      empresaIds: [],
      contaIds: [],
      linkedContaIds,
      linkedEmpresaIds,
      linkedPessoaIds,
      isAll: true,
      hasPessoas: true,
      hasEmpresas: true,
      type: 'all',
    }
  }, [
    isGroupActive,
    currentGroup,
    pessoaIds,
    empresaIds,
    contaIds,
    linkedContaIds,
    linkedEmpresaIds,
    linkedPessoaIds,
  ])

  /**
   * Helper unificado de correspondência de contexto:
   * Retorna true se o item deve ser exibido sob o contexto ativo.
   * Quando "Todos" está ativo, retorna true para tudo.
   * Quando um grupo está ativo:
   *   - Se o item tiver pessoaId e essa pessoa estiver no grupo -> true
   *   - Se o item tiver empresaId e essa empresa estiver no grupo -> true
   *   - Se o item tiver contaId e essa conta estiver no grupo -> true
   *   - Se o item tiver contexto_tipo === 'pessoal' e o grupo possuir pessoas -> true
   *   - Se o item tiver contexto_tipo === 'empresa' e tiver empresa associada ao grupo -> true
   */
  const matchesContext = useCallback(
    (item: {
      pessoa?: string | null
      empresa?: string | null
      conta?: string | null
      contexto_tipo?: 'pessoal' | 'empresa' | null
    }): boolean => {
      if (activeContext.isAll) return true

      // Se o grupo não tiver nenhum membro cadastrado, não filtra fora
      if (
        activeContext.pessoaIds.length === 0 &&
        activeContext.empresaIds.length === 0 &&
        activeContext.contaIds.length === 0
      ) {
        return true
      }

      let matched = false

      if (item.pessoa && activeContext.pessoaIds.includes(item.pessoa)) {
        return true
      }
      if (item.empresa && activeContext.empresaIds.includes(item.empresa)) {
        return true
      }
      // Se a conta do item está explicitamente no grupo ativo -> true
      // Rede de segurança: se a conta NÃO pertence a NENHUM grupo (órfã), não fica invisível
      if (item.conta) {
        if (activeContext.contaIds.includes(item.conta)) {
          return true
        }
        if (!linkedContaIdsSet.has(item.conta)) {
          return true
        }
      }

      // Rede de segurança para Empresa: se o item está vinculado a uma empresa que NÃO pertence
      // a NENHUM grupo de contexto (órfã), não pode sumir em todas as visões de grupo.
      if (item.empresa && !linkedEmpresaIdsSet.has(item.empresa)) {
        // Se o grupo ativo for empresarial ou misto, ou se nenhum grupo tem a empresa,
        // exibe para não deixar o registro órfão invisível.
        if (activeContext.hasEmpresas || activeContext.empresaIds.length === 0) {
          return true
        }
      }

      // Rede de segurança para Pessoa: se a pessoa não pertence a nenhum grupo de contexto (órfã)
      if (item.pessoa && !linkedPessoaIdsSet.has(item.pessoa)) {
        if (activeContext.hasPessoas || activeContext.pessoaIds.length === 0) {
          return true
        }
      }

      // Se for contexto pessoal:
      // - Se o item tem pessoa definida, dá match se essa pessoa estiver no grupo (ou se for órfã conforme checagem acima)
      // - Se o item NÃO tem pessoa definida (ex.: eventos do Google Calendar, compromissos gerais, anotações):
      //   dá match se o grupo possui pessoas OU se o grupo for puramente pessoal (sem empresas).
      //   Nunca bloqueia se o grupo for pessoal. Se o grupo for exclusivamente empresarial (só empresas, sem pessoas),
      //   então não exibe registros puramente pessoais não vinculados.
      if (item.contexto_tipo === 'pessoal') {
        if (item.pessoa) {
          if (activeContext.pessoaIds.includes(item.pessoa)) {
            return true
          }
        } else {
          // Registro pessoal geral (sem pessoa específica):
          // Se o grupo ativo possui pessoas ou é um grupo sem membros empresa, deve ser exibido.
          if (activeContext.hasPessoas || activeContext.empresaIds.length === 0) {
            return true
          }
        }
      }

      // Se for contexto empresa:
      // - Match se o grupo contém essa empresa
      if (item.contexto_tipo === 'empresa') {
        if (item.empresa) {
          return activeContext.empresaIds.includes(item.empresa)
        }
        // Se não tem empresa específica definida no item, dá match se o grupo tem empresas
        if (activeContext.empresaIds.length > 0) {
          return true
        }
      }

      return matched
    },
    [activeContext, linkedContaIdsSet, linkedEmpresaIdsSet, linkedPessoaIdsSet],
  )

  return (
    <AppContext.Provider
      value={{
        activeContext,
        setContextAll,
        setContextGroup,
        grupos,
        loadingGrupos,
        refreshGrupos: loadGrupos,
        empresas,
        refreshEmpresas: loadEmpresas,
        matchesContext,
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
