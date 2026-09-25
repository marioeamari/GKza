import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CreditCard,
  HeartHandshake,
  Info,
  LoaderCircle,
  Plus,
  Save,
  UserCheck,
  UserRound,
} from 'lucide-react'

import { MoneyInput } from '@/components/MoneyInput'
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
import { Textarea } from '@/components/ui/textarea'
import { useAppContext } from '@/contexts/AppContext'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { formatCurrency, formatDate } from '@/lib/format'
import { despesasService } from '@/services/despesas'
import type {
  Categoria,
  Conta,
  DespesaCompromisso,
  Empresa,
  MetodoPagamento,
  ModalidadeParcelamento,
  Pessoa,
  RegraRepeticao,
  SecaoDespesa,
  TagItem,
  TipoDespesa,
  TipoDizimo,
  TipoValorDespesa,
  TitularTipo,
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
  empresas,
  defaultSecao = 'contas_mensais_pix_boleto',
  onSuccess,
}: DespesaCompromissoDialogProps) {
  const { activeContext } = useAppContext()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  // Estado para cadastro inline de novo Destino da despesa / Centro de custo
  const [creatingTag, setCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [localTags, setLocalTags] = useState<TagItem[]>(tags)

  useEffect(() => {
    setLocalTags(tags)
  }, [tags])

  // Form state
  const [form, setForm] = useState({
    // Grupo 1: Despesa
    descricao: '',
    fornecedor: '',
    categoria: '',
    tag: '', // Destino da despesa / Centro de custo
    secao: defaultSecao as SecaoDespesa,

    // Grupo 2: Titular e destino
    titular_tipo: 'cpf' as TitularTipo,
    titular_pessoa: '',
    titular_empresa: '',

    // Grupo 3: Cobrança e valores (independentes)
    regra_repeticao: 'mensal' as RegraRepeticao, // 'avulso' (único), 'mensal', 'anual'
    tipo_valor: 'fixo' as TipoValorDespesa, // 'fixo' ou 'variavel'
    modalidade_parcelamento: 'a_vista' as ModalidadeParcelamento, // 'a_vista' ou 'parcelado'
    total_parcelas: 1,
    parcela_inicial: 1,
    dia_vencimento: 10,
    data_inicio: new Date().toISOString().slice(0, 10),
    valor_estimado: 0, // valor base da cobrança/mensal/parcela

    // Grupo 4: Pagamento
    conta_padrao: '', // Conta de pagamento prevista / Cartão
    metodo_pagamento: '', // Método de pagamento
    pessoa_responsavel: '', // Pessoa responsável (acompanhamento)
    link_pagamento: '',
    dizimo: false,
    tipo_dizimo: '',
    ativo: true,
    observacoes: '',

    // Campos de revisão
    precisa_revisao: false,
    motivo_revisao: '',
  })

  // Popula o formulário ao abrir
  useEffect(() => {
    if (open) {
      if (compromisso) {
        // Deduz titular
        let tTipo: TitularTipo = compromisso.titular_tipo || 'cpf'
        let tPessoa = compromisso.titular_pessoa || compromisso.pessoa || ''
        let tEmpresa = compromisso.titular_empresa || compromisso.empresa || ''

        if (!compromisso.titular_tipo) {
          if (compromisso.empresa) {
            tTipo = 'cnpj'
            tEmpresa = compromisso.empresa
          } else if (compromisso.pessoa) {
            tTipo = 'cpf'
            tPessoa = compromisso.pessoa
          }
        }

        // Deduz modalidade e repetição
        const isParcelado =
          compromisso.modalidade_parcelamento === 'parcelado' ||
          compromisso.regra_repeticao === 'parcelado'

        let rep: RegraRepeticao = compromisso.regra_repeticao
        if (rep === 'parcelado') {
          rep = 'mensal' // No modelo novo: repetição mensal + modalidade parcelada
        }

        const initialDateStr = compromisso.data_inicio
          ? compromisso.data_inicio.slice(0, 10)
          : new Date().toISOString().slice(0, 10)

        // Calcula dia vencimento a partir da data de início se não houver dia explícito
        let diaVenc = compromisso.dia_vencimento
        if (!diaVenc && initialDateStr) {
          try {
            const parsed = new Date(initialDateStr)
            diaVenc = parsed.getUTCDate()
          } catch (_) {
            diaVenc = 10
          }
        }

        setForm({
          descricao: compromisso.descricao,
          fornecedor: compromisso.fornecedor || '',
          categoria: compromisso.categoria || '',
          tag: compromisso.tag || '',
          secao: compromisso.secao,

          titular_tipo: tTipo,
          titular_pessoa: tPessoa,
          titular_empresa: tEmpresa,

          regra_repeticao: rep,
          tipo_valor: compromisso.tipo_valor || 'fixo',
          modalidade_parcelamento: isParcelado ? 'parcelado' : 'a_vista',
          total_parcelas: compromisso.total_parcelas || (isParcelado ? 2 : 1),
          parcela_inicial: compromisso.parcela_inicial || 1,
          dia_vencimento: diaVenc || 10,
          data_inicio: initialDateStr,
          valor_estimado:
            compromisso.valor_parcela && compromisso.valor_parcela > 0
              ? compromisso.valor_parcela
              : compromisso.valor_estimado || 0,

          conta_padrao: compromisso.conta_padrao || '',
          metodo_pagamento: compromisso.metodo_pagamento || '',
          pessoa_responsavel: compromisso.pessoa || '',
          link_pagamento: compromisso.link_pagamento || '',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || '',
          ativo: compromisso.ativo !== false,
          observacoes: compromisso.observacoes || '',

          precisa_revisao: compromisso.precisa_revisao || false,
          motivo_revisao: compromisso.motivo_revisao || '',
        })
      } else {
        // Defaults inteligentes para criação
        const isCartao = defaultSecao === 'cartoes_credito'
        const isAnual = defaultSecao === 'assinaturas_anuais'

        const defaultCard = contas.find((c) => c.tipo === 'cartao' && c.ativa)?.id || ''
        const defaultMetodo = metodosPagamento[0]?.id || ''
        const defaultDizimoTipo = tiposDizimo[0]?.id || ''

        // Titular default a partir do contexto ativo
        const defaultEmpresaId =
          activeContext.empresaIds.length > 0 ? activeContext.empresaIds[0] : empresas[0]?.id || ''
        const defaultPessoaId =
          activeContext.pessoaIds.length > 0 ? activeContext.pessoaIds[0] : pessoas[0]?.id || ''
        const preferCnpj = activeContext.hasEmpresas && !activeContext.hasPessoas

        const todayStr = new Date().toISOString().slice(0, 10)
        const todayDay = new Date().getDate()

        setForm({
          descricao: '',
          fornecedor: '',
          categoria: '',
          tag: '',
          secao: defaultSecao,

          titular_tipo: preferCnpj ? 'cnpj' : 'cpf',
          titular_pessoa: defaultPessoaId,
          titular_empresa: defaultEmpresaId,

          regra_repeticao: isAnual ? 'anual' : 'mensal',
          tipo_valor: 'fixo',
          modalidade_parcelamento: isCartao ? 'parcelado' : 'a_vista',
          total_parcelas: isCartao ? 3 : 1,
          parcela_inicial: 1,
          dia_vencimento: todayDay,
          data_inicio: todayStr,
          valor_estimado: 0,

          conta_padrao: isCartao ? defaultCard : '',
          metodo_pagamento: defaultMetodo,
          pessoa_responsavel: '',
          link_pagamento: '',
          dizimo: false,
          tipo_dizimo: defaultDizimoTipo,
          ativo: true,
          observacoes: '',

          precisa_revisao: false,
          motivo_revisao: '',
        })
      }
    }
  }, [
    compromisso,
    defaultSecao,
    open,
    contas,
    metodosPagamento,
    tiposDizimo,
    activeContext,
    pessoas,
    empresas,
  ])

  // Identificação do Titular da Despesa selecionado
  const titularSelecionado = useMemo(() => {
    if (form.titular_tipo === 'cnpj') {
      const emp = empresas.find((e) => e.id === form.titular_empresa)
      return {
        tipo: 'CNPJ',
        label: emp ? `${emp.nome_fantasia} (${emp.cnpj || 'Sem CNPJ'})` : 'Nenhuma empresa',
        id: emp?.id,
        nome: emp?.nome_fantasia || 'Empresa',
      }
    } else {
      const pes = pessoas.find((p) => p.id === form.titular_pessoa)
      return {
        tipo: 'Pessoal/CPF',
        label: pes ? `${pes.nome} (${pes.cpf || 'Sem CPF'})` : 'Nenhuma pessoa',
        id: pes?.id,
        nome: pes?.nome || 'Pessoal',
      }
    }
  }, [form.titular_tipo, form.titular_empresa, form.titular_pessoa, empresas, pessoas])

  // Conta de pagamento selecionada
  const selectedConta = contas.find((c) => c.id === form.conta_padrao)
  const isSelectedContaCartao = selectedConta?.tipo === 'cartao' || form.secao === 'cartoes_credito'

  // Alerta de diferença de titular: a conta pertence a um titular diferente da obrigação da despesa?
  const titularidadeContaDiferente = useMemo(() => {
    if (!selectedConta) return null
    // Se titular da despesa for CNPJ e conta for pessoal, ou vice-versa
    const nomeConta = selectedConta.nome.toLowerCase()
    const isContaPJ =
      nomeConta.includes('pj') ||
      nomeConta.includes('empresa') ||
      nomeConta.includes('corporativo') ||
      nomeConta.includes('inter')
    const isTitularCNPJ = form.titular_tipo === 'cnpj'

    if (isTitularCNPJ && !isContaPJ && selectedConta.tipo !== 'caixa') {
      return `A despesa pertence a uma empresa (${titularSelecionado.nome}), mas a conta de pagamento (${selectedConta.nome}) aparenta ser pessoal.`
    }
    if (!isTitularCNPJ && isContaPJ) {
      return `A despesa pertence a pessoa física (${titularSelecionado.nome}), mas o pagamento sairá de uma conta empresarial (${selectedConta.nome}).`
    }
    return null
  }, [selectedConta, form.titular_tipo, titularSelecionado])

  // Cálculos de datas e parcelas
  const calculoParcelamento = useMemo(() => {
    const isParcelado = form.modalidade_parcelamento === 'parcelado'
    if (!isParcelado || !form.data_inicio) {
      return null
    }

    const total = Math.max(1, Number(form.total_parcelas) || 1)
    const inicial = Math.max(1, Math.min(Number(form.parcela_inicial) || 1, total))
    const parcelasRestantes = total - inicial + 1
    const valorParcela = Number(form.valor_estimado) || 0
    const valorTotalCalculado = valorParcela * total

    // Calcular data da última parcela
    try {
      const [y, m] = form.data_inicio.split('-').map((v) => parseInt(v, 10))
      const mesInicialZero = m - 1
      const mesFinalZero = mesInicialZero + (parcelasRestantes - 1)
      const dueDay = form.dia_vencimento || 10
      const lastDate = despesasService.calcularDataVencimentoNoMes(y, mesFinalZero, dueDay)
      return {
        total,
        inicial,
        parcelasRestantes,
        valorParcela,
        valorTotalCalculado,
        ultimaData: lastDate,
        ultimaDataFormatada: formatDate(lastDate.toISOString()),
      }
    } catch (_) {
      return null
    }
  }, [
    form.modalidade_parcelamento,
    form.data_inicio,
    form.total_parcelas,
    form.parcela_inicial,
    form.valor_estimado,
    form.dia_vencimento,
  ])

  // Verificação de compatibilidade entre dia de vencimento e data de início
  const avisoIncompatibilidadeData = useMemo(() => {
    if (form.regra_repeticao === 'avulso') return null
    if (!form.data_inicio) return null
    const day = parseInt(form.data_inicio.slice(8, 10), 10)
    const diaVenc = Number(form.dia_vencimento)
    if (diaVenc && day !== diaVenc) {
      return `A data da primeira cobrança (${formatDate(
        form.data_inicio,
      )}) está marcada para o dia ${day}, enquanto o dia de vencimento fixado é ${diaVenc}. Ajuste um dos campos para manter a consistência dos vencimentos.`
    }
    return null
  }, [form.data_inicio, form.dia_vencimento, form.regra_repeticao])

  // Rótulo dinâmico do campo de valor (Item 9)
  const labelValor = useMemo(() => {
    if (form.modalidade_parcelamento === 'parcelado') {
      return 'Valor da parcela (cada uma) *'
    }
    if (form.regra_repeticao === 'avulso') {
      return 'Valor da cobrança *'
    }
    if (form.tipo_valor === 'variavel') {
      return 'Valor mensal estimado *'
    }
    return 'Valor mensal fixo *'
  }, [form.modalidade_parcelamento, form.regra_repeticao, form.tipo_valor])

  // Criar novo Destino inline
  const handleCreateNewTag = async () => {
    const nome = newTagName.trim()
    if (!nome) return
    try {
      const nova = await despesasService.saveTag({
        nome,
        cor: '#DF5830',
      })
      setLocalTags((prev) => [...prev, nova])
      setForm((prev) => ({ ...prev, tag: nova.id }))
      setNewTagName('')
      setCreatingTag(false)
      toast({
        title: 'Destino criado',
        description: `O destino/centro de custo "${nome}" foi cadastrado com sucesso.`,
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar destino',
        description: apiMessage(err),
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.descricao.trim()) {
      toast({
        variant: 'destructive',
        title: 'Descrição obrigatória',
        description: 'Informe a descrição da despesa.',
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

    if (form.titular_tipo === 'cnpj' && !form.titular_empresa) {
      toast({
        variant: 'destructive',
        title: 'Titular CNPJ obrigatório',
        description: 'Selecione a empresa titular da obrigação.',
      })
      return
    }

    if (form.titular_tipo === 'cpf' && !form.titular_pessoa && pessoas.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Titular Pessoal/CPF obrigatório',
        description: 'Selecione a pessoa titular da obrigação.',
      })
      return
    }

    // Regra de validação estrita da data de primeira cobrança vs dia de vencimento (Item 10)
    if (form.regra_repeticao !== 'avulso' && form.data_inicio) {
      const day = parseInt(form.data_inicio.slice(8, 10), 10)
      const diaVenc = Number(form.dia_vencimento)
      if (diaVenc && day !== diaVenc) {
        toast({
          variant: 'destructive',
          title: 'Vencimento incompatível',
          description: `A data da 1ª cobrança (${formatDate(
            form.data_inicio,
          )}) é no dia ${day}, mas o dia de vencimento está definido como ${diaVenc}. Ajuste para o mesmo dia do mês antes de salvar.`,
        })
        return
      }
    }

    // Validação de compatibilidade de Cartão de Crédito com método de pagamento
    if (isSelectedContaCartao && selectedConta && form.metodo_pagamento) {
      const selectedMetodo = metodosPagamento.find((m) => m.id === form.metodo_pagamento)
      if (selectedMetodo && selectedMetodo.tipo !== 'cartao') {
        toast({
          variant: 'destructive',
          title: 'Método de pagamento incompatível',
          description: `A conta "${selectedConta.nome}" é um cartão de crédito. Não selecione métodos do tipo "${selectedMetodo.nome}" (ex: Pix/Boleto).`,
        })
        return
      }
    }

    setSubmitting(true)
    try {
      const isParcelado = form.modalidade_parcelamento === 'parcelado'
      const totalParcelasNum = isParcelado ? Math.max(1, Number(form.total_parcelas) || 1) : 1
      const parcelaInicialNum = isParcelado ? Math.max(1, Number(form.parcela_inicial) || 1) : 1

      // Calcular data de término
      let dataFimIso: string | null = null
      if (isParcelado && calculoParcelamento?.ultimaData) {
        dataFimIso = calculoParcelamento.ultimaData.toISOString()
      }

      const payload: Partial<DespesaCompromisso> = {
        descricao: form.descricao.trim(),
        fornecedor: form.fornecedor.trim() || (null as unknown as string),
        categoria: form.categoria || (null as unknown as string),
        tag: form.tag || (null as unknown as string),
        secao: form.secao,

        // Titular da obrigação
        titular_tipo: form.titular_tipo,
        titular_pessoa:
          form.titular_tipo === 'cpf' && form.titular_pessoa
            ? form.titular_pessoa
            : (null as unknown as string),
        titular_empresa:
          form.titular_tipo === 'cnpj' && form.titular_empresa
            ? form.titular_empresa
            : (null as unknown as string),

        // Contexto_tipo legado para manter filtros e compatibilidade
        contexto_tipo: form.titular_tipo === 'cnpj' ? 'empresa' : 'pessoal',
        empresa:
          form.titular_tipo === 'cnpj' && form.titular_empresa
            ? form.titular_empresa
            : (null as unknown as string),
        pessoa:
          form.pessoa_responsavel ||
          (form.titular_tipo === 'cpf' ? form.titular_pessoa : null) ||
          (null as unknown as string),

        // Cobrança e valores independentes
        regra_repeticao: isParcelado ? 'parcelado' : form.regra_repeticao,
        tipo_valor: form.tipo_valor,
        modalidade_parcelamento: form.modalidade_parcelamento,
        total_parcelas: totalParcelasNum,
        parcela_inicial: parcelaInicialNum,
        valor_parcela: isParcelado ? Number(form.valor_estimado) : (null as unknown as number),
        dia_vencimento:
          form.regra_repeticao === 'avulso'
            ? parseInt(form.data_inicio.slice(8, 10), 10)
            : Number(form.dia_vencimento) || 10,
        regra_vencimento_texto:
          form.regra_repeticao === 'avulso'
            ? 'Único'
            : isParcelado
              ? `${form.dia_vencimento}/m (${totalParcelasNum}x)`
              : `${form.dia_vencimento}/m`,
        data_inicio: `${form.data_inicio} 00:00:00.000Z`,
        data_fim_calculada: dataFimIso as unknown as string,
        valor_estimado: Number(form.valor_estimado),

        // Pagamento
        conta_padrao: form.conta_padrao || (null as unknown as string),
        metodo_pagamento: form.metodo_pagamento || (null as unknown as string),
        link_pagamento: form.link_pagamento || (null as unknown as string),
        dizimo: form.dizimo,
        tipo_dizimo:
          form.dizimo && form.tipo_dizimo ? form.tipo_dizimo : (null as unknown as string),
        ativo: form.ativo,
        observacoes: form.observacoes || (null as unknown as string),

        precisa_revisao: form.precisa_revisao,
        motivo_revisao: form.motivo_revisao || (null as unknown as string),
      }

      const saved = await despesasService.saveCompromisso(payload, compromisso?.id)

      // Se for novo compromisso, gera as primeiras ocorrências automaticamente
      if (!compromisso) {
        await despesasService.gerarOcorrenciasParaCompromisso(saved)
      }

      toast({
        title: compromisso ? 'Compromisso atualizado' : 'Compromisso cadastrado!',
        description: 'Os dados da despesa e as ocorrências foram organizados com sucesso.',
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-xl font-extrabold text-foreground">
              {compromisso ? 'Editar compromisso de despesa' : 'Novo compromisso de despesa'}
            </DialogTitle>
            {form.precisa_revisao && (
              <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-700">
                Sinalizado para revisão
              </Badge>
            )}
          </div>
          <DialogDescription className="text-xs">
            Registre com precisão <strong>quem paga</strong>, <strong>para quem se paga</strong>,{' '}
            <strong>a quem a despesa se refere</strong>, sua <strong>finalidade</strong> e{' '}
            <strong>como a cobrança acontece</strong>.
          </DialogDescription>
        </DialogHeader>

        {form.precisa_revisao && form.motivo_revisao && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-500/10 p-3 text-xs text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-bold">Aviso de migração de registro antigo:</p>
              <p>{form.motivo_revisao}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* =========================================================
              GRUPO 1: DESPESA
             ========================================================= */}
          <div className="rounded-2xl border border-border bg-white p-4 shadow-soft space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                1. Despesa & Finalidade
              </h3>
              <span className="text-[11px] text-muted-foreground">O que é e para quem se paga</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="font-bold">Descrição da despesa *</Label>
                <Input
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Ex.: Internet Fibra, Mensalidade escolar da Rafa, Conta de energia do barracão..."
                  required
                  className="font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold">Fornecedor / favorecido</Label>
                <Input
                  value={form.fornecedor}
                  onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                  placeholder="Ex.: CPFL, Sesi, ConnectPlus, Posto Ipiranga..."
                />
                <p className="text-[11px] text-muted-foreground">Quem recebe o pagamento.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold">Categoria financeira (Finalidade)</Label>
                <Select
                  value={form.categoria || 'none'}
                  onValueChange={(v) => setForm({ ...form, categoria: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a finalidade" />
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
                <p className="text-[11px] text-muted-foreground">
                  Educação, Internet, Energia, Combustível, Impostos, etc.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Destino da despesa / Centro de custo</Label>
                  {!creatingTag && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[11px] text-primary"
                      onClick={() => setCreatingTag(true)}
                    >
                      <Plus className="mr-0.5 h-3 w-3" /> Novo destino
                    </Button>
                  )}
                </div>

                {creatingTag ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Novo destino (Ex: KzaMari, Rafa...)"
                      className="h-9 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 px-2.5 text-xs bg-primary"
                      onClick={handleCreateNewTag}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2 text-xs"
                      onClick={() => setCreatingTag(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={form.tag || 'none'}
                    onValueChange={(v) => setForm({ ...form, tag: v === 'none' ? '' : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="A quem a despesa se refere" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {localTags.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[11px] text-muted-foreground">
                  A quem ou a qual operação o gasto se refere (ex: Eu/Casa, Rafa, WeeKids).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold">Seção do painel (Visualização)</Label>
                <Select
                  value={form.secao}
                  onValueChange={(v) => {
                    const s = v as SecaoDespesa
                    setForm({ ...form, secao: s })
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
                <p className="text-[11px] text-muted-foreground">
                  Onde este compromisso será visualizado na interface de Despesas.
                </p>
              </div>
            </div>
          </div>

          {/* =========================================================
              GRUPO 2: TITULAR E DESTINO
             ========================================================= */}
          <div className="rounded-2xl border border-border bg-white p-4 shadow-soft space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                2. Titular da Despesa
              </h3>
              <span className="text-[11px] text-muted-foreground">
                A quem a obrigação legal/financeira pertence
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="font-semibold">Tipo do Titular</Label>
                <Select
                  value={form.titular_tipo}
                  onValueChange={(v) => {
                    const t = v as TitularTipo
                    setForm({
                      ...form,
                      titular_tipo: t,
                      titular_pessoa: t === 'cpf' ? pessoas[0]?.id || '' : '',
                      titular_empresa: t === 'cnpj' ? empresas[0]?.id || '' : '',
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-primary" />
                        <span>Pessoal / CPF</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="cnpj">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span>Empresa / CNPJ</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold">
                  {form.titular_tipo === 'cnpj'
                    ? 'Empresa / CNPJ Titular *'
                    : 'Pessoa / CPF Titular *'}
                </Label>
                {form.titular_tipo === 'cnpj' ? (
                  <Select
                    value={form.titular_empresa || 'none'}
                    onValueChange={(v) =>
                      setForm({ ...form, titular_empresa: v === 'none' ? '' : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o CNPJ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione uma empresa</SelectItem>
                      {empresas.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome_fantasia} ({e.cnpj || 'Sem CNPJ'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={form.titular_pessoa || 'none'}
                    onValueChange={(v) =>
                      setForm({ ...form, titular_pessoa: v === 'none' ? '' : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a pessoa física" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione uma pessoa</SelectItem>
                      {pessoas.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} ({p.cpf || 'Sem CPF'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Identifica o titular proprietário da obrigação legal.
                </p>
              </div>
            </div>
          </div>

          {/* =========================================================
              GRUPO 3: COBRANÇA E VALORES (REGRAS INDEPENDENTES)
             ========================================================= */}
          <div className="rounded-2xl border border-border bg-white p-4 shadow-soft space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                3. Cobrança e Valores
              </h3>
              <span className="text-[11px] text-muted-foreground">
                Repetição, previsibilidade e parcelamento
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Repetição */}
              <div className="space-y-1.5">
                <Label className="font-semibold">Repetição</Label>
                <Select
                  value={form.regra_repeticao}
                  onValueChange={(v) => {
                    const r = v as RegraRepeticao
                    setForm({ ...form, regra_repeticao: r })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal recorrente (sem fim)</SelectItem>
                    <SelectItem value="anual">Anual recorrente (assinatura)</SelectItem>
                    <SelectItem value="avulso">Pagamento único / Pontual</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Recorrente continua indefinidamente; único não se repete.
                </p>
              </div>

              {/* Valor Previsto: Fixo ou Variável */}
              <div className="space-y-1.5">
                <Label className="font-semibold">Previsibilidade do Valor</Label>
                <Select
                  value={form.tipo_valor}
                  onValueChange={(v) => setForm({ ...form, tipo_valor: v as TipoValorDespesa })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixo">Valor fixo</SelectItem>
                    <SelectItem value="variavel">Valor variável (estimativa)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Variável permite estimativa e ajuste do valor real a cada mês.
                </p>
              </div>

              {/* Parcelamento: À vista ou Parcelado */}
              <div className="space-y-1.5">
                <Label className="font-semibold">Parcelamento</Label>
                <Select
                  value={form.modalidade_parcelamento}
                  onValueChange={(v) => {
                    const m = v as ModalidadeParcelamento
                    setForm({
                      ...form,
                      modalidade_parcelamento: m,
                      total_parcelas: m === 'parcelado' ? Math.max(2, form.total_parcelas) : 1,
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_vista">À vista / Integral</SelectItem>
                    <SelectItem value="parcelado">Parcelado em N vezes</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Parcelado possui quantidade e data de término bem definidas.
                </p>
              </div>
            </div>

            {/* Configurações de Parcelamento Condicionais */}
            {form.modalidade_parcelamento === 'parcelado' && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="font-semibold text-xs">
                      Quantidade total de parcelas (N×)
                    </Label>
                    <Input
                      type="number"
                      min={2}
                      max={120}
                      value={form.total_parcelas}
                      onChange={(e) =>
                        setForm({ ...form, total_parcelas: parseInt(e.target.value, 10) || 2 })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-semibold text-xs">Parcela inicial</Label>
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
                </div>

                {calculoParcelamento && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-primary/15 pt-2 text-xs text-foreground">
                    <div>
                      <span>Valor total previsto da compra: </span>
                      <strong className="text-primary font-bold">
                        {formatCurrency(calculoParcelamento.valorTotalCalculado)}
                      </strong>{' '}
                      ({calculoParcelamento.total}x de{' '}
                      {formatCurrency(calculoParcelamento.valorParcela)})
                    </div>
                    <div>
                      <span>Término calculado: </span>
                      <strong>{calculoParcelamento.ultimaDataFormatada}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Vencimento e Valor */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="font-bold">{labelValor}</Label>
                <MoneyInput
                  value={form.valor_estimado}
                  onChange={(v) => setForm({ ...form, valor_estimado: v })}
                />
              </div>

              {/* Data da primeira cobrança ou vencimento único */}
              <div className="space-y-1.5">
                <Label className="font-semibold">
                  {form.regra_repeticao === 'avulso'
                    ? 'Data de vencimento *'
                    : '1ª cobrança / Início *'}
                </Label>
                <Input
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) => {
                    const newDate = e.target.value
                    let newDay = form.dia_vencimento
                    if (newDate) {
                      newDay = parseInt(newDate.slice(8, 10), 10) || form.dia_vencimento
                    }
                    setForm({
                      ...form,
                      data_inicio: newDate,
                      dia_vencimento: newDay,
                    })
                  }}
                  required
                />
              </div>

              {/* Dia de vencimento (somente visível para repetições mensais ou parceladas) */}
              {form.regra_repeticao !== 'avulso' && (
                <div className="space-y-1.5">
                  <Label className="font-semibold">Dia de vencimento (1 a 31)</Label>
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
                      })
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Dias 29, 30 ou 31 são ajustados no último dia dos meses curtos.
                  </p>
                </div>
              )}
            </div>

            {/* Alerta de incompatibilidade entre data da 1ª cobrança e dia de vencimento */}
            {avisoIncompatibilidadeData && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{avisoIncompatibilidadeData}</p>
              </div>
            )}
          </div>

          {/* =========================================================
              GRUPO 4: PAGAMENTO
             ========================================================= */}
          <div className="rounded-2xl border border-border bg-white p-4 shadow-soft space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                4. Pagamento & Acompanhamento
              </h3>
              <span className="text-[11px] text-muted-foreground">
                De onde o dinheiro sai e como é pago
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="font-semibold">Conta de pagamento prevista / Cartão</Label>
                <Select
                  value={form.conta_padrao || 'none'}
                  onValueChange={(v) => {
                    const contaId = v === 'none' ? '' : v
                    const c = contas.find((item) => item.id === contaId)
                    let updated = { ...form, conta_padrao: contaId }
                    if (c && c.tipo === 'cartao') {
                      if (c.dia_vencimento) {
                        updated.dia_vencimento = c.dia_vencimento
                      }
                      const matched = metodosPagamento.find(
                        (m) =>
                          m.conta_padrao === c.id ||
                          (m.tipo === 'cartao' &&
                            m.nome.toLowerCase().includes(c.nome.toLowerCase())),
                      )
                      if (matched) updated.metodo_pagamento = matched.id
                    }
                    setForm(updated)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione conta de onde o dinheiro sairá" />
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
                <p className="text-[11px] text-muted-foreground">
                  A conta não deduz nem substitui o titular da obrigação.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold">Método de pagamento</Label>
                <Select
                  value={form.metodo_pagamento || 'none'}
                  onValueChange={(v) =>
                    setForm({ ...form, metodo_pagamento: v === 'none' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pix, Boleto, Cartão, Débito..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {metodosPagamento.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Mantido separado da conta bancária/cartão.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold">Pessoa responsável (opcional)</Label>
                <Select
                  value={form.pessoa_responsavel || 'none'}
                  onValueChange={(v) =>
                    setForm({ ...form, pessoa_responsavel: v === 'none' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Quem acompanha ou executa" />
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
                <p className="text-[11px] text-muted-foreground">
                  Quem acompanha ou executa o pagamento (não substitui o titular).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold">Link de pagamento (boleto / portal)</Label>
                <Input
                  type="url"
                  value={form.link_pagamento}
                  onChange={(e) => setForm({ ...form, link_pagamento: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* Aviso visual caso a conta de pagamento pertença a titular diferente */}
            {titularidadeContaDiferente && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-500/10 p-3 text-xs text-amber-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold">Atenção à titularidade cruzada:</p>
                  <p>{titularidadeContaDiferente}</p>
                </div>
              </div>
            )}

            {/* Dízimo / Ofertas */}
            <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-bold text-foreground">Dízimo / Oferta ministerial</Label>
                  <p className="text-xs text-muted-foreground">
                    Marque para compromissos de dízimos/ofertas e compute nos totais do período
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

            <div className="space-y-1.5">
              <Label className="font-semibold">Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Anotações gerais, senhas, códigos de instalação ou regras contratuais..."
                rows={2}
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
