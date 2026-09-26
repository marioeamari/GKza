import { useState } from 'react'
import { AlertTriangle, LoaderCircle, Plus } from 'lucide-react'
import { useAppContext } from '@/contexts/AppContext'
import { contextoService } from '@/services/contexto'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import type { Empresa, Pessoa } from '@/types/domain'

interface EntidadeContextoWarningProps {
  tipo: 'empresa' | 'pessoa'
  entidadeId?: string
  entidadeNome?: string
  empresas?: Empresa[]
  pessoas?: Pessoa[]
  onLinked?: () => void
  className?: string
}

/**
 * Componente permanente de guarda de contexto para Empresas e Pessoas:
 * Quando o usuário seleciona uma empresa ou pessoa que não pertence ao contexto ativo,
 * exibe um aviso com o botão de 1 clique "Vincular ao contexto atual".
 */
export function EntidadeContextoWarning({
  tipo,
  entidadeId,
  entidadeNome,
  empresas,
  pessoas,
  onLinked,
  className = '',
}: EntidadeContextoWarningProps) {
  const { activeContext, refreshGrupos } = useAppContext()
  const { toast } = useToast()
  const [linking, setLinking] = useState(false)
  const [justLinked, setJustLinked] = useState(false)

  // Se a visão for "Todos" ou se não houver um grupo específico ativo, não há alerta
  if (activeContext.isAll || !activeContext.groupId || !entidadeId || entidadeId === 'nenhuma') {
    return null
  }

  // Verifica se já pertence ao grupo ativo
  const isMember =
    tipo === 'empresa'
      ? activeContext.empresaIds.includes(entidadeId)
      : activeContext.pessoaIds.includes(entidadeId)

  if (isMember || justLinked) {
    return null
  }

  let resolvedNome = entidadeNome
  if (!resolvedNome) {
    if (tipo === 'empresa' && empresas) {
      const e = empresas.find((item) => item.id === entidadeId)
      resolvedNome = e ? e.nome_fantasia || e.razao_social : 'Esta empresa'
    } else if (tipo === 'pessoa' && pessoas) {
      const p = pessoas.find((item) => item.id === entidadeId)
      resolvedNome = p ? p.nome : 'Esta pessoa'
    } else {
      resolvedNome = tipo === 'empresa' ? 'Esta empresa' : 'Esta pessoa'
    }
  }

  const contextName = activeContext.label

  const handleLink = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    if (!activeContext.groupId || linking) return

    setLinking(true)
    try {
      if (tipo === 'empresa') {
        await contextoService.linkEmpresaToGrupo(entidadeId, activeContext.groupId)
      } else {
        await contextoService.linkPessoaToGrupo(entidadeId, activeContext.groupId)
      }
      await refreshGrupos()
      setJustLinked(true)
      toast({
        title: `${tipo === 'empresa' ? 'Empresa' : 'Pessoa'} vinculada ao contexto!`,
        description: `"${resolvedNome}" agora faz parte do contexto "${contextName}". Os registros vinculados aparecerão nesta visão.`,
      })
      onLinked?.()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Falha ao vincular ao contexto',
        description: apiMessage(err),
      })
    } finally {
      setLinking(false)
    }
  }

  return (
    <div
      className={`flex items-center justify-between gap-2.5 rounded-lg border border-amber-300/80 bg-amber-500/10 p-2.5 text-xs text-amber-900 transition-all ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-2 min-w-0">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#DF5830]" />
        <div className="min-w-0 leading-snug">
          <p className="font-semibold text-foreground">
            {tipo === 'empresa' ? 'Empresa' : 'Pessoa'} fora do contexto ativo ({contextName})
          </p>
          <p className="text-[11px] text-muted-foreground">
            {tipo === 'empresa' ? 'O registro' : 'A rotina'} pode não aparecer nesta visão porque "
            {resolvedNome}" não está vinculada a {contextName}.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleLink}
        disabled={linking}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#DF5830]/40 bg-white px-2 py-1 text-[11px] font-bold text-[#DF5830] shadow-sm hover:bg-[#DF5830]/10 transition disabled:opacity-50"
        title={`Vincular "${resolvedNome}" ao contexto "${contextName}"`}
      >
        {linking ? (
          <>
            <LoaderCircle className="h-3 w-3 animate-spin" />
            <span>Vinculando...</span>
          </>
        ) : (
          <>
            <Plus className="h-3 w-3" />
            <span>Vincular ao contexto</span>
          </>
        )}
      </button>
    </div>
  )
}
