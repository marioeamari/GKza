import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { dividasService } from '@/services/dividas'
import { renegociarCronograma, type DividaRecord, type ParcelaRecord } from '@/lib/dividas'
import { formatCurrency, getLocalDateStr } from '@/lib/format'
import { AlertCircle, History } from 'lucide-react'

interface RenegociacaoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  divida: DividaRecord
  parcelas: ParcelaRecord[]
  onSuccess: () => void
}

export function RenegociacaoModal({
  open,
  onOpenChange,
  divida,
  parcelas,
  onSuccess,
}: RenegociacaoModalProps) {
  const [salvando, setSalvando] = useState(false)

  // Identifica parcelas pagas
  const parcelasPagas = parcelas.filter((p) => p.status === 'paga')
  const totalPago = parcelasPagas.reduce(
    (acc, p) =>
      acc + (p.valor_pago !== undefined && p.valor_pago !== null ? p.valor_pago : p.valor),
    0,
  )

  // Saldo restante sugerido
  const montanteSugerido = Math.max(0, divida.valor_total - totalPago)
  const menorNumeroPendente = parcelas
    .filter((p) => p.status !== 'paga')
    .reduce((min, p) => Math.min(min, p.numero), parcelas.length + 1)

  const [aPartirDoNumero, setAPartirDoNumero] = useState(
    menorNumeroPendente > 0 && menorNumeroPendente <= parcelas.length
      ? menorNumeroPendente
      : parcelasPagas.length + 1,
  )
  const [novoMontanteRestante, setNovoMontanteRestante] = useState(String(montanteSugerido))
  const [novaQuantidadeParcelas, setNovaQuantidadeParcelas] = useState('6')
  const [primeiroNovoVencimento, setPrimeiroNovoVencimento] = useState(getLocalDateStr())

  // Modo: 'iguais' ou 'irregulares'
  const [modoValores, setModoValores] = useState<'iguais' | 'irregulares'>('iguais')
  const [valoresIrregulares, setValoresIrregulares] = useState<string[]>([])

  const handleQtdChange = (qtdStr: string) => {
    setNovaQuantidadeParcelas(qtdStr)
    const q = Number(qtdStr) || 0
    if (q > 0) {
      const montante = Number(novoMontanteRestante) || 0
      const base = Math.floor((montante / q) * 100) / 100
      setValoresIrregulares(Array.from({ length: q }, () => String(base)))
    }
  }

  const handleValorIrregularChange = (index: number, valStr: string) => {
    const copia = [...valoresIrregulares]
    copia[index] = valStr
    setValoresIrregulares(copia)
  }

  const somaIrregulares = valoresIrregulares.reduce((acc, v) => acc + (Number(v) || 0), 0)

  const handleSimularERenegociar = async (e: React.FormEvent) => {
    e.preventDefault()
    const montanteNum = Number(novoMontanteRestante)
    const qtdNum = Number(novaQuantidadeParcelas)

    if (montanteNum <= 0 || qtdNum <= 0) {
      toast({
        title: 'Dados inválidos',
        description: 'Informe um montante e uma quantidade de parcelas válidos.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      const valoresCustom =
        modoValores === 'irregulares' ? valoresIrregulares.map((v) => Number(v) || 0) : undefined

      // Gera o novo cronograma preservando o histórico das pagas
      const cronogramaRenegociado = renegociarCronograma({
        divida,
        parcelasAtuais: parcelas,
        aPartirDoNumero,
        novoMontanteRestante: montanteNum,
        novaQuantidadeParcelas: qtdNum,
        primeiroNovoVencimento,
        valoresCustomizados: valoresCustom,
      })

      // Identifica quais parcelas antigas devem ser deletadas:
      // Aquelas que NÃO estão pagas e cujo número >= aPartirDoNumero
      const parcelasParaExcluir = parcelas
        .filter((p) => p.status !== 'paga' && p.numero >= aPartirDoNumero)
        .map((p) => p.id)

      // Novas parcelas a criar: apenas as novas geradas
      const novasParaCriar = cronogramaRenegociado
        .filter((p) => p.id.startsWith('temp_reneg_'))
        .map((p) => ({
          divida: divida.id,
          numero: p.numero,
          data_vencimento: p.data_vencimento,
          valor: p.valor,
          status: 'pendente' as const,
          observacoes: `Renegociação a partir de ${primeiroNovoVencimento}`,
        }))

      await dividasService.substituirCronogramaRestante(
        divida.id,
        parcelasParaExcluir,
        novasParaCriar,
      )

      // Atualiza o status da dívida para renegociada se estava ativa
      if (divida.status === 'ativa') {
        await dividasService.updateDivida(divida.id, {
          status: 'renegociada',
          numero_parcelas: parcelasPagas.length + qtdNum,
        })
      }

      toast({
        title: 'Renegociação concluída com sucesso!',
        description: `${parcelasPagas.length} parcelas pagas preservadas e ${novasParaCriar.length} novas parcelas geradas.`,
      })

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao renegociar:', err)
      toast({
        title: 'Erro ao renegociar',
        description: err?.message || 'Falha ao aplicar renegociação.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-bold">
            <History className="w-5 h-5 text-primary" />
            Renegociação de Cronograma
          </DialogTitle>
          <DialogDescription>
            Recalcule as parcelas restantes da dívida <strong>{divida.nome}</strong>, preservando
            integralmente o histórico das parcelas já pagas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSimularERenegociar} className="space-y-4 pt-2">
          {/* AVISO DE PRESERVAÇÃO DE HISTÓRICO */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1 text-emerald-950">
              <strong className="block text-sm font-semibold text-emerald-900">
                Histórico Preservado Garantido
              </strong>
              <span>
                As <strong>{parcelasPagas.length} parcelas já pagas</strong> (totalizando{' '}
                <strong>{formatCurrency(totalPago)}</strong>) permanecerão intocadas com suas
                respectivas datas e comprovantes.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="corte">Recalcular a partir da Parcela #</Label>
              <Input
                id="corte"
                type="number"
                min="1"
                value={aPartirDoNumero}
                onChange={(e) => setAPartirDoNumero(Number(e.target.value))}
                required
              />
              <span className="text-[11px] text-muted-foreground">
                Substitui as parcelas pendentes a partir deste número
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="montante">Novo Montante Restante (R$) *</Label>
              <Input
                id="montante"
                type="number"
                step="0.01"
                min="0.01"
                value={novoMontanteRestante}
                onChange={(e) => {
                  setNovoMontanteRestante(e.target.value)
                  handleQtdChange(novaQuantidadeParcelas)
                }}
                required
              />
              <span className="text-[11px] text-muted-foreground">
                Saldo restante contratado / renegociado
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="novaQtd">Nova Quantidade de Parcelas</Label>
              <Input
                id="novaQtd"
                type="number"
                min="1"
                max="120"
                value={novaQuantidadeParcelas}
                onChange={(e) => handleQtdChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="novoVenc">Primeiro Novo Vencimento</Label>
              <Input
                id="novoVenc"
                type="date"
                value={primeiroNovoVencimento}
                onChange={(e) => setPrimeiroNovoVencimento(e.target.value)}
                required
              />
            </div>
          </div>

          {/* ESCOLHA: PARCELAS IGUAIS OU DIGITAR CADA VALOR (IRREGULARES) */}
          <div className="space-y-2 pt-1">
            <Label>Formato dos Valores das Novas Parcelas</Label>
            <Tabs
              value={modoValores}
              onValueChange={(v: any) => {
                setModoValores(v)
                if (v === 'irregulares' && valoresIrregulares.length === 0) {
                  handleQtdChange(novaQuantidadeParcelas)
                }
              }}
            >
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="iguais">Valores Iguais (Automático)</TabsTrigger>
                <TabsTrigger value="irregulares">Digitar Cada Valor (Irregulares)</TabsTrigger>
              </TabsList>

              <TabsContent value="iguais" className="pt-2 text-xs text-muted-foreground">
                O sistema dividirá os{' '}
                <strong className="text-foreground">
                  {formatCurrency(Number(novoMontanteRestante) || 0)}
                </strong>{' '}
                em <strong className="text-foreground">{novaQuantidadeParcelas} parcelas</strong> de{' '}
                <strong className="text-primary">
                  {formatCurrency(
                    (Number(novoMontanteRestante) || 0) / (Number(novaQuantidadeParcelas) || 1),
                  )}
                </strong>
                , ajustando os centavos finais na última parcela.
              </TabsContent>

              <TabsContent value="irregulares" className="pt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Defina valores individuais para cada parcela (ex: balões, sazonais):
                </p>
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 border border-border/70 rounded-lg p-2 bg-slate-50/50">
                  {valoresIrregulares.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="w-20 font-medium text-muted-foreground">
                        Parcela #{aPartirDoNumero + idx}:
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={val}
                        onChange={(e) => handleValorIrregularChange(idx, e.target.value)}
                        className="h-7 text-xs flex-1"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="text-muted-foreground">
                    Soma informada: <strong>{formatCurrency(somaIrregulares)}</strong>
                  </span>
                  <span
                    className={
                      Math.abs(somaIrregulares - (Number(novoMontanteRestante) || 0)) < 0.01
                        ? 'text-emerald-700 font-bold'
                        : 'text-amber-700 font-bold'
                    }
                  >
                    Diferença:{' '}
                    {formatCurrency(somaIrregulares - (Number(novoMontanteRestante) || 0))}
                  </span>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando}
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
            >
              {salvando ? 'Processando...' : 'Aplicar Renegociação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
