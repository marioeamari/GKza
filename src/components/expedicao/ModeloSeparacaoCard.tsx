import { CheckCircle2, Circle, AlertTriangle, Image as ImageIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ItemSeparacaoCalculada } from '@/types/separacaoKits'
import pb from '@/lib/pocketbase/client'

interface ModeloSeparacaoCardProps {
  item: ItemSeparacaoCalculada
  onToggleSeparado: () => void
  disabled?: boolean
}

export function ModeloSeparacaoCard({
  item,
  onToggleSeparado,
  disabled = false,
}: ModeloSeparacaoCardProps) {
  const isSeparado = item.separado
  const fotoUrl = item.foto
    ? pb.files.getURL({ collectionName: 'kit_modelos', id: item.modelo_id || '' }, item.foto)
    : null

  return (
    <Card
      onClick={() => {
        if (!disabled) onToggleSeparado()
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 transition-all duration-200 select-none shadow-sm hover:shadow-md active:scale-[0.99]',
        isSeparado
          ? 'border-emerald-500 bg-emerald-50/40'
          : 'border-border/80 bg-card hover:border-primary/50',
      )}
    >
      {/* Alerta de Modelo Inativo */}
      {item.inativoAlerta && (
        <div className="flex items-center gap-1.5 bg-amber-500 px-3 py-1 text-xs font-bold text-white">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Modelo inativo no cadastro</span>
        </div>
      )}

      {/* Topo do Card com Código e Status */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'px-2.5 py-0.5 text-xs font-black tracking-wider uppercase',
              isSeparado
                ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                : 'border-primary/30 bg-primary/10 text-primary',
            )}
          >
            {item.codigo}
          </Badge>
          <span className="truncate text-xs font-semibold text-muted-foreground">{item.nome}</span>
        </div>

        {/* Indicador visual de check */}
        <div className="flex items-center gap-1">
          {isSeparado ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Separado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Circle className="h-4 w-4" />
              Pendente
            </span>
          )}
        </div>
      </div>

      {/* Corpo do Card: Imagem e Destaque da Quantidade */}
      <div className="flex flex-1 flex-col p-4 sm:flex-row sm:items-center sm:gap-4">
        {/* Imagem do modelo */}
        <div className="relative mb-3 flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-stone-200/80 bg-stone-50/80 p-1.5 sm:mb-0 sm:h-28 sm:w-40 dark:border-stone-800 dark:bg-stone-900/60">
          {fotoUrl ? (
            <img
              src={fotoUrl}
              alt={item.nome}
              className="h-full w-full object-contain transition duration-200 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground/60">
              <ImageIcon className="h-8 w-8 stroke-[1.5]" />
              <span className="mt-1 text-[11px] font-medium">Sem foto</span>
            </div>
          )}

          {/* Overlay suave quando separado */}
          {isSeparado && (
            <div className="absolute inset-0 flex items-center justify-center bg-emerald-950/20 backdrop-blur-[1px]">
              <div className="rounded-full bg-emerald-600 p-1.5 text-white shadow-md">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
          )}
        </div>

        {/* Informações centrais e DESTAQUE MÁXIMO DA QUANTIDADE */}
        <div className="flex flex-1 flex-col justify-between">
          <div>
            <h3 className="line-clamp-1 text-base font-bold text-foreground">{item.nome}</h3>
            <p className="text-xs text-muted-foreground">Código de estoque: {item.codigo}</p>
          </div>

          {/* BLOCO DE QUANTIDADE GIGANTE (MÁXIMO DESTAQUE VISUAL PARA O EXPEDIDOR) */}
          <div
            className={cn(
              'mt-3 rounded-xl p-3 text-center transition-all',
              isSeparado
                ? 'bg-emerald-100/70 border border-emerald-300'
                : 'bg-primary/10 border-2 border-primary/40',
            )}
          >
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">
              {isSeparado ? 'Conferido com sucesso' : 'Quantidade para separar'}
            </div>
            <div
              className={cn(
                'text-3xl font-black tracking-tight sm:text-4xl',
                isSeparado ? 'text-emerald-800' : 'text-primary',
              )}
            >
              {item.quantidade} <span className="text-sm font-bold uppercase">unidades</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rodapé: Botão de Ação Direta */}
      <div className="border-t border-border/50 bg-muted/20 p-3">
        <Button
          type="button"
          size="lg"
          variant={isSeparado ? 'outline' : 'default'}
          className={cn(
            'w-full text-sm font-black transition-all h-12',
            isSeparado
              ? 'border-emerald-500 text-emerald-700 hover:bg-emerald-100/60'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
          )}
          onClick={(e) => {
            e.stopPropagation()
            if (!disabled) onToggleSeparado()
          }}
          disabled={disabled}
        >
          {isSeparado ? (
            <>
              <CheckCircle2 className="mr-2 h-5 w-5 text-emerald-600" />✓ {item.codigo} —{' '}
              {item.quantidade} UNIDADES SEPARADAS
            </>
          ) : (
            <>
              <Circle className="mr-2 h-5 w-5" />
              MARCAR COMO SEPARADO ({item.quantidade} UN)
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
