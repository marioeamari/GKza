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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Calendar, DollarSign } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { dividasService } from '@/services/dividas'
import { simularParcelasRestantes, type DividaRecord } from '@/lib/dividas'
import { formatCurrency, getLocalDateStr } from '@/lib/format'

interface DividaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dividaParaEditar?: DividaRecord | null
  onSuccess: () => void
}

interface EntradaJaFeita {
  id: string
  valor: number
  data: string
  observacoes?: string
}

export function DividaDialog({
  open,
  onOpenChange,
  dividaParaEditar,
  onSuccess,
}: DividaDialogProps) {
  const [salvando, setSalvando] = useState(false)

  // Campos principais
  const [nome, setNome] = useState(dividaParaEditar?.nome || '')
  const [credor, setCredor] = useState(dividaParaEditar?.credor || '')
  const [valorTotal, setValorTotal] = useState<string>(
    dividaParaEditar?.valor_total ? String(dividaParaEditar.valor_total) : '',
  )
  const [dataContratacao, setDataContratacao] = useState(
    dividaParaEditar?.data_contratacao
      ? dividaParaEditar.data_contratacao.slice(0, 10)
      : getLocalDateStr(),
  )
  const [taxaJuros, setTaxaJuros] = useState<string>(
    dividaParaEditar?.taxa_juros !== undefined ? String(dividaParaEditar.taxa_juros) : '',
  )
  const [taxaJurosTipo, setTaxaJurosTipo] = useState<'mensal' | 'anual' | 'total'>(
    dividaParaEditar?.taxa_juros_tipo || 'mensal',
  )
  const [status, setStatus] = useState<'ativa' | 'quitada' | 'renegociada'>(
    dividaParaEditar?.status || 'ativa',
  )
  const [saldoInicialCaixa, setSaldoInicialCaixa] = useState<string>(
    dividaParaEditar?.saldo_inicial_caixa !== undefined
      ? String(dividaParaEditar.saldo_inicial_caixa)
      : '0',
  )
  const [observacoes, setObservacoes] = useState(dividaParaEditar?.observacoes || '')

  // Configuração inicial de parcelas (apenas na criação)
  const [numeroParcelas, setNumeroParcelas] = useState<string>(
    dividaParaEditar?.numero_parcelas ? String(dividaParaEditar.numero_parcelas) : '12',
  )
  const [primeiroVencimento, setPrimeiroVencimento] = useState(getLocalDateStr())

  // Entradas/Pagamentos já feitos (caso real do usuário: ex: 2 pagamentos já realizados)
  const [entradas, setEntradas] = useState<EntradaJaFeita[]>([])

  const totalEntradas = entradas.reduce((acc, e) => acc + (Number(e.valor) || 0), 0)
  const valorTotalNum = Number(valorTotal) || 0
  const montanteRestante = Math.max(0, valorTotalNum - totalEntradas)

  const adicionarEntrada = () => {
    setEntradas((prev) => [
      ...prev,
      {
        id: `entrada_${Date.now()}_${Math.random()}`,
        valor: 0,
        data: getLocalDateStr(),
        observacoes: `Entrada / Pagamento realizado`,
      },
    ])
  }

  const removerEntrada = (id: string) => {
    setEntradas((prev) => prev.filter((e) => e.id !== id))
  }

  const atualizarEntrada = (id: string, campo: keyof EntradaJaFeita, valor: any) => {
    setEntradas((prev) => prev.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim() || !credor.trim() || !valorTotalNum) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe o nome da máquina/dívida, credor e valor total.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      if (dividaParaEditar) {
        // Atualização de dívida existente
        await dividasService.updateDivida(dividaParaEditar.id, {
          nome: nome.trim(),
          credor: credor.trim(),
          valor_total: valorTotalNum,
          data_contratacao: dataContratacao,
          taxa_juros: taxaJuros ? Number(taxaJuros) : undefined,
          taxa_juros_tipo: taxaJurosTipo,
          status,
          saldo_inicial_caixa: Number(saldoInicialCaixa) || 0,
          observacoes: observacoes.trim() || undefined,
        })
        toast({ title: 'Dívida atualizada com sucesso!' })
      } else {
        // Criação de nova dívida com geração de entradas e parcelas restantes
        const numParc = Number(numeroParcelas) || 1
        const dividaCriada = await dividasService.createDivida({
          nome: nome.trim(),
          credor: credor.trim(),
          valor_total: valorTotalNum,
          data_contratacao: dataContratacao,
          taxa_juros: taxaJuros ? Number(taxaJuros) : undefined,
          taxa_juros_tipo: taxaJurosTipo,
          numero_parcelas: numParc + entradas.length,
          status,
          saldo_inicial_caixa: Number(saldoInicialCaixa) || 0,
          observacoes: observacoes.trim() || undefined,
        })

        // 1. Gravar as entradas / pagamentos já realizados como parcelas com status 'paga'
        let numSeq = 1
        for (const ent of entradas) {
          const valEntrada = Number(ent.valor) || 0
          if (valEntrada > 0) {
            await dividasService.createParcela({
              divida: dividaCriada.id,
              numero: numSeq,
              data_vencimento: ent.data || dataContratacao,
              valor: valEntrada,
              status: 'paga',
              data_pagamento: ent.data || dataContratacao,
              valor_pago: valEntrada,
              is_entrada: true,
              observacoes: ent.observacoes || 'Pagamento / Entrada antecipada já realizada',
            })
            numSeq++
          }
        }

        // 2. Simular as parcelas restantes sobre o montante restante
        if (numParc > 0 && montanteRestante > 0) {
          const parcelasSimuladas = simularParcelasRestantes({
            dividaId: dividaCriada.id,
            montanteRestante,
            quantidadeParcelas: numParc,
            primeiroVencimento,
            numeroInicial: numSeq,
          })

          await dividasService.createParcelasLote(
            parcelasSimuladas.map((p) => ({
              ...p,
              observacoes: 'Parcela gerada automaticamente no cadastro',
            })),
          )
        }

        toast({
          title: 'Dívida cadastrada com sucesso!',
          description: `${entradas.length} pagamento(s) já registrado(s) e ${numParc} parcelas restantes geradas.`,
        })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao salvar dívida:', err)
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Ocorreu um erro ao gravar a dívida.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            {dividaParaEditar ? 'Editar Dívida / Máquina' : 'Cadastrar Dívida / Máquina'}
          </DialogTitle>
          <DialogDescription>
            {dividaParaEditar
              ? 'Atualize os dados cadastrais da dívida. Cronograma e parcelas podem ser gerenciados na tela principal.'
              : 'Cadastre a compra/financiamento da máquina com pagamentos já realizados e simulação das parcelas restantes.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* IDENTIFICAÇÃO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome da Máquina / Dívida *</Label>
              <Input
                id="nome"
                placeholder="Ex: Torno CNC Mazak ou Máquina Laser"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credor">Credor / Banco / Financiador *</Label>
              <Input
                id="credor"
                placeholder="Ex: Banco Sicredi, BNDES, Santander"
                value={credor}
                onChange={(e) => setCredor(e.target.value)}
                required
              />
            </div>
          </div>

          {/* VALORES E DATAS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="valorTotal">Valor Total da Dívida (R$) *</Label>
              <Input
                id="valorTotal"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={valorTotal}
                onChange={(e) => setValorTotal(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataContratacao">Data de Contratação *</Label>
              <Input
                id="dataContratacao"
                type="date"
                value={dataContratacao}
                onChange={(e) => setDataContratacao(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status da Dívida</Label>
              <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="renegociada">Renegociada</SelectItem>
                  <SelectItem value="quitada">Quitada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* JUROS E CAIXA INICIAL */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="taxaJuros">Taxa de Juros (%)</Label>
              <Input
                id="taxaJuros"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 1.25"
                value={taxaJuros}
                onChange={(e) => setTaxaJuros(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxaJurosTipo">Periodicidade dos Juros</Label>
              <Select value={taxaJurosTipo} onValueChange={(val: any) => setTaxaJurosTipo(val)}>
                <SelectTrigger id="taxaJurosTipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Ao mês</SelectItem>
                  <SelectItem value="anual">Ao ano</SelectItem>
                  <SelectItem value="total">Total do contrato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="saldoInicialCaixa"
                title="Saldo inicial em conta destinado exclusivamente ao caixa desta máquina"
              >
                Saldo Inicial de Caixa (R$)
              </Label>
              <Input
                id="saldoInicialCaixa"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={saldoInicialCaixa}
                onChange={(e) => setSaldoInicialCaixa(e.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">
                Caixa inicial dedicado a esta máquina
              </span>
            </div>
          </div>

          {/* SESSÃO: PAGAMENTOS JÁ FEITOS (apenas no cadastro) */}
          {!dividaParaEditar && (
            <div className="rounded-xl border border-border bg-slate-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    Pagamentos / Entradas já Realizados
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Caso real: informe pagamentos já feitos antes de gerar o restante.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={adicionarEntrada}
                  className="h-8 text-xs gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Pagamento Já Feito
                </Button>
              </div>

              {entradas.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-1 text-center bg-white rounded-lg border border-dashed border-border/80">
                  Nenhum pagamento prévio registrado. Clique no botão acima para adicionar caso já
                  tenha pago alguma parcela ou entrada.
                </div>
              ) : (
                <div className="space-y-2">
                  {entradas.map((ent, idx) => (
                    <div
                      key={ent.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-border/60 shadow-xs"
                    >
                      <div className="sm:col-span-1 text-xs font-bold text-muted-foreground text-center">
                        #{idx + 1}
                      </div>
                      <div className="sm:col-span-4">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Valor pago (R$)"
                          value={ent.valor || ''}
                          onChange={(e) =>
                            atualizarEntrada(ent.id, 'valor', Number(e.target.value))
                          }
                          className="h-8 text-xs"
                          required
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <Input
                          type="date"
                          value={ent.data}
                          onChange={(e) => atualizarEntrada(ent.id, 'data', e.target.value)}
                          className="h-8 text-xs"
                          required
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <Input
                          type="text"
                          placeholder="Descrição / Obs"
                          value={ent.observacoes || ''}
                          onChange={(e) => atualizarEntrada(ent.id, 'observacoes', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removerEntrada(ent.id)}
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-xs font-medium pt-1 px-1">
                    <span className="text-muted-foreground">
                      Total já pago:{' '}
                      <strong className="text-emerald-700">{formatCurrency(totalEntradas)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Montante restante a parcelar:{' '}
                      <strong className="text-primary font-bold">
                        {formatCurrency(montanteRestante)}
                      </strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SIMULAÇÃO DE PARCELAS RESTANTES (apenas no cadastro) */}
          {!dividaParaEditar && (
            <div className="rounded-xl border border-primary/20 bg-orange-50/40 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-primary" />
                Simulação das Parcelas Restantes
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="numParc">Quantidade de Parcelas Restantes</Label>
                  <Input
                    id="numParc"
                    type="number"
                    min="1"
                    value={numeroParcelas}
                    onChange={(e) => setNumeroParcelas(e.target.value)}
                    required
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {Number(numeroParcelas) > 0 && montanteRestante > 0
                      ? `~ ${formatCurrency(montanteRestante / (Number(numeroParcelas) || 1))} / parcela`
                      : ''}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="primVenc">Data do 1º Vencimento Restante</Label>
                  <Input
                    id="primVenc"
                    type="date"
                    value={primeiroVencimento}
                    onChange={(e) => setPrimeiroVencimento(e.target.value)}
                    required
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Demais vencimentos serão gerados mês a mês
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações Gerais</Label>
            <Textarea
              id="obs"
              rows={2}
              placeholder="Anotações internas, condições bancárias, contato do gerente, etc."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2 flex-col-reverse sm:flex-row gap-2">
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
              {salvando
                ? 'Salvando...'
                : dividaParaEditar
                  ? 'Atualizar Dívida'
                  : 'Cadastrar e Gerar Parcelas'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
