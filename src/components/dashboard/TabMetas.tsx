import React, { useMemo } from 'react'
import {
  Target,
  TrendingUp,
  CheckCircle2,
  Calendar,
  AlertCircle,
  ArrowRight,
  Plus,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/format'
import { ModernKpiCard } from './ModernKpiCard'
import type { MetaMeta } from '@/types/domain'

interface TabMetasProps {
  metas: MetaMeta[]
}

export function TabMetas({ metas }: TabMetasProps) {
  const ativas = useMemo(() => {
    return metas.filter((m) => m.status === 'em_andamento')
  }, [metas])

  const concluidas = useMemo(() => {
    return metas.filter((m) => m.status === 'atingida')
  }, [metas])

  const progressoMedio = useMemo(() => {
    if (!ativas.length) return 0
    const soma = ativas.reduce((acc, m) => {
      if (m.tipo_progresso === 'manual') return acc + (m.progresso_manual || 0)
      // Se for tarefas vinculadas
      const totalT = m.tarefas?.length || 0
      if (totalT === 0) return acc
      return acc + (m.progresso_manual || 0)
    }, 0)
    return soma / ativas.length
  }, [ativas])

  return (
    <div className="space-y-4">
      {/* KPIs de Metas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ModernKpiCard
          title="Metas em Andamento"
          value={ativas.length}
          isCurrency={false}
          icon={Target}
          to="/hub-metas"
          colorClass="text-primary"
          bgLightClass="bg-primary/10"
          subtitle="Objetivos estratégicos ativos"
        />

        <ModernKpiCard
          title="Metas Atingidas"
          value={concluidas.length}
          isCurrency={false}
          icon={CheckCircle2}
          to="/hub-metas"
          colorClass="text-emerald-700"
          bgLightClass="bg-emerald-50"
          subtitle="Concluídas com sucesso"
        />

        <ModernKpiCard
          title="Progresso Médio"
          value={`${progressoMedio.toFixed(0)}%`}
          isCurrency={false}
          icon={TrendingUp}
          to="/hub-metas"
          colorClass="text-indigo-700"
          bgLightClass="bg-indigo-50"
          subtitle="Avanço médio das metas ativas"
        />

        <ModernKpiCard
          title="Total Cadastradas"
          value={metas.length}
          isCurrency={false}
          icon={Calendar}
          to="/hub-metas"
          colorClass="text-foreground"
          bgLightClass="bg-secondary"
          subtitle="Empresariais e pessoais"
        />
      </div>

      {/* Grid de Metas Ativas com Barra de Progresso */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base font-bold">Acompanhamento das Metas Ativas</CardTitle>
            <p className="text-xs text-muted-foreground">
              Progresso e status de execução dos objetivos estratégicos
            </p>
          </div>
          <Button size="sm" asChild className="text-xs font-semibold">
            <Link to="/hub-metas">
              <Plus className="mr-1 h-3.5 w-3.5" /> Nova meta
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {ativas.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {ativas.map((meta) => {
                const progresso = meta.progresso_manual || 0

                return (
                  <div
                    key={meta.id}
                    className="p-4 rounded-xl border border-border/80 hover:shadow-xs transition bg-card flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ background: meta.cor || '#DF5830' }}
                          />
                          <h4 className="text-sm font-bold text-foreground leading-snug">
                            {meta.titulo}
                          </h4>
                        </div>
                        <Badge
                          variant="outline"
                          className="capitalize text-[10px] shrink-0 font-medium"
                        >
                          {meta.contexto_tipo}
                        </Badge>
                      </div>

                      {meta.descricao && (
                        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                          {meta.descricao}
                        </p>
                      )}

                      {meta.alvo_descricao && (
                        <p className="mt-2 text-xs font-medium text-foreground">
                          Alvo:{' '}
                          <span className="text-primary font-bold">{meta.alvo_descricao}</span>
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-2 border-t border-border/50">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-extrabold text-foreground">{progresso}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(progresso, 100)}%`,
                            background: meta.cor || '#DF5830',
                          }}
                        />
                      </div>

                      {meta.prazo && (
                        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                          <span>Prazo estimado:</span>
                          <span className="font-medium">{formatDate(meta.prazo)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Target className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">Nenhuma meta em andamento</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Crie metas de faturamento, redução de despesas ou reserva para acompanhar aqui.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3 text-xs">
                <Link to="/hub-metas">Ir para Hub de Metas</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
