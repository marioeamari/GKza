import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Plus,
  Trash2,
  Pencil,
  DollarSign,
  TrendingUp,
  Clock,
  Sparkles,
  Layers,
  ReceiptText,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import {
  calcularPaybackMaquina,
  type DividaRecord,
  type ParcelaRecord,
  type ReceitaRecord,
  type DespesaAvulsaRecord,
} from '@/lib/dividas'
import { dividasService } from '@/services/dividas'
import { toast } from '@/hooks/use-toast'
import { ReceitaModal } from './ReceitaModal'
import { DespesaAvulsaModal } from './DespesaAvulsaModal'

interface ReceitasMaquinaProps {
  divida: DividaRecord
  parcelas: ParcelaRecord[]
  receitas: ReceitaRecord[]
  despesas?: DespesaAvulsaRecord[]
  onRefresh: () => void
}

export function ReceitasMaquina({
  divida,
  parcelas,
  receitas,
  despesas = [],
  onRefresh,
}: ReceitasMaquinaProps) {
  const [modalNovaReceita, setModalNovaReceita] = useState(false)
  const [modalEditarReceita, setModalEditarReceita] = useState<ReceitaRecord | null>(null)
  const [modalNovaDespesa, setModalNovaDespesa] = useState(false)

  const payback = calcularPaybackMaquina(divida, parcelas, receitas, despesas)

  const handleExcluirReceita = async (id: string, desc: string) => {
    if (!confirm(`Excluir a receita "${desc}"?`)) return
    try {
      await dividasService.deleteReceita(id)
      toast({ title: 'Receita excluída!' })
      onRefresh()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir receita',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* PAINEL DE PAYBACK & COBERTURA DE PARCELAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CARD 1: Amortização Própria vs Bolso */}
        <div className="bg-white p-4 rounded-xl border border-border shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Origem dos Pagamentos Feitos
            </span>
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-black text-foreground">
              {formatCurrency(payback.total_pago)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Total já quitado desta máquina</p>
          </div>
          <div className="space-y-1.5 pt-1 border-t border-border/60 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Pago pela própria máquina:
              </span>
              <strong className="text-emerald-700">
                {formatCurrency(payback.pago_coberto_receitas)} ({payback.percentual_cobertura_pago}
                %)
              </strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                Coberto pelo bolso:
              </span>
              <strong className="text-slate-700">
                {formatCurrency(payback.pago_coberto_bolso)}
              </strong>
            </div>
          </div>
        </div>

        {/* CARD 2: Total de Receitas Geradas */}
        <div className="bg-white p-4 rounded-xl border border-border shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Receitas da Máquina
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-600">
              {formatCurrency(payback.total_receitas)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Faturamento acumulado gerado por ela
            </p>
          </div>
          <div className="pt-1 border-t border-border/60">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Amortização do Investimento</span>
              <span className="font-bold text-foreground">
                {payback.percentual_payback_investimento}%
              </span>
            </div>
            <Progress
              value={payback.percentual_payback_investimento}
              className="h-2 bg-slate-100"
            />
          </div>
        </div>

        {/* CARD 3: Payback do Investimento */}
        <div className="bg-white p-4 rounded-xl border border-border shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Payback do Investimento
            </span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            {payback.payback_alcancado ? (
              <Badge className="bg-emerald-100 text-emerald-800 text-sm font-bold border-0 px-2 py-1">
                🎉 Payback Atingido!
              </Badge>
            ) : (
              <div className="text-2xl font-black text-amber-600">
                {formatCurrency(payback.deficit_para_payback)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {payback.payback_alcancado
                ? 'A máquina já gerou mais do que seu custo total.'
                : 'Falta gerar para cobrir o investimento integral.'}
            </p>
          </div>
          <div className="pt-1 border-t border-border/60 text-xs text-muted-foreground flex items-center justify-between">
            <span>Estimativa de Payback:</span>
            <span className="font-semibold text-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {payback.payback_alcancado
                ? 'Concluído'
                : payback.meses_estimados_payback
                  ? `~ ${payback.meses_estimados_payback} meses`
                  : 'Aguardando mais dados'}
            </span>
          </div>
        </div>
      </div>

      {/* CABEÇALHO DA LISTA DE RECEITAS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3.5 rounded-xl border border-border shadow-xs">
        <div>
          <h3 className="text-base font-bold text-foreground">
            Receitas Registradas para {divida.nome}
          </h3>
          <p className="text-xs text-muted-foreground">
            Lançamentos de serviços e produções atribuídos a este ativo. Alimentam o caixa
            específico da máquina.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setModalNovaDespesa(true)}
            className="text-xs gap-1.5 text-rose-700 border-rose-200 hover:bg-rose-50 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Despesa Avulsa (ex: frete)
          </Button>
          <Button
            size="sm"
            onClick={() => setModalNovaReceita(true)}
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Lançar Receita da Máquina
          </Button>
        </div>
      </div>

      {/* TABELA DE RECEITAS */}
      <div className="rounded-xl border border-border bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição do Serviço / Produção</TableHead>
                <TableHead>Origem / Cliente</TableHead>
                <TableHead className="text-right">Valor Gerado</TableHead>
                <TableHead className="text-center w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receitas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                    Nenhuma receita lançada para esta máquina ainda. Clique no botão acima para
                    registrar.
                  </TableCell>
                </TableRow>
              ) : (
                receitas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium">{formatDate(r.data)}</TableCell>
                    <TableCell className="text-xs font-medium text-foreground">
                      {r.descricao}
                      {r.observacoes && (
                        <span className="block text-[11px] text-muted-foreground">
                          {r.observacoes}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.origem || '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold text-emerald-600">
                      {formatCurrency(r.valor)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setModalEditarReceita(r)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleExcluirReceita(r.id, r.descricao)}
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* MODAL ADICIONAR RECEITA */}
      {modalNovaReceita && (
        <ReceitaModal
          open={modalNovaReceita}
          onOpenChange={setModalNovaReceita}
          dividaId={divida.id}
          dividaNome={divida.nome}
          onSuccess={onRefresh}
        />
      )}

      {/* MODAL EDITAR RECEITA */}
      {modalEditarReceita && (
        <ReceitaModal
          open={Boolean(modalEditarReceita)}
          onOpenChange={(op) => !op && setModalEditarReceita(null)}
          dividaId={divida.id}
          dividaNome={divida.nome}
          receitaParaEditar={modalEditarReceita}
          onSuccess={onRefresh}
        />
      )}

      {/* MODAL RÁPIDO DESPESA AVULSA */}
      {modalNovaDespesa && (
        <DespesaAvulsaModal
          open={modalNovaDespesa}
          onOpenChange={setModalNovaDespesa}
          dividaId={divida.id}
          dividaNome={divida.nome}
          onSuccess={onRefresh}
        />
      )}
    </div>
  )
}
