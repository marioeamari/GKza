import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import {
  projetarCaixaPorMaquina,
  type DividaRecord,
  type ParcelaRecord,
  type ReceitaRecord,
} from '@/lib/dividas'

interface CaixaMaquinaProps {
  divida: DividaRecord
  parcelas: ParcelaRecord[]
  receitas: ReceitaRecord[]
  despesas?: import('@/lib/dividas').DespesaAvulsaRecord[]
}

export function CaixaMaquina({ divida, parcelas, receitas, despesas = [] }: CaixaMaquinaProps) {
  const projecao = projetarCaixaPorMaquina(divida, parcelas, receitas, despesas)

  return (
    <div className="space-y-5">
      {/* DESTAQUE PRINCIPAL: CAIXA ATUAL & MARCADOR "COBRE ATÉ A PARCELA X" */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CARD 1: Caixa Atual Disponível */}
        <div className="bg-white p-4 rounded-xl border border-border shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Caixa Específico da Máquina
            </span>
            <Wallet className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black text-foreground">
            {formatCurrency(projecao.caixa_atual_disponivel)}
          </div>
          <p className="text-xs text-muted-foreground">
            Saldo Inicial ({formatCurrency(projecao.saldo_inicial_configurado)}) + Receitas (
            {formatCurrency(projecao.total_receitas_historicas)}) - Despesas Avulsas (
            {formatCurrency(projecao.total_despesas_historicas)}) - Pagos (
            {formatCurrency(projecao.total_pago_historico)})
          </p>
        </div>

        {/* CARD 2: Marcador "Cobre até a Parcela X" */}
        <div className="bg-white p-4 rounded-xl border border-border shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Última Parcela Coberta
            </span>
          </div>
          {projecao.ultima_parcela_coberta ? (
            <div>
              <div className="text-2xl font-black text-emerald-700">
                Parcela #{projecao.ultima_parcela_coberta.numero}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vencimento em {formatDate(projecao.ultima_parcela_coberta.data_vencimento)} (
                {formatCurrency(projecao.ultima_parcela_coberta.valor)})
              </p>
            </div>
          ) : (
            <div>
              <div className="text-lg font-bold text-amber-700">Nenhuma parcela futura coberta</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                O caixa atual não cobre a próxima parcela integralmente.
              </p>
            </div>
          )}
        </div>

        {/* CARD 3: Quando o caixa começará a faltar */}
        <div className="bg-white p-4 rounded-xl border border-border shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Previsão de Falta de Caixa
            </span>
          </div>
          {projecao.primeira_parcela_descoberta ? (
            <div>
              <div className="text-2xl font-black text-rose-600">
                Parcela #{projecao.primeira_parcela_descoberta.numero}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Falta {formatCurrency(projecao.primeira_parcela_descoberta.saldo_faltante)} em{' '}
                {formatDate(projecao.primeira_parcela_descoberta.data_vencimento)}
              </p>
            </div>
          ) : (
            <div>
              <div className="text-lg font-bold text-emerald-700">100% Coberto com o Caixa!</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Todas as parcelas pendentes estão amparadas pelo caixa disponível.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* SIMULAÇÃO MÊS A MÊS: RECEITAS ENTRANDO vs PARCELAS VENCENDO */}
      <div className="bg-white rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="p-4 border-b border-border/70 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" />
              Simulação de Caixa Mês a Mês ({divida.nome})
            </h4>
            <p className="text-xs text-muted-foreground">
              Projeção do saldo da máquina: Saldo Inicial do mês + Receitas do mês - Parcelas a
              pagar = Saldo Final.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead>Competência (Mês/Ano)</TableHead>
                <TableHead className="text-right">Saldo Inicial</TableHead>
                <TableHead className="text-right text-emerald-700">+ Receitas</TableHead>
                <TableHead className="text-right text-rose-700">- Despesas Avulsas</TableHead>
                <TableHead className="text-right text-slate-700">- Parcelas do Mês</TableHead>
                <TableHead className="text-right font-bold">Saldo Final Projetado</TableHead>
                <TableHead className="text-center w-36">Status do Mês</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projecao.linhas_mensais.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                    Sem parcelas futuras ou movimentações para projeção.
                  </TableCell>
                </TableRow>
              ) : (
                projecao.linhas_mensais.map((linha) => {
                  const [ano, mes] = linha.mes_ano.split('-')
                  const labelMes = `${mes}/${ano}`
                  const saldoNegativo = linha.saldo_final_mes < 0

                  return (
                    <TableRow
                      key={linha.mes_ano}
                      className={saldoNegativo ? 'bg-rose-50/40' : undefined}
                    >
                      <TableCell className="text-xs font-bold text-foreground">
                        {labelMes}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatCurrency(linha.saldo_inicial_mes)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-emerald-600">
                        {formatCurrency(linha.receitas_mes)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-rose-600">
                        {formatCurrency(linha.despesas_mes)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-slate-700">
                        {formatCurrency(linha.parcelas_mes)}
                        {linha.parcelas_detalhe.length > 0 && (
                          <span className="block text-[10px] text-muted-foreground font-normal">
                            {linha.parcelas_detalhe.map((p) => `#${p.numero}`).join(', ')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right text-xs font-bold ${
                          saldoNegativo ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(linha.saldo_final_mes)}
                      </TableCell>
                      <TableCell className="text-center">
                        {linha.coberto ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 text-[11px] gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Caixa Suficiente
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-0 text-[11px] gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600" /> Faltará Caixa
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
