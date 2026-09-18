import type { ComponentProps } from 'react'
import { LockKeyhole } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface PermissionButtonProps extends ComponentProps<typeof Button> {
  allowed: boolean
}

export function PermissionButton({ allowed, children, ...props }: PermissionButtonProps) {
  if (allowed) return <Button {...props}>{children}</Button>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-not-allowed">
          <Button {...props} disabled className={props.className}>
            <LockKeyhole className="mr-2 h-4 w-4" />
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Sem permissão para esta ação</TooltipContent>
    </Tooltip>
  )
}
