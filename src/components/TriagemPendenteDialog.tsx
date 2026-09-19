import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Check,
  FileText,
  Layers,
  LoaderCircle,
  Receipt,
  Sparkles,
  X,
} from 'lucide-react'

import { MoneyInput } from '@/components/MoneyInput'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAppContext } from '@/contexts/AppContext'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { dateOnly, formatCurrency, formatDate, toPocketBaseDate } from '@/lib/format'
import pb from '@/lib/pocketbase/client'
import {
  telegramPendentesService,
  type TriagemDespesaInput,
  type TriagemLancamentoInput,
} from '@/services/telegramPendentes'
import type {
  Categoria,
  Conta,
  Empresa,
  Lancamento,
  MetodoPagamento,
  Pessoa,
  RegraRepeticao,
  SecaoDespesa,
  TagItem,
  TelegramRegistroPendente,
  TipoDespesa,
  TipoDizimo,
  TransactionType,
} from '@/types/domain'

export type DestinoTriagem = 'lancamento' | 'despesa' | 'ambos'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: TelegramRegistroPendente | null
  contas: Conta[]
  categorias: Categoria[]
  tags?: TagItem[]
  tiposDespesa?: TipoDespesa[]
  metodosPagamento?: MetodoPagamento[]
  tiposDizimo?: TipoDizimo[]
  empresas?: Empresa[]
  pessoas?: Pessoa[]
  onTriado: () => void
}

