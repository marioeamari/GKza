import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, Plus, Save } from 'lucide-react'

import { MoneyInput } from '@/components/MoneyInput'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useAppContext } from '@/contexts/AppContext'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { despesasService } from '@/services/despesas'
import type {
  Categoria,
  Conta,
  DespesaCompromisso,
  Empresa,
  MetodoPagamento,
  Pessoa,
  RegraRepeticao,
  SecaoDespesa,
  TagItem,
  TipoDespesa,
  TipoDizimo,
} from '@/types/domain'

interface DespesaCompromissoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  compromisso?: DespesaCompromisso | null
  categorias: Categoria[]
  tags: TagItem[]
  tiposDespesa: TipoDespesa[]
  metodosPagamento: MetodoPagamento[]
  tiposDizimo: TipoDizimo[]
  contas: Conta[]
  pessoas: Pessoa[]
  empresas: Empresa[]
  defaultSecao?: SecaoDespesa
  onSuccess?: () => void
}

export function DespesaCompromissoDialog({
  open,
  onOpenChange,
  compromisso,
  categorias,
  tags,
  tiposDespesa,
  metodosPagamento,
  tiposDizimo,
  contas,
  pessoas,
  defaultSecao = 'contas_mensais_pix_boleto',
  onSuccess,
}: DespesaCompromissoDialogProps) {
  const { activeContext } = useAppContext()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    descricao: '',
    fornecedor: '',
    secao: defaultSecao as SecaoDespesa,
    regra_repeticao: 'mensal' as RegraRepeticao,
    categoria: '',
    tag: '',
    tipo_despesa: '',
    metodo_pagamento: '',
    conta_padrao: '',
    pessoa: '',
    total_parcelas: 1,
    parcela_inicial: 1,
    dia_vencimento: 10,
    regra_vencimento_texto: '10/m',
    data_inicio: new Date().toISOString().slice(0, 10),
    valor_estimado: 0,
    link_pagamento: '',
    dizimo: false,
    tipo_dizimo: '',
    ativo: true,
    observacoes: '',
  })

  useEffect(() => {
    if (open) {
      if (compromisso) {
        setForm({
          descricao: compromisso.descricao,
          fornecedor: compromisso.fornecedor || '',
          secao: compromisso.secao,
          regra_repeticao: compromisso.regra_repeticao,
          categoria: compromisso.categoria || '',
          tag: compromisso.tag || '',
          tipo_despesa: compromisso.tipo_despesa || '',
          metodo_pagamento: compromisso.metodo_pagamento || '',
          conta_padrao: compromisso.conta_padrao || '',
          pessoa: compromisso.pessoa || '',
          total_parcelas: compromisso.total_parcelas || 1,
          parcela_inicial: compromisso.parcela_inicial || 1,
          dia_vencimento: compromisso.dia_vencimento || 10,
          regra_vencimento_texto:
            compromisso.regra_vencimento_texto || `${compromisso.dia_vencimento || 10}/m`,
          data_inicio: compromisso.data_inicio
            ? compromisso.data_inicio.slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          valor_estimado: compromisso.valor_estimado || 0,
          link_pagamento: compromisso.link_pagamento || '',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || '',
          ativo: compromisso.ativo !== false,
          observacoes: compromisso.observacoes || '',
        })
      } else {
        // Defaults inteligentes
        const isCartao = defaultSecao === 'cartoes_credito'
        const isAnual = defaultSecao === 'assinaturas_anuais'

        const defaultCard = contas.find((c) => c.tipo === 'cartao' && c.ativa)?.id || ''
        const defaultTipoDesp = tiposDespesa[0]?.id || ''
        const defaultMetodo = metodosPagamento[0]?.id || ''
        const defaultDizimoTipo = tiposDizimo[0]?.id || ''

        setForm({
          descricao: '',
          fornecedor: '',
          secao: defaultSecao,
          regra_repeticao: isCartao ? 'parcelado' : isAnual ? 'anual' : 'mensal',
          categoria: '',
          tag: '',
          tipo_despesa: defaultTipoDesp,
          metodo_pagamento: defaultMetodo,
          conta_padrao: isCartao ? defaultCard : '',
          pessoa: '',
          total_parcelas: isCartao ? 3 : 1,
          parcela_inicial: 1,
          dia_vencimento: 10,
          regra_vencimento_texto: '10/m',
          data_inicio: new Date().toISOString().slice(0, 10),
          valor_estimado: 0,
          link_pagamento: '',
          dizimo: false,
          tipo_dizimo: defaultDizimoTipo,
          ativo: true,
          observacoes: '',
        })
      }
    }
  }, [compromisso, defaultSecao, open, contas, tiposDespesa, metodosPagamento, tiposDizimo])

  // Determina se a conta selecionada (ou a seção) é do tipo Cartão de Crédito
  const selectedConta = contas.find((c) => c.id === form.conta_padrao)
  const isSelectedContaCartao = selectedConta?.tipo === 'cartao' || form.secao === 'cartoes_credito'

  // Procura método correspondente ao cartão se existir
  const cardMatchedMetodo = useMemo(() => {
    if (!selectedConta || selectedConta.tipo !== 'cartao') return null
    return (
      metodosPagamento.find(
        (m) =>
          m.conta_padrao === selectedConta.id ||
          (m.tipo === 'cartao' && m.nome.toLowerCase().includes(selectedConta.nome.toLowerCase())),
      ) ||
      metodosPagamento.find((m) => m.tipo === 'cartao') ||
      null
    )
  }, [selectedConta, metodosPagamento])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.descricao.trim()) {
      toast({
        variant: 'destructive',
        title: 'Descrição obrigatória',
        description: 'Informe o produto ou serviço.',
      })
      return
    }
    if (form.valor_estimado <= 0) {
      toast({
        variant: 'destructive',
        title: 'Valor inválido',
        description: 'Informe um valor maior que zero.',
      })
      return
    }

    // Validação de compatibilidade entre Cartão de Crédito e Método de pagamento
    if (isSelectedContaCartao) {
      if (selectedConta && form.metodo_pagamento) {
        const selectedMetodo = metodosPagamento.find((m) => m.id === form.metodo_pagamento)
        if (selectedMetodo && selectedMetodo.tipo !== 'cartao') {
          toast({
            variant: 'destructive',
            title: 'Método de pagamento incompatível',
            description: `A conta "${selectedConta.nome}" é um cartão de crédito. Não é permitido vincular métodos do tipo "${selectedMetodo.nome}" (ex: Pix/Boleto).`,
          })
          return
        }
      }
    }

    // Se for cartão, o método de pagamento implícito é o cartão correspondente (ou nulo)
    const effectiveMetodoPagamento = isSelectedContaCartao
      ? cardMatchedMetodo?.id || form.metodo_pagamento || null
      : form.metodo_pagamento || null

    setSubmitting(true)
    try {
      const payload: Partial<DespesaCompromisso> = {
        contexto_tipo: activeContext.type,
        empresa:
          activeContext.type === 'empresa' ? activeContext.empresaId : (null as unknown as string),
        descricao: form.descricao.trim(),
        fornecedor: form.fornecedor.trim() || (null as unknown as string),
        secao: form.secao,
        regra_repeticao: form.regra_repeticao,
        categoria: form.categoria || (null as unknown as string),
        tag: form.tag || (null as unknown as string),
        tipo_despesa: form.tipo_despesa || (null as unknown as string),
        metodo_pagamento: effectiveMetodoPagamento as string,
        conta_padrao: form.conta_padrao || (null as unknown as string),
        pessoa: form.pessoa || (null as unknown as string),
        total_parcelas: form.regra_repeticao === 'parcelado' ? Number(form.total_parcelas) : 1,
        parcela_inicial: form.regra_repeticao === 'parcelado' ? Number(form.parcela_inicial) : 1,
        dia_vencimento: Number(form.dia_vencimento) || 10,
        regra_vencimento_texto: form.regra_vencimento_texto || `${form.dia_vencimento}/m`,
        data_inicio: `${form.data_inicio} 00:00:00.000Z`,
        valor_estimado: Number(form.valor_estimado),
        link_pagamento: form.link_pagamento || (null as unknown as string),
        dizimo: form.dizimo,
        tipo_dizimo:
          form.dizimo && form.tipo_dizimo ? form.tipo_dizimo : (null as unknown as string),
        ativo: form.ativo,
        observacoes: form.observacoes || (null as unknown as string),
      }

      const saved = await despesasService.saveCompromisso(payload, compromisso?.id)

      // Se for novo compromisso, gera as primeiras ocorrências automaticamente
      if (!compromisso) {
        await despesasService.gerarOcorrenciasParaCompromisso(saved)
      }

      toast({
        title: compromisso ? 'Compromisso atualizado' : 'Compromisso criado com sucesso!',
        description: 'As ocorrências previstas já estão disponíveis para conferência e baixa.',
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar compromisso',
        description: apiMessage(err),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {compromisso ? 'Editar compromisso de despesa' : 'Novo compromisso de despesa'}
          </DialogTitle>
          <DialogDescription>
            Contexto atual: <strong>{activeContext.label}</strong>. Cadastre o compromisso
            recorrente ou parcelado e o sistema gerará as ocorrências previstas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Produto / Serviço (Descrição) *</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex.: Internet Fibra, Ballet, CPFL, Seguro..."
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Input
                value={form.fornecedor}
                onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                placeholder="Ex.: ConectPlus, Prefeitura, CPFL, Neuris..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Valor estimado / Parcela *</Label>
              <MoneyInput
                value={form.valor_estimado}
                onChange={(v) => setForm({ ...form, valor_estimado: v })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Seção do painel</Label>
              <Select
                value={form.secao}
                onValueChange={(v) => {
                  const s = v as SecaoDespesa
                  let rep = form.regra_repeticao
                  if (s === 'cartoes_credito' && rep !== 'parcelado') rep = 'parcelado'
                  if (s === 'assinaturas_anuais') rep = 'anual'
                  if (s === 'contas_mensais_pix_boleto' && rep === 'anual') rep = 'mensal'
                  setForm({ ...form, secao: s, regra_repeticao: rep })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contas_mensais_pix_boleto">
                    Boletos & Contas Mensais Pix
                  </SelectItem>
                  <SelectItem value="assinaturas_anuais">Assinaturas Anuais</SelectItem>
                  <SelectItem value="cartoes_credito">
                    Cartões de Crédito (Parcelados/Rotativos)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Regra de repetição</Label>
              <Select
                value={form.regra_repeticao}
                onValueChange={(v) => setForm({ ...form, regra_repeticao: v as RegraRepeticao })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal recorrente</SelectItem>
                  <SelectItem value="parcelado">Parcelado em N vezes</SelectItem>
                  <SelectItem value="anual">Anual (Assinatura)</SelectItem>
                  <SelectItem value="avulso">Avulso / Pontual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.regra_repeticao === 'parcelado' && (
              <>
                <div className="space-y-1.5">
                  <Label>Total de parcelas (N×)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={form.total_parcelas}
                    onChange={(e) =>
                      setForm({ ...form, total_parcelas: parseInt(e.target.value, 10) || 1 })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Parcela inicial</Label>
                  <Input
                    type="number"
                    min={1}
                    max={form.total_parcelas}
                    value={form.parcela_inicial}
                    onChange={(e) =>
                      setForm({ ...form, parcela_inicial: parseInt(e.target.value, 10) || 1 })
                    }
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Dia de vencimento (1 a 31)</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.dia_vencimento}
                onChange={(e) => {
                  const day = parseInt(e.target.value, 10) || 10
                  setForm({
                    ...form,
                    dia_vencimento: day,
                    regra_vencimento_texto: `${day}/m`,
                  })
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Data de início / primeira cobrança</Label>
              <Input
                type="date"
                value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Conta padrão / Cartão</Label>
              <Select
                value={form.conta_padrao || 'none'}
                onValueChange={(v) => {
                  const contaId = v === 'none' ? '' : v
                  const c = contas.find((item) => item.id === contaId)
                  let updatedForm = { ...form, conta_padrao: contaId }
                  // Se selecionou cartão de crédito
                  if (c && c.tipo === 'cartao') {
                    // Ajusta o dia de vencimento com base no cartão se houver
                    if (c.dia_vencimento) {
                      updatedForm.dia_vencimento = c.dia_vencimento
                      updatedForm.regra_vencimento_texto = `${c.dia_vencimento}/m`
                    }
                    // Localiza o método correspondente ou limpa o método para não conflitar
                    const matched = metodosPagamento.find(
                      (m) =>
                        m.conta_padrao === c.id ||
                        (m.tipo === 'cartao' &&
                          m.nome.toLowerCase().includes(c.nome.toLowerCase())),
                    )
                    updatedForm.metodo_pagamento = matched?.id || ''
                  }
                  setForm(updatedForm)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione conta ou cartão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} ({c.tipo === 'cartao' ? 'Cartão de Crédito' : c.tipo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Método de pagamento</Label>
                {isSelectedContaCartao && (
                  <span className="text-[10px] font-semibold text-primary">
                    Automático (Cartão)
                  </span>
                )}
              </div>
              {isSelectedContaCartao ? (
                <div className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Crédito {selectedConta ? selectedConta.nome : 'Cartão'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedConta?.dia_fechamento && `Fecha dia ${selectedConta.dia_fechamento}`}
                    {selectedConta?.dia_vencimento &&
                      ` · Vence dia ${selectedConta.dia_vencimento}`}
                  </span>
                </div>
              ) : (
                <Select
                  value={form.metodo_pagamento || 'none'}
                  onValueChange={(v) =>
                    setForm({ ...form, metodo_pagamento: v === 'none' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ex.: Pix-CPF, Pix-CNPJ..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {metodosPagamento
                      .filter((m) => m.tipo !== 'cartao')
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de Despesa</Label>
              <Select
                value={form.tipo_despesa || 'none'}
                onValueChange={(v) => setForm({ ...form, tipo_despesa: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Fixa ou Fixa / Variável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {tiposDespesa.map((tp) => (
                    <SelectItem key={tp.id} value={tp.id}>
                      {tp.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tag (da planilha)</Label>
              <Select
                value={form.tag || 'none'}
                onValueChange={(v) => setForm({ ...form, tag: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ex.: Eu/Casa, Rafa..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {tags.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Categoria financeira</Label>
              <Select
                value={form.categoria || 'none'}
                onValueChange={(v) => setForm({ ...form, categoria: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {categorias
                    .filter((c) => c.tipo === 'despesa')
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Pessoa responsável (opcional)</Label>
              <Select
                value={form.pessoa || 'none'}
                onValueChange={(v) => setForm({ ...form, pessoa: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Link de pagamento (boleto, portal ou 2ª via)</Label>
              <Input
                type="url"
                value={form.link_pagamento}
                onChange={(e) => setForm({ ...form, link_pagamento: e.target.value })}
                placeholder="https://saebirigui.hydrus.pro/..."
              />
            </div>

            {/* Dízimo / Ofertas */}
            <div className="rounded-xl border border-border bg-secondary/20 p-3 sm:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-bold text-foreground">Dízimo / Oferta ministerial</Label>
                  <p className="text-xs text-muted-foreground">
                    Marque "Sim" para despesas de dízimos/ofertas e some nos totais do período
                  </p>
                </div>
                <Switch
                  checked={form.dizimo}
                  onCheckedChange={(v) => setForm({ ...form, dizimo: v })}
                />
              </div>

              {form.dizimo && (
                <div className="space-y-1.5 pt-1">
                  <Label>Tipo de Dízimo / Oferta</Label>
                  <Select
                    value={form.tipo_dizimo || 'none'}
                    onValueChange={(v) => setForm({ ...form, tipo_dizimo: v === 'none' ? '' : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a classificação" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Padrão</SelectItem>
                      {tiposDizimo.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nome} {d.soma_resumo && '· (Soma no resumo)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observação</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Notas da planilha, detalhes de vencimento, senhas ou avisos..."
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button disabled={submitting}>
              {submitting ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar compromisso
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
