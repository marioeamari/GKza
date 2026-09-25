import { useState } from 'react'
import { AlertTriangle, Check, LoaderCircle, Plus } from 'lucide-react'
import { useAppContext } from '@/contexts/AppContext'
import { contextoService } from '@/services/contexto'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import type { Conta } from '@/types/domain'

interface ContaContextoWarningProps {
  /** A conta atualmente selecionada no diálogo/formulário */
  conta?: Conta | null
  /** Alternativamente, o id da conta selecionada se o objeto não for passado diretamente */
  contaId?: string
  /** Lista de contas disponíveis para resolução quando passado apenas contaId */
  contas?: Conta[]
  /** Callback opcional chamado logo após a conta ser vinculada com sucesso */
  onLinked?: () => void
  /** Classe extra para o container */
  className?: string
}

/**
 * Componente permanente de guarda de contexto:
 * Quando o usuário seleciona uma conta pagadora que NÃO pertence ao contexto ativo
 * (e a conta já tem vínculo com outros contextos, de forma que o lançamento ficaria invisível na visão atual),
 * exibe um aviso discreto com um botão de 1 clique "Vincular ao contexto atual".
 *
 * Ao clicar, cria o registro em contexto_grupo_membros (tipo 'conta') no grupo ativo
 * e atualiza o estado global de grupos via refreshGrupos().
 */
export function ContaContextoWarning({
  conta,
  contaId,
  contas,
  onLinked,
  className = '',
}: ContaContextoWarningProps) {
  const { activeContext, refreshGrupos } = useAppContext()
  const { toast } = useToast()
  const [linking, setLinking] = useState(false)
  const [justLinked, setJustLinked] = useState(false)

  // Se a visão for "Todos" ou se não houver um grupo específico ativo, não há alerta
  if (activeContext.isAll || !activeContext.groupId) {
    return null
  }

  const resolvedConta = conta || (contaId && contas ? contas.find((c) => c.id === contaId) : null)
  const currentContaId = resolvedConta?.id || contaId

  if (!currentContaId) {
    return null
  }

  // Verifica se a conta já pertence ao grupo ativo
  const belongsToActiveContext = activeContext.contaIds.includes(currentContaId)
  if (belongsToActiveContext || justLinked) {
    return null
  }

  // Verifica se a conta é órfã (não pertence a NENHUM grupo)
  // Se for órfã, o fallback global do ERP já exibe a conta para não deixá-la invisível,
  // mas se ela tem vínculo com OUTRO grupo (ex: apenas PJ) e não com o ativo (ex: Casa),
  // o lançamento ficará invisível no filtro de contexto atual.
  const isLinkedToOtherGroups = activeContext.linkedContaIds.includes(currentContaId)
  if (!isLinkedToOtherGroups) {
    // Conta órfã: é coberta pelo safety-net e também pode ser vinculada
  }

  const contaNome = resolvedConta?.nome || 'Esta conta'
  const contextName = activeContext.label

  const handleLink = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    if (!activeContext.groupId || linking) return

    setLinking(true)
    try {
      await contextoService.linkContaToGrupo(currentContaId, activeContext.groupId)
      await refreshGrupos()
      setJustLinked(true)
      toast({
        title: 'Conta vinculada ao contexto!',
        description: `"${contaNome}" agora faz parte do contexto "${contextName}". O lançamento aparecerá nesta visão.`,
      })
      onLinked?.()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Falha ao vincular conta',
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
            Conta fora do contexto atual ({contextName})
          </p>
          <p className="text-[11px] text-muted-foreground">
            O lançamento não aparecerá nesta visão porque "{contaNome}" pertence a outro contexto.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleLink}
        disabled={linking}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#DF5830]/40 bg-white px-2 py-1 text-[11px] font-bold text-[#DF5830] shadow-sm hover:bg-[#DF5830]/10 transition disabled:opacity-50"
        title={`Vincular "${contaNome}" ao contexto "${contextName}"`}
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
