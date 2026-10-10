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
import { Plus, Trash2, Pencil, ReceiptText } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import type { DividaRecord, DespesaAvulsaRecord } from '@/lib/dividas'
import { dividasService } from '@/services/dividas'
import { toast } from '@/hooks/use-toast'
import { DespesaAvulsaModal } from './DespesaAvulsaModal'

interface DespesasMaquinaProps {
  divida: DividaRecord
  despesas: DespesaAvulsaRecord[]
  onRefresh: () => void
}

export function DespesasMaquina({ divida, despesas, onRefresh }: DespesasMaquinaProps) {
  const [modalNovaDespesa, setModalNovaDespesa] = useState(false)
  const [modalEditarDespesa, setModalEditarDespesa] = useState<DespesaAvulsaRecord | null>(null)

  const totalDespesas = despesas.reduce((acc, d) => acc + (d.valor || 0), 0)

  const handleExcluirDespesa = async (id: string, desc?: string) => {
    const nome = desc || 'esta despesa avulsa'
    if (!confirm(`Excluir ${nome}?`)) return
    try {
      await dividasService.deleteDespesa(id)
      toast({ title: 'Despesa avulsa excluída com sucesso!' })
      onRefresh()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir despesa',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* CABEÇALHO DO PAINEL DE DESPESAS AVULSAS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3.5 rounded-xl border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">
              Despesas Avulsas da Máquina ({divida.nome})
            </h3>
            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
              Total: {formatCurrency(totalDespesas)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Custos acessórios pagos avulsos (frete, montagem, adaptação elétrica, etc.). Consomem o
            caixa da dívida e possuem <strong>soma separada das parcelas</strong> do contrato.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setModalNovaDespesa(true)}
          className="text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar Despesa Avulsa
        </Button>
      </div>

      {/* TABELA DE DESPESAS AVULSAS */}
      <div className="rounded-xl border border-border bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="w-28">Data</TableHead>
                <TableHead>Descrição do Pagamento</TableHead>
                <TableHead>Fornecedor / Transportadora</TableHead>
                <TableHead className="text-right w-36">Valor Pago</TableHead>
                <TableHead className="text-center w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {despesas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                    <ReceiptText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    Nenhuma despesa avulsa registrada para esta máquina.
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Use para fretes, instalações ou peças pagas avulsas fora das parcelas.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                despesas.map((d) => (
                  <TableRow key={d.id} className="hover:bg-slate-50/50">
                    <TableCell className="text-xs font-semibold text-foreground">
                      {formatDate(d.data)}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-foreground">
                      {d.descricao || 'Despesa avulsa'}
                      {d.observacoes && (
                        <span className="block text-[11px] text-muted-foreground">
                          {d.observacoes}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {d.origem || '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold text-rose-600">
                      {formatCurrency(d.valor)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setModalEditarDespesa(d)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Editar despesa"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleExcluirDespesa(d.id, d.descricao)}
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          title="Excluir despesa"
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

      {/* MODAL CRIAR DESPESA AVULSA */}
      {modalNovaDespesa && (
        <DespesaAvulsaModal
          open={modalNovaDespesa}
          onOpenChange={setModalNovaDespesa}
          dividaId={divida.id}
          dividaNome={divida.nome}
          onSuccess={onRefresh}
        />
      )}

      {/* MODAL EDITAR DESPESA AVULSA */}
      {modalEditarDespesa && (
        <DespesaAvulsaModal
          open={Boolean(modalEditarDespesa)}
          onOpenChange={(op) => !op && setModalEditarDespesa(null)}
          dividaId={divida.id}
          dividaNome={divida.nome}
          despesaParaEditar={modalEditarDespesa}
          onSuccess={onRefresh}
        />
      )}
    </div>
  )
}
