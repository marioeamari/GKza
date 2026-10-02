import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Building2,
  Check,
  CreditCard,
  FileText,
  HeartHandshake,
  Info,
  Layers,
  LoaderCircle,
  Plus,
  Receipt,
  Sparkles,
  UserCheck,
  UserRound,
  X,
} from 'lucide-react'

import { MoneyInput } from '@/components/MoneyInput'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ContaContextoWarning } from '@/components/ContaContextoWarning'
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
import { calcularFaturaCartao } from '@/lib/cartao-fatura'
import { dateOnly, formatCurrency, formatDate, toPocketBaseDate } from '@/lib/format'
import { getFileUrl } from '@/lib/pocketbase/files'
import { contaAceitaCredito, despesasService } from '@/services/despesas'
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
  ModalidadeParcelamento,
  Pessoa,
  RegraRepeticao,
  SecaoDespesa,
  TagItem,
  TelegramRegistroPendente,
  TipoDespesa,
  TipoDizimo,
  TipoValorDespesa,
  TitularTipo,
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

  // Estado para cadastro inline de novo Destino da despesa / Centro de custo
  const [creatingTag, setCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [localTags, setLocalTags] = useState<TagItem[]>(tags)

  useEffect(() => {
    setLocalTags(tags)
  }, [tags])

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

  // Form Despesa (Alinhado exatamente com DespesaCompromissoDialog)
  const [despForm, setDespForm] = useState({
    // Grupo 1: Despesa & Finalidade
    descricao: '',
    fornecedor: '',
    categoria: '',
    tag: '', // Destino da despesa / Centro de custo
    secao: 'contas_mensais_pix_boleto' as SecaoDespesa,

    // Grupo 2: Titular da despesa
    titular_tipo: 'cpf' as TitularTipo,
    titular_pessoa: '',
    titular_empresa: '',

    // Grupo 3: Cobrança e valores (regras independentes)
    regra_repeticao: 'mensal' as RegraRepeticao,
    tipo_valor: 'fixo' as TipoValorDespesa,
    modalidade_parcelamento: 'a_vista' as ModalidadeParcelamento,
    total_parcelas: 1,
    parcela_inicial: 1,
    dia_vencimento: 10,
    data_inicio: new Date().toISOString().slice(0, 10),
    valor_estimado: 0,

    // Grupo 4: Pagamento & Acompanhamento
    conta_padrao: '',
    metodo_pagamento: '',
    pessoa_responsavel: '',
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

  // Preenchimento inicial a partir do item do Telegram / Open Finance
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
    const descInit = item.descricao && item.descricao !== '-' ? item.descricao : ''

    // Titular default a partir do contexto ativo
    const defaultEmpresaId =
      item.empresa ||
      (activeContext.empresaIds.length > 0 ? activeContext.empresaIds[0] : empresas[0]?.id || '')
    const defaultPessoaId =
      item.pessoa ||
      (activeContext.pessoaIds.length > 0 ? activeContext.pessoaIds[0] : pessoas[0]?.id || '')
    const preferCnpj = item.empresa ? true : activeContext.hasEmpresas && !activeContext.hasPessoas

    // Inicializa formulário de lançamento
    setLancForm({
      descricao: descInit,
      valor: valorInit,
      tipo: item.tipo || 'despesa',
      data: dataInit,
      conta: contaInit,
      categoria: catInit,
      empresa: item.empresa || (preferCnpj ? defaultEmpresaId : ''),
      pessoa: item.pessoa || (!preferCnpj ? defaultPessoaId : ''),
      observacoes:
        item.observacoes || (item.contexto_nome ? `Contexto: ${item.contexto_nome}` : ''),
    })

    // Extrair dia de vencimento a partir da data do comprovante
    let dueDay = 10
    if (dataInit) {
      try {
        const parsedD = new Date(dataInit)
        if (!isNaN(parsedD.getDate())) {
          dueDay = parsedD.getUTCDate()
        }
      } catch (_) {
        dueDay = 10
      }
    }

    const metodosSemDinheiro = metodosPagamento.filter((m) => {
      const tipo = (m.tipo || '').toLowerCase()
      const nome = (m.nome || '').toLowerCase()
      const codigo = (m.codigo || '').toLowerCase()
      if (tipo === 'dinheiro') return false
      if (nome === 'dinheiro' || nome.includes('dinheiro')) return false
      if (codigo === 'dinheiro' || codigo === 'dinherio') return false
      return true
    })

    const defaultMetodo = metodosSemDinheiro[0]?.id || ''
    const defaultDizimoTipo = tiposDizimo[0]?.id || ''
    const defaultTag = tags[0]?.id || ''

    // Inicializa formulário de despesa (compromisso recorrente) com 4 grupos alinhados
    setDespForm({
      descricao: descInit,
      fornecedor: descInit,
      categoria: catInit,
      tag: defaultTag,
      secao: 'contas_mensais_pix_boleto',

      titular_tipo: preferCnpj ? 'cnpj' : 'cpf',
      titular_pessoa: defaultPessoaId,
      titular_empresa: defaultEmpresaId,

      regra_repeticao: 'mensal',
      tipo_valor: 'fixo',
      modalidade_parcelamento: 'a_vista',
      total_parcelas: 1,
      parcela_inicial: 1,
      dia_vencimento: dueDay,
      data_inicio: dataInit,
      valor_estimado: valorInit,

      conta_padrao: contaInit,
      metodo_pagamento: defaultMetodo,
      pessoa_responsavel: '',
      link_pagamento: '',
      dizimo: false,
      tipo_dizimo: defaultDizimoTipo,
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
  }, [contas, item, open, activeContext, tags, metodosPagamento, tiposDizimo, empresas, pessoas])

  // Categorias compatíveis
  const lancCategoryOptions = useMemo(
    () => categorias.filter((c) => c.tipo === lancForm.tipo),
    [categorias, lancForm.tipo],
  )

  const despCategoryOptions = useMemo(
    () => categorias.filter((c) => c.tipo === 'despesa'),
    [categorias],
  )

  // Opções de contas ativas ordenadas pela posição manual (ordem) com fallback alfabético pt-BR.
  const despContaOptions = useMemo(() => {
    const list = contas.filter((c) => c.ativa)
    return list.slice().sort((a, b) => {
      const ordemA = a.ordem ?? 999999
      const ordemB = b.ordem ?? 999999
      if (ordemA !== ordemB) return ordemA - ordemB
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    })
  }, [contas])

  const lancContaOptions = despContaOptions

  // Métodos de pagamento filtrados (remove a opção de 'dinheiro' no formulário de despesa)
  const metodosPagamentoDisponiveis = useMemo(() => {
    return metodosPagamento.filter((m) => {
      const tipo = (m.tipo || '').toLowerCase()
      const nome = (m.nome || '').toLowerCase()
      const codigo = (m.codigo || '').toLowerCase()
      if (tipo === 'dinheiro') return false
      if (nome === 'dinheiro' || nome.includes('dinheiro')) return false
      if (codigo === 'dinheiro' || codigo === 'dinherio') return false
      return true
    })
  }, [metodosPagamento])

  // Derivação automática da seção do painel a partir da conta e regra de repetição:
  // 1) Conta aceita crédito -> 'cartoes_credito'
  // 2) Repetição 'anual' -> 'assinaturas_anuais'
  // 3) Demais -> 'contas_mensais_pix_boleto'
  const secaoDerivada = useMemo((): SecaoDespesa => {
    const c = contas.find((item) => item.id === despForm.conta_padrao)
    if (c && (c.tipo === 'cartao' || contaAceitaCredito(c))) {
      return 'cartoes_credito'
    }
    if (despForm.regra_repeticao === 'anual') {
      return 'assinaturas_anuais'
    }
    return 'contas_mensais_pix_boleto'
  }, [contas, despForm.conta_padrao, despForm.regra_repeticao])

  // Identificação do Titular da Despesa selecionado
  const titularSelecionado = useMemo(() => {
    if (despForm.titular_tipo === 'cnpj') {
      const emp = empresas.find((e) => e.id === despForm.titular_empresa)
      return {
        tipo: 'CNPJ',
        label: emp ? `${emp.nome_fantasia} (${emp.cnpj || 'Sem CNPJ'})` : 'Nenhuma empresa',
        id: emp?.id,
        nome: emp?.nome_fantasia || 'Empresa',
      }
    } else {
      const pes = pessoas.find((p) => p.id === despForm.titular_pessoa)
      return {
        tipo: 'Pessoal/CPF',
        label: pes ? `${pes.nome} (${pes.cpf || 'Sem CPF'})` : 'Nenhuma pessoa',
        id: pes?.id,
        nome: pes?.nome || 'Pessoal',
      }
    }
  }, [despForm.titular_tipo, despForm.titular_empresa, despForm.titular_pessoa, empresas, pessoas])

  // Conta selecionada na Despesa
  const selectedDespConta = contas.find((c) => c.id === despForm.conta_padrao)
  // Conta com suporte a crédito (tipo 'cartao' ou tipos_pagamento incluindo 'credito')
  const temCredito = contaAceitaCredito(selectedDespConta)
  const isContaCartao = selectedDespConta?.tipo === 'cartao' || temCredito
  const isSelectedDespContaCartao = isContaCartao || secaoDerivada === 'cartoes_credito'

  // Ciclo da fatura para compras no cartão (calculado em tempo real com base na conta e data_inicio)
  const faturaCicloCartao = useMemo(() => {
    if (!selectedDespConta || !temCredito || !despForm.data_inicio) {
      return null
    }
    return calcularFaturaCartao(selectedDespConta, despForm.data_inicio)
  }, [selectedDespConta, temCredito, despForm.data_inicio])

  // Data de vencimento formatada derivada do ciclo do cartão
  const dataVencimentoCicloCartaoFormatada = useMemo(() => {
    if (!faturaCicloCartao) return null
    return formatDate(faturaCicloCartao.dataVencimento)
  }, [faturaCicloCartao])

  // Método selecionado
  const selectedMetodoPagamento = useMemo(() => {
    if (!despForm.metodo_pagamento) return null
    return metodosPagamento.find((m) => m.id === despForm.metodo_pagamento) || null
  }, [despForm.metodo_pagamento, metodosPagamento])

  // Identifica se o método é isento de vencimento fixo (Pix, débito, transferência, dinheiro ou caixa)
  const isMetodoIsentoDeVencimento = useMemo(() => {
    if (selectedDespConta?.tipo === 'caixa') return true

    if (selectedMetodoPagamento) {
      const tipo = selectedMetodoPagamento.tipo
      if (tipo === 'pix' || tipo === 'dinheiro' || tipo === 'transferencia') return true
      const nomeLower = (selectedMetodoPagamento.nome || '').toLowerCase()
      if (
        nomeLower.includes('pix') ||
        nomeLower.includes('dinheiro') ||
        nomeLower.includes('transferência') ||
        nomeLower.includes('transferencia') ||
        nomeLower.includes('débito') ||
        nomeLower.includes('debito')
      ) {
        return true
      }
    }
    return false
  }, [selectedDespConta, selectedMetodoPagamento])

  // Aviso orientativo NÃO-bloqueante: se a conta tem tipos_pagamento configurados,
  // o aviso orientativo aparece SOMENTE quando o tipo do método escolhido não está nos tipos da conta;
  // se está nos tipos, nenhum aviso; se a conta não tem tipos cadastrados, mantém o aviso conservador.
  const avisoCartaoMetodoNaoCartao = useMemo(() => {
    if (!selectedDespConta || !despForm.metodo_pagamento) return null
    if (!selectedMetodoPagamento) return null

    const tiposConta = selectedDespConta.tipos_pagamento
    if (tiposConta && tiposConta.length > 0) {
      const tipoMetodo = despesasService.mapearMetodoParaTipoPagamento(
        selectedMetodoPagamento,
        tiposConta,
      )
      if (!tiposConta.includes(tipoMetodo)) {
        const metodoNome = selectedMetodoPagamento.nome || 'selecionado'
        return `O método de pagamento "${metodoNome}" não está configurado entre os tipos aceitos pela conta "${selectedDespConta.nome}". Verifique se a forma de pagamento e a conta estão corretas.`
      }
      return null
    }

    // Se a conta não tem tipos cadastrados, manter aviso conservador
    if (selectedDespConta.tipo === 'cartao' && selectedMetodoPagamento.tipo !== 'cartao') {
      const metodoNome = selectedMetodoPagamento.nome || 'Pix/Boleto'
      return `A conta "${selectedDespConta.nome}" é um cartão de crédito e o método selecionado é ${metodoNome} — se a intenção é pagar a fatura do cartão, tudo bem; se a intenção é pagamento direto, considere escolher uma conta bancária.`
    }

    return null
  }, [selectedDespConta, despForm.metodo_pagamento, selectedMetodoPagamento])

  // Aviso de diferença de titularidade entre conta e despesa
  const titularidadeContaDiferente = useMemo(() => {
    if (!selectedDespConta) return null
    const nomeConta = selectedDespConta.nome.toLowerCase()
    const isContaPJ =
      nomeConta.includes('pj') ||
      nomeConta.includes('empresa') ||
      nomeConta.includes('corporativo') ||
      nomeConta.includes('inter')
    const isTitularCNPJ = despForm.titular_tipo === 'cnpj'

    if (isTitularCNPJ && !isContaPJ && selectedDespConta.tipo !== 'caixa') {
      return `A despesa pertence a uma empresa (${titularSelecionado.nome}), mas a conta de pagamento (${selectedDespConta.nome}) aparenta ser pessoal.`
    }
    if (!isTitularCNPJ && isContaPJ) {
      return `A despesa pertence a pessoa física (${titularSelecionado.nome}), mas o pagamento sairá de uma conta empresarial (${selectedDespConta.nome}).`
    }
    return null
  }, [selectedDespConta, despForm.titular_tipo, titularSelecionado])

  // Cálculos de parcelamento
  const calculoParcelamento = useMemo(() => {
    const isParcelado = despForm.modalidade_parcelamento === 'parcelado'
    if (!isParcelado || !despForm.data_inicio) {
      return null
    }

    const total = Math.max(1, Number(despForm.total_parcelas) || 1)
    const inicial = Math.max(1, Math.min(Number(despForm.parcela_inicial) || 1, total))
    const parcelasRestantes = total - inicial + 1
    const valorParcela = Number(despForm.valor_estimado) || 0
    const valorTotalCalculado = valorParcela * total

    try {
      const [y, m] = despForm.data_inicio.split('-').map((v) => parseInt(v, 10))
      const mesInicialZero = m - 1
      const mesFinalZero = mesInicialZero + (parcelasRestantes - 1)
      const dueDay = despForm.dia_vencimento || 10
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
    despForm.modalidade_parcelamento,
    despForm.data_inicio,
    despForm.total_parcelas,
    despForm.parcela_inicial,
    despForm.valor_estimado,
    despForm.dia_vencimento,
  ])

  // Verificação de compatibilidade entre dia de vencimento e data de início
  // Isenta pagamentos imediatos (Pix, débito, transferência, dinheiro ou caixa) e compras no cartão de crédito
  const avisoIncompatibilidadeData = useMemo(() => {
    if (despForm.regra_repeticao === 'avulso') return null
    if (isMetodoIsentoDeVencimento) return null
    if (isSelectedDespContaCartao) return null
    if (!despForm.data_inicio) return null
    const day = parseInt(despForm.data_inicio.slice(8, 10), 10)
    const diaVenc = Number(despForm.dia_vencimento)
    if (diaVenc && day !== diaVenc) {
      return `A data da primeira cobrança (${formatDate(
        despForm.data_inicio,
      )}) está marcada para o dia ${day}, enquanto o dia de vencimento fixado é ${diaVenc}. Ajuste um dos campos para manter a consistência dos vencimentos.`
    }
    return null
  }, [
    despForm.data_inicio,
    despForm.dia_vencimento,
    despForm.regra_repeticao,
    isMetodoIsentoDeVencimento,
    isSelectedDespContaCartao,
  ])

  // Rótulo dinâmico do campo de valor
  const labelValor = useMemo(() => {
    if (despForm.modalidade_parcelamento === 'parcelado') {
      return 'Valor da parcela (cada uma) *'
    }
    if (despForm.regra_repeticao === 'avulso') {
      return 'Valor da cobrança *'
    }
    if (despForm.tipo_valor === 'variavel') {
      return 'Valor mensal estimado *'
    }
    return 'Valor mensal fixo *'
  }, [despForm.modalidade_parcelamento, despForm.regra_repeticao, despForm.tipo_valor])

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
      setDespForm((prev) => ({ ...prev, tag: nova.id }))
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

  // Foto do comprovante
  const fotoUrl = useMemo(() => {
    if (!item) return ''
    if (item.comprovante_foto) {
      return getFileUrl(item, item.comprovante_foto)
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

    // Validações Lançamento
    if (destino === 'lancamento' || destino === 'ambos') {
      if (!lancForm.descricao.trim())
        nextErrors.lancDescricao = 'Informe a descrição do lançamento.'
      if (lancForm.valor <= 0)
        nextErrors.lancValor = 'Informe um valor maior que zero para o lançamento.'
      if (!lancForm.conta) nextErrors.lancConta = 'Selecione a conta bancária/cartão.'
      if (!lancForm.categoria) nextErrors.lancCategoria = 'Selecione a categoria financeira.'
    }

    // Validações Despesa
    if (destino === 'despesa' || destino === 'ambos') {
      if (!despForm.descricao.trim()) nextErrors.despDescricao = 'Informe a descrição da despesa.'
      if (despForm.valor_estimado <= 0)
        nextErrors.despValor = 'Informe um valor maior que zero para a despesa.'

      if (despForm.titular_tipo === 'cnpj' && !despForm.titular_empresa) {
        nextErrors.despTitular = 'Selecione a empresa titular da obrigação.'
      }
      if (despForm.titular_tipo === 'cpf' && !despForm.titular_pessoa && pessoas.length > 0) {
        nextErrors.despTitular = 'Selecione a pessoa titular da obrigação.'
      }

      // Consistência de dia de vencimento vs data da 1ª cobrança
      // Não bloqueia para métodos imediatos nem para compras com conta tipo cartão
      if (
        despForm.regra_repeticao !== 'avulso' &&
        !isMetodoIsentoDeVencimento &&
        !isSelectedDespContaCartao &&
        despForm.data_inicio
      ) {
        const day = parseInt(despForm.data_inicio.slice(8, 10), 10)
        const diaVenc = Number(despForm.dia_vencimento)
        if (diaVenc && day !== diaVenc) {
          nextErrors.despVencimento = `A data da 1ª cobrança (${formatDate(
            despForm.data_inicio,
          )}) é no dia ${day}, mas o dia de vencimento está definido como ${diaVenc}. Ajuste para o mesmo dia do mês.`
        }
      }
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      if (destino === 'ambos') {
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
          'Existe outro lançamento com mesmo valor na mesma data. Clique em confirmar novamente se desejar prosseguir.',
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

      const isParcelado = despForm.modalidade_parcelamento === 'parcelado'
      const totalParcelasNum = isParcelado ? Math.max(1, Number(despForm.total_parcelas) || 1) : 1
      const parcelaInicialNum = isParcelado ? Math.max(1, Number(despForm.parcela_inicial) || 1) : 1

      let dataFimIso: string | undefined = undefined
      if (isParcelado && calculoParcelamento?.ultimaData) {
        dataFimIso = calculoParcelamento.ultimaData.toISOString()
      }

      const despInput: TriagemDespesaInput = {
        descricao: despForm.descricao.trim(),
        fornecedor: despForm.fornecedor.trim() || undefined,
        categoria: despForm.categoria || undefined,
        tag: despForm.tag || undefined,
        secao: secaoDerivada,

        titular_tipo: despForm.titular_tipo,
        titular_pessoa:
          despForm.titular_tipo === 'cpf' && despForm.titular_pessoa
            ? despForm.titular_pessoa
            : undefined,
        titular_empresa:
          despForm.titular_tipo === 'cnpj' && despForm.titular_empresa
            ? despForm.titular_empresa
            : undefined,

        contexto_tipo: despForm.titular_tipo === 'cnpj' ? 'empresa' : 'pessoal',
        empresa:
          despForm.titular_tipo === 'cnpj' && despForm.titular_empresa
            ? despForm.titular_empresa
            : undefined,
        pessoa:
          despForm.pessoa_responsavel ||
          (despForm.titular_tipo === 'cpf' ? despForm.titular_pessoa : undefined) ||
          undefined,

        regra_repeticao: isParcelado ? 'mensal' : despForm.regra_repeticao,
        tipo_valor: despForm.tipo_valor,
        modalidade_parcelamento: despForm.modalidade_parcelamento,
        total_parcelas: totalParcelasNum,
        parcela_inicial: parcelaInicialNum,
        valor_parcela: isParcelado ? Number(despForm.valor_estimado) : undefined,
        dia_vencimento:
          despForm.regra_repeticao === 'avulso'
            ? parseInt(despForm.data_inicio.slice(8, 10), 10) || 10
            : Number(despForm.dia_vencimento) || 10,
        regra_vencimento_texto:
          despForm.regra_repeticao === 'avulso'
            ? 'Único'
            : isParcelado
              ? `${despForm.dia_vencimento}/m (${totalParcelasNum}x)`
              : `${despForm.dia_vencimento}/m`,
        data_inicio: despForm.data_inicio,
        data_fim_calculada: dataFimIso,
        valor_estimado: Number(despForm.valor_estimado),

        conta_padrao: despForm.conta_padrao || undefined,
        metodo_pagamento: despForm.metodo_pagamento || undefined,
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
          description: `“${despInput.descricao}” virou compromisso em /despesas com ocorrências geradas.`,
        })
      } else {
        await telegramPendentesService.triarComoAmbos(item.id, lancInput, despInput)
        toast({
          title: 'Triagem concluída: Lançamento + Despesa gerados!',
          description: `Criado o lançamento no caixa e o compromisso em /despesas.`,
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
              className="border-primary/30 bg-primary/10 text-primary font-bold text-xs"
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {item?.origem_tipo === 'open_finance' || item?.external_id?.startsWith('pluggy_')
                ? `Triagem Open Finance (${item?.banco_nome || 'Banco'})`
                : 'Triagem de Comprovante Telegram'}
            </Badge>
            {item?.contexto_nome && (
              <Badge variant="secondary" className="text-xs">
                Contexto: {item.contexto_nome}
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl font-bold">Definir Destino da Transação</DialogTitle>
          <DialogDescription>
            Escolha se esta transação representa um <strong>Lançamento de Caixa</strong>, uma{' '}
            <strong>Despesa Recorrente</strong> ou <strong>Ambos</strong> (pagamento imediato +
            compromisso futuro). Nada entra direto no caixa.
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

        {/* Card de Informações extraídas do Telegram ou Open Finance */}
        <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1 font-bold text-foreground">
              <FileText className="h-3.5 w-3.5 text-primary" />
              {item?.origem_tipo === 'open_finance' || item?.external_id?.startsWith('pluggy_')
                ? 'Dados Importados do Open Finance'
                : 'Dados Coletados pelo Telegram'}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Recebido:{' '}
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
              <span className="text-muted-foreground">Valor apurado:</span>{' '}
              <strong className="text-foreground">{item ? formatCurrency(item.valor) : '-'}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Tipo sugerido:</span>{' '}
              <strong className="text-foreground capitalize">{item?.tipo || 'despesa'}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Origem:</span>{' '}
              <strong className="text-foreground">
                {item?.origem_tipo === 'open_finance' || item?.external_id?.startsWith('pluggy_')
                  ? `Open Finance (${item?.banco_nome || 'Banco'})`
                  : item?.telegram_origem || 'Telegram'}
              </strong>
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
                🖼️ Ver anexo / comprovante original
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
                Compromisso em <strong>/despesas</strong> com ocorrências futuras.
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
                      {lancContaOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                          {c.tipo === 'cartao' && c.bandeira ? ` (${c.bandeira})` : ''}
                          {c.tipo !== 'cartao'
                            ? ` · [${c.tipo === 'caixa' ? 'Caixa' : c.tipo === 'bancaria' ? 'Banco' : 'Marketplace'}]`
                            : ' · [Cartão]'}
                          {!c.ativa ? ' · (Inativa)' : ''}
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

          {/* FORMULÁRIO: Despesa Recorrente (4 GRUPOS IGUAIS A DESPESACOMPROMISSODIALOG) */}
          {(destino === 'despesa' || (destino === 'ambos' && activeStepTab === 'despesa')) && (
            <div className="space-y-4">
              {/* =========================================================
                  GRUPO 1: DESPESA & FINALIDADE
                 ========================================================= */}
              <div className="rounded-xl border border-border bg-white p-3.5 shadow-soft space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5" />
                    1. Despesa & Finalidade
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    O que é e para quem se paga
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-bold">Descrição da despesa *</Label>
                    <Input
                      value={despForm.descricao}
                      onChange={(e) =>
                        setDespForm((prev) => ({ ...prev, descricao: e.target.value }))
                      }
                      placeholder="Ex.: Internet Fibra, CPFL Energia, Assinatura Google..."
                      required
                    />
                    {errors.despDescricao && (
                      <p className="text-xs text-destructive">{errors.despDescricao}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Fornecedor / favorecido</Label>
                    <Input
                      value={despForm.fornecedor}
                      onChange={(e) =>
                        setDespForm((prev) => ({ ...prev, fornecedor: e.target.value }))
                      }
                      placeholder="Ex.: ConectPlus, CPFL, Vivo..."
                    />
                    <p className="text-[10px] text-muted-foreground">Quem recebe o pagamento.</p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">
                      Categoria financeira (Finalidade)
                    </Label>
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
                    <p className="text-[10px] text-muted-foreground">
                      Educação, Internet, Energia, Impostos, etc.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">
                        Destino da despesa / Centro de custo
                      </Label>
                      {!creatingTag && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[10px] text-primary"
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
                          className="h-8 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 px-2 text-xs bg-primary text-white"
                          onClick={handleCreateNewTag}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => setCreatingTag(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Select
                        value={despForm.tag || 'none'}
                        onValueChange={(v) =>
                          setDespForm((prev) => ({ ...prev, tag: v === 'none' ? '' : v }))
                        }
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
                    <p className="text-[10px] text-muted-foreground">
                      A quem se refere (ex: Eu/Casa, Rafa, WeeKids).
                    </p>
                  </div>
                </div>
              </div>

              {/* =========================================================
                  GRUPO 2: TITULAR E DESTINO
                 ========================================================= */}
              <div className="rounded-xl border border-border bg-white p-3.5 shadow-soft space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5" />
                    2. Titular da Despesa
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    A quem a obrigação legal pertence
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Tipo do Titular</Label>
                    <Select
                      value={despForm.titular_tipo}
                      onValueChange={(v) => {
                        const t = v as TitularTipo
                        setDespForm((prev) => ({
                          ...prev,
                          titular_tipo: t,
                          titular_pessoa: t === 'cpf' ? pessoas[0]?.id || '' : '',
                          titular_empresa: t === 'cnpj' ? empresas[0]?.id || '' : '',
                        }))
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpf">
                          <div className="flex items-center gap-2">
                            <UserRound className="h-3.5 w-3.5 text-primary" />
                            <span>Pessoal / CPF</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="cnpj">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-primary" />
                            <span>Empresa / CNPJ</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">
                      {despForm.titular_tipo === 'cnpj'
                        ? 'Empresa / CNPJ Titular *'
                        : 'Pessoa / CPF Titular *'}
                    </Label>
                    {despForm.titular_tipo === 'cnpj' ? (
                      <Select
                        value={despForm.titular_empresa || 'none'}
                        onValueChange={(v) =>
                          setDespForm((prev) => ({
                            ...prev,
                            titular_empresa: v === 'none' ? '' : v,
                          }))
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
                        value={despForm.titular_pessoa || 'none'}
                        onValueChange={(v) =>
                          setDespForm((prev) => ({
                            ...prev,
                            titular_pessoa: v === 'none' ? '' : v,
                          }))
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
                    {errors.despTitular && (
                      <p className="text-xs text-destructive">{errors.despTitular}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Proprietário da obrigação legal (independente da conta bancária).
                    </p>
                  </div>
                </div>
              </div>

              {/* =========================================================
                  GRUPO 3: COBRANÇA E VALORES
                 ========================================================= */}
              <div className="rounded-xl border border-border bg-white p-3.5 shadow-soft space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                    3. Cobrança e Valores
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    Repetição, previsibilidade e parcelamento
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {/* Repetição */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Repetição</Label>
                    <Select
                      value={despForm.regra_repeticao}
                      onValueChange={(v) =>
                        setDespForm((prev) => ({
                          ...prev,
                          regra_repeticao: v as RegraRepeticao,
                        }))
                      }
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
                  </div>

                  {/* Valor Previsto: Fixo ou Variável */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Previsibilidade do Valor</Label>
                    <Select
                      value={despForm.tipo_valor}
                      onValueChange={(v) =>
                        setDespForm((prev) => ({ ...prev, tipo_valor: v as TipoValorDespesa }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixo">Valor fixo</SelectItem>
                        <SelectItem value="variavel">Valor variável (estimativa)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Parcelamento: À vista ou Parcelado */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Parcelamento</Label>
                    <Select
                      value={despForm.modalidade_parcelamento}
                      onValueChange={(v) => {
                        const m = v as ModalidadeParcelamento
                        setDespForm((prev) => ({
                          ...prev,
                          modalidade_parcelamento: m,
                          total_parcelas: m === 'parcelado' ? Math.max(2, prev.total_parcelas) : 1,
                        }))
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
                  </div>
                </div>

                {/* Bloco de Parcelamento Condicional */}
                {despForm.modalidade_parcelamento === 'parcelado' && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">
                          Quantidade total de parcelas (N×)
                        </Label>
                        <Input
                          type="number"
                          min={2}
                          max={120}
                          value={despForm.total_parcelas}
                          onChange={(e) =>
                            setDespForm((prev) => ({
                              ...prev,
                              total_parcelas: parseInt(e.target.value, 10) || 2,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Parcela inicial</Label>
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
                    </div>

                    {calculoParcelamento && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-primary/15 pt-2 text-[11px] text-foreground">
                        <div>
                          <span>Total previsto: </span>
                          <strong className="text-primary font-bold">
                            {formatCurrency(calculoParcelamento.valorTotalCalculado)}
                          </strong>{' '}
                          ({calculoParcelamento.total}x de{' '}
                          {formatCurrency(calculoParcelamento.valorParcela)})
                        </div>
                        <div>
                          <span>Término: </span>
                          <strong>{calculoParcelamento.ultimaDataFormatada}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Valores e Vencimento */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">{labelValor}</Label>
                    <MoneyInput
                      value={despForm.valor_estimado}
                      onChange={(v) => setDespForm((prev) => ({ ...prev, valor_estimado: v }))}
                    />
                    {errors.despValor && (
                      <p className="text-xs text-destructive">{errors.despValor}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">
                      {isSelectedDespContaCartao
                        ? 'Data da compra *'
                        : despForm.regra_repeticao === 'avulso'
                          ? 'Data de vencimento *'
                          : '1ª cobrança / Início *'}
                    </Label>
                    <Input
                      type="date"
                      value={despForm.data_inicio}
                      onChange={(e) => {
                        const newDate = e.target.value
                        let newDay = despForm.dia_vencimento
                        if (newDate && !isSelectedDespContaCartao) {
                          newDay = parseInt(newDate.slice(8, 10), 10) || despForm.dia_vencimento
                        }
                        setDespForm((prev) => ({
                          ...prev,
                          data_inicio: newDate,
                          dia_vencimento: newDay,
                        }))
                      }}
                      required
                    />
                    {isSelectedDespContaCartao && (
                      <p className="text-[10px] text-muted-foreground">
                        Data em que a compra no cartão foi/será realizada.
                      </p>
                    )}
                  </div>

                  {isSelectedDespContaCartao ? (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Data de vencimento
                      </Label>
                      <Input
                        type="text"
                        disabled
                        value={
                          dataVencimentoCicloCartaoFormatada
                            ? `Vencimento: ${dataVencimentoCicloCartaoFormatada} (definido pelo ciclo do cartão)`
                            : selectedDespConta?.dia_vencimento
                              ? `Vencimento: todo dia ${selectedDespConta.dia_vencimento} (definido pelo ciclo do cartão)`
                              : 'Vencimento: definido pelo ciclo do cartão'
                        }
                        className="bg-secondary/40 font-medium text-xs cursor-not-allowed text-foreground"
                      />
                      <p className="text-[10px] font-medium text-primary">
                        Vencimento: definido pelo ciclo do cartão
                        {dataVencimentoCicloCartaoFormatada
                          ? ` (${dataVencimentoCicloCartaoFormatada})`
                          : ''}
                      </p>
                    </div>
                  ) : (
                    despForm.regra_repeticao !== 'avulso' && (
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Dia de vencimento (1 a 31)</Label>
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
                            }))
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Dias 29 a 31 ajustados em meses curtos.
                        </p>
                      </div>
                    )
                  )}
                </div>

                {/* Badge dinâmica do ciclo do cartão em tempo real */}
                {isSelectedDespContaCartao && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {faturaCicloCartao ? (
                        <Badge
                          variant="outline"
                          className="border-primary/40 bg-primary/10 text-primary font-bold text-xs px-2 py-0.5"
                        >
                          Fatura de{' '}
                          {(() => {
                            const dateObj = new Date(faturaCicloCartao.dataFechamento + 'T12:00:00')
                            const mesAno = dateObj.toLocaleDateString('pt-BR', {
                              month: 'short',
                              year: 'numeric',
                            })
                            const [vy, vm, vd] = faturaCicloCartao.dataVencimento.split('-')
                            return `${mesAno.charAt(0).toUpperCase() + mesAno.slice(1)} · vence ${vd}/${vm}`
                          })()}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-primary/40 bg-primary/10 text-primary text-xs"
                        >
                          Fatura do cartão: informe a data da compra
                        </Badge>
                      )}
                    </div>
                    {faturaCicloCartao && (
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Compra em {formatDate(despForm.data_inicio)}. Ciclo fecha em{' '}
                        {formatDate(faturaCicloCartao.dataFechamento)} e fatura vence em{' '}
                        {formatDate(faturaCicloCartao.dataVencimento)}.
                      </p>
                    )}
                  </div>
                )}

                {avisoIncompatibilidadeData && (
                  <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{avisoIncompatibilidadeData}</p>
                  </div>
                )}
                {errors.despVencimento && !isSelectedDespContaCartao && (
                  <p className="text-xs text-destructive font-medium">{errors.despVencimento}</p>
                )}
              </div>

              {/* =========================================================
                  GRUPO 4: PAGAMENTO & ACOMPANHAMENTO
                 ========================================================= */}
              <div className="rounded-xl border border-border bg-white p-3.5 shadow-soft space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                    4. Pagamento & Acompanhamento
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    De onde o dinheiro sai e como é pago
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">
                      Conta de pagamento prevista / Cartão
                    </Label>
                    <Select
                      value={despForm.conta_padrao || 'none'}
                      onValueChange={(v) => {
                        const contaId = v === 'none' ? '' : v
                        const c = contas.find((item) => item.id === contaId)
                        const updated = { ...despForm, conta_padrao: contaId }
                        if (c && (c.tipo === 'cartao' || contaAceitaCredito(c))) {
                          if (c.tipo === 'cartao') {
                            updated.secao = 'cartoes_credito'
                          }
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
                        setDespForm(updated)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione conta de onde o dinheiro sairá" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {despContaOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                            {c.tipo === 'cartao' && c.bandeira ? ` (${c.bandeira})` : ''}
                            {c.tipo !== 'cartao'
                              ? ` · [${c.tipo === 'caixa' ? 'Caixa' : c.tipo === 'bancaria' ? 'Banco' : 'Marketplace'}]`
                              : ' · [Cartão]'}
                            {!c.ativa ? ' · (Inativa)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {despForm.conta_padrao && (
                      <ContaContextoWarning
                        contaId={despForm.conta_padrao}
                        contas={contas}
                        className="mt-1"
                      />
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Método de pagamento</Label>
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
                        <SelectValue placeholder="Pix, Boleto, Cartão, Débito..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {metodosPagamentoDisponiveis.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {avisoCartaoMetodoNaoCartao && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-500/10 p-2 text-[11px] text-amber-900 mt-1">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <p className="leading-relaxed">{avisoCartaoMetodoNaoCartao}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Pessoa responsável (opcional)</Label>
                    <Select
                      value={despForm.pessoa_responsavel || 'none'}
                      onValueChange={(v) =>
                        setDespForm((prev) => ({
                          ...prev,
                          pessoa_responsavel: v === 'none' ? '' : v,
                        }))
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
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Link de pagamento (opcional)</Label>
                    <Input
                      type="url"
                      value={despForm.link_pagamento}
                      onChange={(e) =>
                        setDespForm((prev) => ({ ...prev, link_pagamento: e.target.value }))
                      }
                      placeholder="https://..."
                    />
                  </div>
                </div>

                {titularidadeContaDiferente && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-500/10 p-2.5 text-xs text-amber-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="font-bold">Atenção à titularidade cruzada:</p>
                      <p>{titularidadeContaDiferente}</p>
                    </div>
                  </div>
                )}

                {/* Dízimo / Ofertas */}
                <div className="rounded-xl border border-border bg-secondary/20 p-2.5 space-y-2">
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

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Observações</Label>
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
