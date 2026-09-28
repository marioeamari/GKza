import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, DollarSign, LoaderCircle, Scale } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { formatCurrency, formatDate, isWithin, toPocketBaseDate } from '@/lib/format'
import { marketplacesService } from '@/services/marketplaces'
import { precificacaoService } from '@/services/precificacao'
import type { Repasse, Venda } from '@/types/domain'
import type { PrecCanalRecord, PrecTaxaRecord } from '@/types/precificacao'

export function ConfirmPayoutDialog({
  record,
  onOpenChange,
  onSaved,
}: {
  record: Repasse | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [dataRealizada, setDataRealizada] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [vendas, setVendas] = useState<Venda[]>([])
  const [canais, setCanais] = useState<PrecCanalRecord[]>([])
  const [taxas, setTaxas] = useState<PrecTaxaRecord[]>([])
  const { toast } = useToast()

  useEffect(() => {
    if (record) {
      setDataRealizada(new Date().toISOString().slice(0, 10))
      setErrors({})

      Promise.all([
        marketplacesService.listVendas(),
        precificacaoService.listCanais(),
        precificacaoService.listTaxas(),
      ])
        .then(([vnds, chans, txs]) => {
          setVendas(vnds)
          setCanais(chans)
          setTaxas(txs)
        })
        .catch((err) => console.warn('Erro ao carregar validação para confirmar repasse:', err))
    }
  }, [record])

  // Conciliação rápida das vendas do período deste repasse
  const analiseConciliacao = useMemo(() => {
    if (!record) return null
    const vendasPeriodo = vendas.filter(
      (v) =>
        v.marketplace_conta === record.marketplace_conta &&
        isWithin(v.data, new Date(record.periodo_inicio), new Date(record.periodo_fim)),
    )

    const mpId = record.expand?.marketplace_conta?.marketplace
    const canal = canais.find((c) => c.marketplace === mpId)
    const canalTaxas = canal ? taxas.filter((t) => t.canal === canal.id) : []

    let taxaComissaoPct = record.expand?.marketplace_conta?.comissao_percentual || 0
    const taxaConfig = canalTaxas.find(
      (t) =>
        t.tipo_valor === 'percentual' &&
        (t.tipo_regra === 'comissao' || t.nome.toLowerCase().includes('comiss')),
    )
    if (taxaConfig?.valor !== undefined) {
      taxaComissaoPct = taxaConfig.valor
    }

    const totalBruto = vendasPeriodo.reduce((acc, v) => acc + (v.valor_bruto || 0), 0)
    const comissaoEsperada = Math.round(totalBruto * (taxaComissaoPct / 100) * 100) / 100
    const valorEsperado = Math.max(0, Math.round((totalBruto - comissaoEsperada) * 100) / 100)
    const diferenca = Math.round((record.valor - valorEsperado) * 100) / 100

    let status: 'bate' | 'faltando' | 'a_mais' | 'sem_vendas' = 'bate'
    if (vendasPeriodo.length === 0) status = 'sem_vendas'
    else if (Math.abs(diferenca) <= 0.5) status = 'bate'
    else if (diferenca < -0.5) status = 'faltando'
    else status = 'a_mais'

    return {
      qtdVendas: vendasPeriodo.length,
      canalNome: canal?.nome,
      taxaComissaoPct,
      totalBruto,
      valorEsperado,
      diferenca,
      status,
    }
  }, [record, vendas, canais, taxas])

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!record) return
    setSaving(true)
    try {
      await marketplacesService.confirmRepasse(record.id, toPocketBaseDate(dataRealizada))
      toast({
        title: 'Repasse confirmado',
        description: 'Status atualizado para realizado e lançamento registrado.',
      })
      onOpenChange(false)
      onSaved()
    } catch (error) {
      setErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  if (!record) return null

  return (
    <Dialog open={!!record} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar recebimento do repasse</DialogTitle>
          <DialogDescription>
            {record.expand?.marketplace_conta?.apelido} · Período de{' '}
            {formatDate(record.periodo_inicio)} a {formatDate(record.periodo_fim)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={confirm} className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Valor do repasse recebido:</span>
              <strong className="text-xl font-bold font-mono text-primary">
                {formatCurrency(record.valor)}
              </strong>
            </div>

            {analiseConciliacao && analiseConciliacao.qtdVendas > 0 && (
              <div className="pt-2 border-t border-border/60 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Scale className="h-3.5 w-3.5 text-primary" />
                    Validação com taxa do canal ({analiseConciliacao.taxaComissaoPct}%):
                  </span>
                  {analiseConciliacao.status === 'bate' && (
                    <Badge className="bg-emerald-600 text-white text-[10px] gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Comissão Bate!
                    </Badge>
                  )}
                  {analiseConciliacao.status === 'faltando' && (
                    <Badge
                      variant="destructive"
                      className="bg-red-600 text-white text-[10px] gap-1"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Faltando {formatCurrency(Math.abs(analiseConciliacao.diferenca))}
                    </Badge>
                  )}
                  {analiseConciliacao.status === 'a_mais' && (
                    <Badge className="bg-blue-600 text-white text-[10px] gap-1">
                      <DollarSign className="h-3 w-3" />
                      Veio a mais (+{formatCurrency(analiseConciliacao.diferenca)})
                    </Badge>
                  )}
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>
                    Esperado pelo canal: {formatCurrency(analiseConciliacao.valorEsperado)}
                  </span>
                  <span>{analiseConciliacao.qtdVendas} vendas no período</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Data da Realização do Depósito</Label>
            <Input
              type="date"
              value={dataRealizada}
              onChange={(e) => setDataRealizada(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {errors.form && <p className="field-error">{errors.form}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} className="bg-primary text-white font-bold">
              {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar Recebimento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