export function TriagemPendenteDialog({
  open,
  onOpenChange,
  item,
  contas,
  categorias,
  tags = [],
  tiposDespesa = [],
  metodosPagamento = [],
  tiposDizimo = [],
  empresas = [],
  pessoas = [],
  onTriado,
}: Props) {
  const { toast } = useToast()
  const { activeContext } = useAppContext()

  const [destino, setDestino] = useState<DestinoTriagem>('lancamento')
  const [activeStepTab, setActiveStepTab] = useState<'lancamento' | 'despesa'>('lancamento')

  // Form Lançamento
  const [lancForm, setLancForm] = useState({
    descricao: '',
    valor: 0,
    tipo: 'despesa' as TransactionType,
    data: new Date().toISOString().slice(0, 10),
    conta: '',
    categoria: '',
    empresa: '',
    pessoa: '',
    observacoes: '',
  })

  // Form Despesa
  const [despForm, setDespForm] = useState({
    descricao: '',
    fornecedor: '',
    secao: 'contas_mensais_pix_boleto' as SecaoDespesa,
    regra_repeticao: 'mensal' as RegraRepeticao,
    categoria: '',
    tag: '',
    tipo_despesa: '',
    metodo_pagamento: '',
    conta_padrao: '',
    pessoa: '',
    empresa: '',
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

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicates, setDuplicates] = useState<Lancamento[]>([])
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false)
  const [saving, setSaving] = useState(false)

  // Preenchimento inicial a partir do item do Telegram
  useEffect(() => {
    if (!open || !item) return
    setErrors({})
    setConfirmedDuplicate(false)
    setDestino('lancamento')
    setActiveStepTab('lancamento')

    const valorInit = item.valor || 0
    const dataInit = item.data ? dateOnly(item.data) : new Date().toISOString().slice(0, 10)
    const contaInit = item.conta || contas.find((c) => c.ativa)?.id || ''
    const catInit = item.categoria || ''
    const empInit =
      item.empresa || (activeContext.hasEmpresas ? activeContext.empresaIds[0] || '' : '')
    const pessInit =
      item.pessoa || (activeContext.hasPessoas ? activeContext.pessoaIds[0] || '' : '')
    const descInit = item.descricao && item.descricao !== '-' ? item.descricao : ''

    // Inicializa formulário de lançamento
    setLancForm({
      descricao: descInit,
      valor: valorInit,
      tipo: item.tipo || 'despesa',
      data: dataInit,
      conta: contaInit,
      categoria: catInit,
      empresa: empInit,
      pessoa: pessInit,
      observacoes:
        item.observacoes || (item.contexto_nome ? `Contexto: ${item.contexto_nome}` : ''),
    })

    // Extrair dia de vencimento a partir da data do comprovante
    let dueDay = 10
    if (dataInit) {
      const parsedD = new Date(dataInit)
      if (!isNaN(parsedD.getDate())) {
        dueDay = parsedD.getUTCDate()
      }
    }

    // Inicializa formulário de despesa (compromisso recorrente)
    setDespForm({
      descricao: descInit,
      fornecedor: descInit,
      secao: 'contas_mensais_pix_boleto',
      regra_repeticao: 'mensal',
      categoria: catInit,
      tag: tags[0]?.id || '',
      tipo_despesa: tiposDespesa[0]?.id || '',
      metodo_pagamento: metodosPagamento[0]?.id || '',
      conta_padrao: contaInit,
      pessoa: pessInit,
      empresa: empInit,
      total_parcelas: 1,
      parcela_inicial: 1,
      dia_vencimento: dueDay,
      regra_vencimento_texto: `${dueDay}/m`,
      data_inicio: dataInit,
      valor_estimado: valorInit,
      link_pagamento: '',
      dizimo: false,
      tipo_dizimo: tiposDizimo[0]?.id || '',
      ativo: true,
      observacoes: item.comprovante_texto
        ? `Extraído do comprovante Telegram: ${item.comprovante_texto.slice(0, 200)}`
        : '',
    })

    // Checagem de duplicidade se valor > 0
    if (valorInit > 0 && dataInit) {
      setCheckingDuplicates(true)
      telegramPendentesService
        .checkDuplicates(valorInit, item.tipo || 'despesa', dataInit)
        .then((dupes) => {
          setDuplicates(dupes)
        })
        .catch(() => setDuplicates([]))
        .finally(() => setCheckingDuplicates(false))
    } else {
      setDuplicates([])
    }
  }, [contas, item, open, activeContext, tags, tiposDespesa, metodosPagamento, tiposDizimo])

  // Categorias compatíveis com tipo de lançamento
  const lancCategoryOptions = useMemo(
    () => categorias.filter((c) => c.tipo === lancForm.tipo),
    [categorias, lancForm.tipo],
  )

  const despCategoryOptions = useMemo(
    () => categorias.filter((c) => c.tipo === 'despesa'),
    [categorias],
  )

  // Conta selecionada na Despesa (identificar se é cartão)
  const selectedDespConta = contas.find((c) => c.id === despForm.conta_padrao)
  const isSelectedDespContaCartao =
    selectedDespConta?.tipo === 'cartao' || despForm.secao === 'cartoes_credito'

  const cardMatchedMetodo = useMemo(() => {
    if (!selectedDespConta || selectedDespConta.tipo !== 'cartao') return null
    return (
      metodosPagamento.find(
        (m) =>
          m.conta_padrao === selectedDespConta.id ||
          (m.tipo === 'cartao' &&
            m.nome.toLowerCase().includes(selectedDespConta.nome.toLowerCase())),
      ) ||
      metodosPagamento.find((m) => m.tipo === 'cartao') ||
      null
    )
  }, [selectedDespConta, metodosPagamento])

  // Foto do comprovante (se anexada ao registro)
  const fotoUrl = useMemo(() => {
    if (!item) return ''
    if (item.comprovante_foto) {
      return pb.files.getURL(item, item.comprovante_foto)
    }
    if (item.comprovante_foto_url) {
      return item.comprovante_foto_url
    }
    return ''
  }, [item])

  const handleBlurCheckDuplicates = () => {
    if (lancForm.valor > 0 && lancForm.data) {
      telegramPendentesService
        .checkDuplicates(lancForm.valor, lancForm.tipo, lancForm.data)
        .then((dupes) => {
          setDuplicates(dupes)
        })
        .catch(() => {})
    }
  }

  // Sincronizar descrição e valor entre abas se o usuário estiver em "Ambos"
  const handleLancDescricaoChange = (val: string) => {
    setLancForm((prev) => ({ ...prev, descricao: val }))
    if (destino === 'ambos' && !despForm.descricao) {
      setDespForm((prev) => ({ ...prev, descricao: val, fornecedor: val }))
    }
  }

  const handleLancValorChange = (val: number) => {
    setLancForm((prev) => ({ ...prev, valor: val }))
    setConfirmedDuplicate(false)
    if (destino === 'ambos' && despForm.valor_estimado === 0) {
      setDespForm((prev) => ({ ...prev, valor_estimado: val }))
    }
  }

  // Validação e Submissão
  const handleConfirmarTriagem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item) return

    const nextErrors: Record<string, string> = {}

    // Validações Lançamento (quando destino é 'lancamento' ou 'ambos')
    if (destino === 'lancamento' || destino === 'ambos') {
      if (!lancForm.descricao.trim())
        nextErrors.lancDescricao = 'Informe a descrição do lançamento.'
      if (lancForm.valor <= 0)
        nextErrors.lancValor = 'Informe um valor maior que zero para o lançamento.'
      if (!lancForm.conta) nextErrors.lancConta = 'Selecione a conta bancária/cartão.'
      if (!lancForm.categoria) nextErrors.lancCategoria = 'Selecione a categoria financeira.'
    }

    // Validações Despesa (quando destino é 'despesa' ou 'ambos')
    if (destino === 'despesa' || destino === 'ambos') {
      if (!despForm.descricao.trim())
        nextErrors.despDescricao = 'Informe o produto ou serviço (descrição).'
      if (despForm.valor_estimado <= 0)
        nextErrors.despValor = 'Informe um valor maior que zero para a despesa.'

      if (isSelectedDespContaCartao && selectedDespConta && despForm.metodo_pagamento) {
        const selectedMetodo = metodosPagamento.find((m) => m.id === despForm.metodo_pagamento)
        if (selectedMetodo && selectedMetodo.tipo !== 'cartao') {
          nextErrors.despMetodo = `A conta "${selectedDespConta.nome}" é cartão de crédito. Não selecione método "${selectedMetodo.nome}".`
        }
      }
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      if (destino === 'ambos') {
        // Se o erro está na aba que não está visível, troca para ela
        if (
          nextErrors.lancDescricao ||
          nextErrors.lancValor ||
          nextErrors.lancConta ||
          nextErrors.lancCategoria
        ) {
          setActiveStepTab('lancamento')
        } else {
          setActiveStepTab('despesa')
        }
      }
      return
    }

    // Alerta de duplicidade de lançamento
    if (
      (destino === 'lancamento' || destino === 'ambos') &&
      duplicates.length > 0 &&
      !confirmedDuplicate
    ) {
      setConfirmedDuplicate(true)
      toast({
        variant: 'destructive',
        title: 'Possível duplicidade identificada',
        description:
          'Existe outro lançamento com mesmo valor na mesma data. Clique em "Confirmar mesmo assim" se desejar prosseguir.',
      })
      return
    }

    setSaving(true)
    try {
      const lancInput: TriagemLancamentoInput = {
        descricao: lancForm.descricao.trim(),
        valor: lancForm.valor,
        tipo: lancForm.tipo,
        data: toPocketBaseDate(lancForm.data),
        conta: lancForm.conta,
        categoria: lancForm.categoria,
        empresa: lancForm.empresa || undefined,
        pessoa: lancForm.pessoa || undefined,
        observacoes: lancForm.observacoes.trim() || undefined,
      }

      const isEmpresaContext = despForm.empresa
        ? true
        : activeContext.hasEmpresas && !activeContext.hasPessoas

      const effectiveMetodoPagamento = isSelectedDespContaCartao
        ? cardMatchedMetodo?.id || despForm.metodo_pagamento || undefined
        : despForm.metodo_pagamento || undefined

      const despInput: TriagemDespesaInput = {
        descricao: despForm.descricao.trim(),
        fornecedor: despForm.fornecedor.trim() || undefined,
        secao: despForm.secao,
        regra_repeticao: despForm.regra_repeticao,
        categoria: despForm.categoria || undefined,
        tag: despForm.tag || undefined,
        tipo_despesa: despForm.tipo_despesa || undefined,
        metodo_pagamento: effectiveMetodoPagamento,
        conta_padrao: despForm.conta_padrao || undefined,
        pessoa: despForm.pessoa || undefined,
        empresa: despForm.empresa || undefined,
        contexto_tipo: isEmpresaContext ? 'empresa' : 'pessoal',
        total_parcelas:
          despForm.regra_repeticao === 'parcelado' ? Number(despForm.total_parcelas) : 1,
        parcela_inicial:
          despForm.regra_repeticao === 'parcelado' ? Number(despForm.parcela_inicial) : 1,
        dia_vencimento: Number(despForm.dia_vencimento) || 10,
        regra_vencimento_texto:
          despForm.regra_vencimento_texto || `${despForm.dia_vencimento || 10}/m`,
        data_inicio: despForm.data_inicio,
        valor_estimado: Number(despForm.valor_estimado),
        link_pagamento: despForm.link_pagamento || undefined,
        dizimo: despForm.dizimo,
        tipo_dizimo: despForm.dizimo && despForm.tipo_dizimo ? despForm.tipo_dizimo : undefined,
        ativo: despForm.ativo,
        observacoes: despForm.observacoes || undefined,
      }

      if (destino === 'lancamento') {
        await telegramPendentesService.triarComoLancamento(item.id, lancInput)
        toast({
          title: 'Triagem concluída: Lançamento criado!',
          description: `“${lancInput.descricao}” entrou nos lançamentos do caixa oficial.`,
        })
      } else if (destino === 'despesa') {
        await telegramPendentesService.triarComoDespesa(item.id, despInput)
        toast({
          title: 'Triagem concluída: Despesa cadastrada!',
          description: `“${despInput.descricao}” virou compromisso recorrente em /despesas com ocorrências geradas.`,
        })
      } else {
        await telegramPendentesService.triarComoAmbos(item.id, lancInput, despInput)
        toast({
          title: 'Triagem concluída: Lançamento + Despesa gerados!',
          description: `Criado o lançamento no caixa e o compromisso recorrente em /despesas.`,
        })
      }

      onTriado()
      onOpenChange(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao processar triagem',
        description: apiMessage(err),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 text-primary font-bold"
            >
              <Sparkles className="mr-1 h-3 w-3" />
              Triagem de Comprovante Telegram
            </Badge>
            {item?.contexto_nome && (
              <Badge variant="secondary" className="text-xs">
                Contexto: {item.contexto_nome}
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl font-bold">Definir Destino do Registro</DialogTitle>
          <DialogDescription>
            Escolha se este comprovante representa um <strong>Lançamento de Caixa</strong>, uma{' '}
            <strong>Despesa Recorrente</strong> ou <strong>Ambos</strong> (pagamento imediato +
            compromisso futuro).
          </DialogDescription>
        </DialogHeader>

        {/* Alerta de duplicidade */}
        {duplicates.length > 0 && (destino === 'lancamento' || destino === 'ambos') && (
          <Alert
            variant="destructive"
            className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-300 font-bold">
              Atenção: Já existe {duplicates.length} lançamento(s) similar hoje!
            </AlertTitle>
            <AlertDescription className="text-xs space-y-1 mt-1">
              {duplicates.map((dupe) => (
                <div
                  key={dupe.id}
                  className="flex justify-between border-t border-amber-300/40 pt-1"
                >
                  <span>
                    {dupe.descricao} ({formatDate(dupe.data)})
                  </span>
                  <span className="font-bold">{formatCurrency(dupe.valor)}</span>
                </div>
              ))}
              <p className="mt-1 font-semibold text-amber-800 dark:text-amber-300">
                Se for o mesmo gasto já lançado, descarte este comprovante. Caso seja outro gasto no
                mesmo valor, confirme a triagem.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Card de Informações extraídas do Telegram (OCR / Foto) */}
        <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1 font-bold text-foreground">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Dados Coletados pela IA do Telegram
            </span>
            <span className="text-[11px] text-muted-foreground">
              Chegada:{' '}
              {item
                ? formatDate(item.created, {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '-'}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
            <div>
              <span className="text-muted-foreground">Valor identificado:</span>{' '}
              <strong className="text-foreground">{item ? formatCurrency(item.valor) : '-'}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Tipo inicial:</span>{' '}
              <strong className="text-foreground capitalize">{item?.tipo || 'despesa'}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Origem:</span>{' '}
              <strong className="text-foreground">{item?.telegram_origem || 'Bot Telegram'}</strong>
            </div>
          </div>

          {item?.comprovante_texto && (
            <p className="line-clamp-2 text-muted-foreground italic font-mono text-[10px] bg-white/70 p-1.5 rounded border border-border/50">
              "{item.comprovante_texto}"
            </p>
          )}

          {fotoUrl && (
            <div className="pt-1 flex items-center gap-2">
              <a
                href={fotoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
              >
                🖼️ Ver comprovante/anexo original
              </a>
            </div>
          )}
        </div>

        {/* 1. SELEÇÃO DO DESTINO */}
        <div className="space-y-1.5 pt-1">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            1. Escolha o Destino deste Comprovante:
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setDestino('lancamento')}
              className={`p-3 rounded-xl border text-left transition relative flex flex-col gap-1 ${
                destino === 'lancamento'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border bg-white hover:bg-secondary/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <BadgeDollarSign
                  className={`h-4 w-4 ${destino === 'lancamento' ? 'text-primary' : 'text-muted-foreground'}`}
                />
                <span className="font-extrabold text-sm">Lançamento</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Caixa real imediato. Vai direto para <strong>/lancamentos</strong>.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setDestino('despesa')}
              className={`p-3 rounded-xl border text-left transition relative flex flex-col gap-1 ${
                destino === 'despesa'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border bg-white hover:bg-secondary/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <Receipt
                  className={`h-4 w-4 ${destino === 'despesa' ? 'text-primary' : 'text-muted-foreground'}`}
                />
                <span className="font-extrabold text-sm">Despesa</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Compromisso recorrente. Vai para <strong>/despesas</strong> com ocorrências futuras.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setDestino('ambos')}
              className={`p-3 rounded-xl border text-left transition relative flex flex-col gap-1 ${
                destino === 'ambos'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border bg-white hover:bg-secondary/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers
                  className={`h-4 w-4 ${destino === 'ambos' ? 'text-primary' : 'text-muted-foreground'}`}
                />
                <span className="font-extrabold text-sm">Ambos</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cria o lançamento do caixa E programa o compromisso recorrente.
              </p>
            </button>
          </div>
        </div>

        {/* 2. FORMULÁRIO DO DESTINO ESCOLHIDO */}
        <form onSubmit={handleConfirmarTriagem} className="space-y-4 pt-2">
          {/* Sub-navegação em caso de "Ambos" */}
          {destino === 'ambos' && (
            <div className="border-b border-border pb-2">
              <Tabs
                value={activeStepTab}
                onValueChange={(v) => setActiveStepTab(v as 'lancamento' | 'despesa')}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 bg-secondary p-1 h-auto">
                  <TabsTrigger
                    value="lancamento"
                    className="py-1.5 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  >
                    1. Dados do Lançamento de Caixa
                  </TabsTrigger>
                  <TabsTrigger
                    value="despesa"
                    className="py-1.5 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  >
                    2. Dados da Despesa Recorrente
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* FORMULÁRIO: Lançamento */}
          {(destino === 'lancamento' ||
            (destino === 'ambos' && activeStepTab === 'lancamento')) && (
            <div className="space-y-3 rounded-xl border border-border p-3.5 bg-white">
              <div className="flex items-center justify-between pb-1 border-b border-border">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <BadgeDollarSign className="h-4 w-4 text-primary" />
                  Detalhes do Lançamento no Caixa
                </span>
                {destino === 'ambos' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs font-bold text-primary h-7"
                    onClick={() => setActiveStepTab('despesa')}
                  >
                    Próximo: Dados da Despesa <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>

              <ToggleGroup
                type="single"
                value={lancForm.tipo}
                onValueChange={(val) => {
                  if (val)
                    setLancForm((prev) => ({
                      ...prev,
                      tipo: val as TransactionType,
                      categoria: '',
                    }))
                }}
                className="grid grid-cols-2 rounded-xl bg-secondary p-1"
              >
                <ToggleGroupItem
                  value="receita"
                  className="rounded-lg data-[state=on]:bg-success data-[state=on]:text-white font-bold text-xs py-1.5"
                >
                  🟢 Receita (Entrada)
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="despesa"
                  className="rounded-lg data-[state=on]:bg-primary data-[state=on]:text-white font-bold text-xs py-1.5"
                >
                  🔴 Despesa (Saída)
                </ToggleGroupItem>
              </ToggleGroup>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="lanc-descricao" className="text-xs font-bold">
                    Descrição / Favorecido *
                  </Label>
                  <Input
                    id="lanc-descricao"
                    value={lancForm.descricao}
                    onChange={(e) => handleLancDescricaoChange(e.target.value)}
                    placeholder="Ex.: CPFL Energia, Supermercado..."
                  />
                  {errors.lancDescricao && (
                    <p className="text-xs text-destructive">{errors.lancDescricao}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Valor (R$) *</Label>
                  <MoneyInput
                    value={lancForm.valor}
                    onChange={handleLancValorChange}
                    onBlur={handleBlurCheckDuplicates}
                  />
                  {errors.lancValor && (
                    <p className="text-xs text-destructive">{errors.lancValor}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="lanc-data" className="text-xs font-bold">
                    Data do pagamento / lançamento *
                  </Label>
                  <Input
                    id="lanc-data"
                    type="date"
                    value={lancForm.data}
                    onChange={(e) => {
                      setLancForm((prev) => ({ ...prev, data: e.target.value }))
                      setConfirmedDuplicate(false)
                    }}
                    onBlur={handleBlurCheckDuplicates}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Conta Bancária / Cartão *</Label>
                  <Select
                    value={lancForm.conta}
                    onValueChange={(v) => setLancForm((prev) => ({ ...prev, conta: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} {c.bandeira ? `(${c.bandeira})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.lancConta && (
                    <p className="text-xs text-destructive">{errors.lancConta}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Categoria financeira *</Label>
                  <Select
                    value={lancForm.categoria}
                    onValueChange={(v) => setLancForm((prev) => ({ ...prev, categoria: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {lancCategoryOptions.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.lancCategoria && (
                    <p className="text-xs text-destructive">{errors.lancCategoria}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Empresa (opcional)</Label>
                  <Select
                    value={lancForm.empresa || 'none'}
                    onValueChange={(v) =>
                      setLancForm((prev) => ({ ...prev, empresa: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {empresas.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.nome_fantasia}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Pessoa (opcional)</Label>
                  <Select
                    value={lancForm.pessoa || 'none'}
                    onValueChange={(v) =>
                      setLancForm((prev) => ({ ...prev, pessoa: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {pessoas.map((pes) => (
                        <SelectItem key={pes.id} value={pes.id}>
                          {pes.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="lanc-obs" className="text-xs font-bold">
                    Observações adicionais
                  </Label>
                  <Textarea
                    id="lanc-obs"
                    rows={2}
                    value={lancForm.observacoes}
                    onChange={(e) =>
                      setLancForm((prev) => ({ ...prev, observacoes: e.target.value }))
                    }
                    placeholder="Observações do lançamento..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* FORMULÁRIO: Despesa Recorrente */}
          {(destino === 'despesa' || (destino === 'ambos' && activeStepTab === 'despesa')) && (
            <div className="space-y-3 rounded-xl border border-border p-3.5 bg-white">
              <div className="flex items-center justify-between pb-1 border-b border-border">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-primary" />
                  Detalhes do Compromisso Recorrente (/despesas)
                </span>
                {destino === 'ambos' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs font-bold text-muted-foreground h-7"
                    onClick={() => setActiveStepTab('lancamento')}
                  >
                    Voltar aos dados de Caixa
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-bold">Produto / Serviço (Descrição) *</Label>
                  <Input
                    value={despForm.descricao}
                    onChange={(e) =>
                      setDespForm((prev) => ({ ...prev, descricao: e.target.value }))
                    }
                    placeholder="Ex.: Internet Fibra, Energia CPFL, Aluguel..."
                    required
                  />
                  {errors.despDescricao && (
                    <p className="text-xs text-destructive">{errors.despDescricao}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Fornecedor / Pessoa (opcional)</Label>
                  <Input
                    value={despForm.fornecedor}
                    onChange={(e) =>
                      setDespForm((prev) => ({ ...prev, fornecedor: e.target.value }))
                    }
                    placeholder="Ex.: ConectPlus, CPFL, Vivo..."
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Valor estimado / Parcela *</Label>
                  <MoneyInput
                    value={despForm.valor_estimado}
                    onChange={(v) => setDespForm((prev) => ({ ...prev, valor_estimado: v }))}
                  />
                  {errors.despValor && (
                    <p className="text-xs text-destructive">{errors.despValor}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Seção do painel /despesas</Label>
                  <Select
                    value={despForm.secao}
                    onValueChange={(v) => {
                      const s = v as SecaoDespesa
                      let rep = despForm.regra_repeticao
                      if (s === 'cartoes_credito' && rep !== 'parcelado') rep = 'parcelado'
                      if (s === 'assinaturas_anuais') rep = 'anual'
                      if (s === 'contas_mensais_pix_boleto' && rep === 'anual') rep = 'mensal'
                      setDespForm((prev) => ({ ...prev, secao: s, regra_repeticao: rep }))
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

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Regra de repetição</Label>
                  <Select
                    value={despForm.regra_repeticao}
                    onValueChange={(v) =>
                      setDespForm((prev) => ({ ...prev, regra_repeticao: v as RegraRepeticao }))
                    }
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

                {despForm.regra_repeticao === 'parcelado' && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">Total de parcelas (N×)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        value={despForm.total_parcelas}
                        onChange={(e) =>
                          setDespForm((prev) => ({
                            ...prev,
                            total_parcelas: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">Parcela inicial</Label>
                      <Input
                        type="number"
                        min={1}
                        max={despForm.total_parcelas}
                        value={despForm.parcela_inicial}
                        onChange={(e) =>
                          setDespForm((prev) => ({
                            ...prev,
                            parcela_inicial: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Dia de vencimento (1 a 31)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={despForm.dia_vencimento}
                    onChange={(e) => {
                      const day = parseInt(e.target.value, 10) || 10
                      setDespForm((prev) => ({
                        ...prev,
                        dia_vencimento: day,
                        regra_vencimento_texto: `${day}/m`,
                      }))
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Data de início / 1ª cobrança</Label>
                  <Input
                    type="date"
                    value={despForm.data_inicio}
                    onChange={(e) =>
                      setDespForm((prev) => ({ ...prev, data_inicio: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Conta padrão / Cartão</Label>
                  <Select
                    value={despForm.conta_padrao || 'none'}
                    onValueChange={(v) => {
                      const contaId = v === 'none' ? '' : v
                      const c = contas.find((item) => item.id === contaId)
                      let updated = { ...despForm, conta_padrao: contaId }
                      if (c && c.tipo === 'cartao') {
                        if (c.dia_vencimento) {
                          updated.dia_vencimento = c.dia_vencimento
                          updated.regra_vencimento_texto = `${c.dia_vencimento}/m`
                        }
                        const matched = metodosPagamento.find(
                          (m) =>
                            m.conta_padrao === c.id ||
                            (m.tipo === 'cartao' &&
                              m.nome.toLowerCase().includes(c.nome.toLowerCase())),
                        )
                        updated.metodo_pagamento = matched?.id || ''
                      }
                      setDespForm(updated)
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

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold">Método de pagamento</Label>
                    {isSelectedDespContaCartao && (
                      <span className="text-[10px] font-semibold text-primary">
                        Automático (Cartão)
                      </span>
                    )}
                  </div>
                  {isSelectedDespContaCartao ? (
                    <div className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Crédito {selectedDespConta ? selectedDespConta.nome : 'Cartão'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {selectedDespConta?.dia_fechamento &&
                          `Fecha dia ${selectedDespConta.dia_fechamento}`}
                        {selectedDespConta?.dia_vencimento &&
                          ` · Vence dia ${selectedDespConta.dia_vencimento}`}
                      </span>
                    </div>
                  ) : (
                    <Select
                      value={despForm.metodo_pagamento || 'none'}
                      onValueChange={(v) =>
                        setDespForm((prev) => ({
                          ...prev,
                          metodo_pagamento: v === 'none' ? '' : v,
                        }))
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
                  {errors.despMetodo && (
                    <p className="text-xs text-destructive">{errors.despMetodo}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Tipo de Despesa</Label>
                  <Select
                    value={despForm.tipo_despesa || 'none'}
                    onValueChange={(v) =>
                      setDespForm((prev) => ({ ...prev, tipo_despesa: v === 'none' ? '' : v }))
                    }
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

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Tag (Classificação)</Label>
                  <Select
                    value={despForm.tag || 'none'}
                    onValueChange={(v) =>
                      setDespForm((prev) => ({ ...prev, tag: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione tag" />
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

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Categoria financeira</Label>
                  <Select
                    value={despForm.categoria || 'none'}
                    onValueChange={(v) =>
                      setDespForm((prev) => ({ ...prev, categoria: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {despCategoryOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Empresa (opcional)</Label>
                  <Select
                    value={despForm.empresa || 'none'}
                    onValueChange={(v) =>
                      setDespForm((prev) => ({ ...prev, empresa: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {empresas.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.nome_fantasia}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Pessoa responsável (opcional)</Label>
                  <Select
                    value={despForm.pessoa || 'none'}
                    onValueChange={(v) =>
                      setDespForm((prev) => ({ ...prev, pessoa: v === 'none' ? '' : v }))
                    }
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

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-bold">Link de pagamento (opcional)</Label>
                  <Input
                    type="url"
                    value={despForm.link_pagamento}
                    onChange={(e) =>
                      setDespForm((prev) => ({ ...prev, link_pagamento: e.target.value }))
                    }
                    placeholder="https://..."
                  />
                </div>

                {/* Dízimo / Ofertas */}
                <div className="rounded-xl border border-border bg-secondary/20 p-2.5 sm:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-bold text-xs text-foreground">
                        Dízimo / Oferta ministerial
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Marque se for dízimo ou oferta e desejar somar no resumo
                      </p>
                    </div>
                    <Switch
                      checked={despForm.dizimo}
                      onCheckedChange={(v) => setDespForm((prev) => ({ ...prev, dizimo: v }))}
                    />
                  </div>

                  {despForm.dizimo && (
                    <div className="space-y-1 pt-1">
                      <Label className="text-xs font-bold">Tipo de Dízimo / Oferta</Label>
                      <Select
                        value={despForm.tipo_dizimo || 'none'}
                        onValueChange={(v) =>
                          setDespForm((prev) => ({ ...prev, tipo_dizimo: v === 'none' ? '' : v }))
                        }
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

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-bold">Observações</Label>
                  <Textarea
                    rows={2}
                    value={despForm.observacoes}
                    onChange={(e) =>
                      setDespForm((prev) => ({ ...prev, observacoes: e.target.value }))
                    }
                    placeholder="Notas, senhas, orientações..."
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              <X className="mr-1.5 h-4 w-4" />
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || checkingDuplicates}
              className="bg-primary hover:bg-primary/90 text-white font-extrabold shadow-sm"
            >
              {saving ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {duplicates.length > 0 &&
              !confirmedDuplicate &&
              (destino === 'lancamento' || destino === 'ambos')
                ? 'Verificar e Confirmar'
                : destino === 'lancamento'
                  ? 'Confirmar Lançamento no Caixa'
                  : destino === 'despesa'
                    ? 'Confirmar Compromisso em /despesas'
                    : 'Confirmar Ambos (Caixa + Despesa)'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
