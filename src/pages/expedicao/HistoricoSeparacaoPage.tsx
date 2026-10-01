import { useEffect, useState } from 'react'
import { History, CheckCircle2, Clock, User, ShoppingBag, Layers, Search } from 'lucide-react'
import { ExpedicaoHeader } from '@/components/expedicao/ExpedicaoHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { separacaoKitsService } from '@/services/separacaoKits'
import type { KitHistoricoSeparacao } from '@/types/separacaoKits'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function HistoricoSeparacaoPage() {
  const [historico, setHistorico] = useState<KitHistoricoSeparacao[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  const carregarHistorico = async () => {
    try {
      setLoading(true)
      const data = await separacaoKitsService.getHistorico(100)
      setHistorico(data)
    } catch (err) {
      console.error('Erro ao carregar histórico:', err)
      toast({
        title: 'Erro',
        description: 'Não foi possível buscar os registros de histórico.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarHistorico()
  }, [])

  const filtrados = historico.filter((h) => {
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return (
      h.numero_pedido?.toLowerCase().includes(q) ||
      h.marketplace?.toLowerCase().includes(q) ||
      h.funcionario_nome?.toLowerCase().includes(q) ||
      h.tema_nome?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <ExpedicaoHeader
        title="Histórico de Separações"
        description="Auditoria de cada conferência realizada: data, horário de início/término, operador responsável, tema e composição exata dos modelos."
      />

      {/* BARRA DE BUSCA */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por número do pedido, marketplace, funcionário..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <div className="text-xs font-semibold text-muted-foreground">
          Total de {filtrados.length} separação(ões) registrada(s)
        </div>
      </div>

      {/* LISTAGEM DOS REGISTROS */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">Registros de Separação de Kits</CardTitle>
          <CardDescription className="text-xs">
            Histórico completo gravado ao clicar em "Finalizar Separação"
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filtrados.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nenhuma separação registrada ainda.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filtrados.map((h) => {
                const comp = Array.isArray(h.composicao_utilizada) ? h.composicao_utilizada : []

                return (
                  <div key={h.id} className="p-5 hover:bg-muted/20 transition space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-primary/40 bg-primary/10 text-xs font-black text-primary"
                        >
                          Pedido #{h.numero_pedido}
                        </Badge>
                        {h.marketplace && (
                          <Badge variant="secondary" className="font-bold text-xs">
                            {h.marketplace}
                          </Badge>
                        )}
                        <Badge
                          className={cn(
                            'text-[10px] font-bold uppercase',
                            h.tipo_composicao === 'personalizada'
                              ? 'bg-amber-600 text-white'
                              : 'bg-muted text-foreground',
                          )}
                        >
                          {h.tipo_composicao === 'personalizada' ? 'Personalizada' : 'Padrão'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-emerald-500 bg-emerald-50 text-emerald-800 text-[10px] font-bold"
                        >
                          ✓ Concluído
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {h.data_fim
                            ? new Date(h.data_fim).toLocaleString('pt-BR')
                            : h.created
                              ? new Date(h.created).toLocaleString('pt-BR')
                              : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      {h.produto_nome && (
                        <span>
                          Produto: <strong className="text-foreground">{h.produto_nome}</strong>
                        </span>
                      )}
                      {h.tema_nome && (
                        <span>
                          Tema: <strong className="text-foreground">{h.tema_nome}</strong>
                        </span>
                      )}
                      <span>
                        Quantidade:{' '}
                        <strong className="text-foreground">{h.quantidade_total} unidades</strong>
                      </span>
                      {h.funcionario_nome && (
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          Operador:{' '}
                          <strong className="text-foreground">{h.funcionario_nome}</strong>
                        </span>
                      )}
                    </div>

                    {/* Modelos conferidos */}
                    <div className="rounded-xl bg-muted/40 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Composição Separada:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {comp.map((c, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-white px-2.5 py-1 text-xs font-bold text-foreground shadow-2xs"
                          >
                            <span className="text-primary font-black">{c.codigo}</span>
                            <span>({c.nome}):</span>
                            <span className="rounded bg-primary/10 px-1 text-primary">
                              {c.quantidade} un
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
