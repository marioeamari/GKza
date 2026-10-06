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
import { calcularFaturaCartao, getAvisoFaturaCartao } from '@/lib/cartao-fatura'
import { formatCurrency, formatDate } from '@/lib/format'
import { contaAceitaCredito, isMetodoCredito, despesasService } from '@/services/despesas'
import { financeService } from '@/services/finance'
import { ContaContextoWarning } from '@/components/ContaContextoWarning'
import { AnexoUploadField } from '@/components/despesas/AnexoUploadField'
import type {
  Categoria,
  Conta,
  DespesaCompromisso,
  DespesaOcorrencia,
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
  isDuplicating?: boolean
  categorias: Categoria[]
  tags: TagItem[]
  tiposDespesa: TipoDespesa[]
  metodosPagamento: MetodoPagamento[]
  tiposDizimo: TipoDizimo[]
  contas: Conta[]
  pessoas: Pessoa[]
  empresas: Empresa[]
  defaultSecao?: SecaoDespesa
  defaultContaId?: string
  defaultMetodoId?: string
  onSuccess?: () => void
}

export function DespesaCompromissoDialog({
  open,
  onOpenChange,
  compromisso,
  isDuplicating = false,
  categorias,
  tags,
  tiposDespesa,
  metodosPagamento,
  tiposDizimo,
  contas,
  pessoas,
  empresas,
  defaultSecao = 'contas_mensais_pix_boleto',
  defaultContaId,
  defaultMetodoId,
  onSuccess,
}: DespesaCompromissoDialogProps) {
  const { activeContext } = useAppContext()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  // Estado para cadastro inline de novo Destino da despesa / Centro de custo
  const [creatingTag, setCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [localTags, setLocalTags] = useState<TagItem[]>(tags)

  // Arquivo anexo da conta a ser paga (PDF ou imagem / foto da câmera)
  const [selectedAnexoConta, setSelectedAnexoConta] = useState<File | null>(null)
  const [removerAnexoConta, setRemoverAnexoConta] = useState(false)

  // Ocorrências pagas do compromisso (para carregar o comprovante de pagamento)
  const [ocorrenciasPagas, setOcorrenciasPagas] = useState<DespesaOcorrencia[]>([])
  const [loadingOcorrenciasPagas, setLoadingOcorrenciasPagas] = useState(false)
  // Comprovante da ocorrência paga selecionada (mais recente ou específica)
  const [selectedComprovanteOcorrencia, setSelectedComprovanteOcorrencia] = useState<File | null>(
    null,
  )
  const [removerComprovanteOcorrencia, setRemoverComprovanteOcorrencia] = useState(false)

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
    dizimo_percentual: 100,
    direcionamento: '',
    ativo: true,
    observacoes: '',

    // Campos de revisão
    precisa_revisao: false,
    motivo_revisao: '',
  })

  // Carrega as ocorrências pagas do compromisso em edição (apenas em edição real, nunca ao duplicar)
  useEffect(() => {
    if (open && compromisso?.id && !isDuplicating) {
      setLoadingOcorrenciasPagas(true)
      setSelectedComprovanteOcorrencia(null)
      setRemoverComprovanteOcorrencia(false)
      despesasService
        .listOcorrencias({
          filter: `compromisso = '${compromisso.id}' && status = 'paga'`,
          sort: '-data_pagamento',
        })
        .then((items) => {
          setOcorrenciasPagas(items)
        })
        .catch((err) => {
          console.warn('Erro ao carregar ocorrências pagas para o modal de despesa:', err)
          setOcorrenciasPagas([])
        })
        .finally(() => {
          setLoadingOcorrenciasPagas(false)
        })
    } else {
      setOcorrenciasPagas([])
      setSelectedComprovanteOcorrencia(null)
      setRemoverComprovanteOcorrencia(false)
    }
  }, [open, compromisso?.id, isDuplicating])

  // Popula o formulário ao abrir
  useEffect(() => {
    if (open) {
      setSelectedAnexoConta(null)
      setRemoverAnexoConta(false)
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

        // Se for duplicação, adiciona o sufixo "(cópia)" se já não contiver
        let descricaoFinal = compromisso.descricao || ''
        if (isDuplicating && descricaoFinal.trim()) {
          descricaoFinal = descricaoFinal.includes('(cópia)')
            ? descricaoFinal
            : `${descricaoFinal} (cópia)`
        }

        setForm({
          descricao: descricaoFinal,
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
          dizimo_percentual:
            compromisso.dizimo_percentual !== undefined && compromisso.dizimo_percentual !== null
              ? Number(compromisso.dizimo_percentual)
              : 100,
          direcionamento: compromisso.direcionamento || '',
          ativo: isDuplicating ? true : (compromisso.ativo ?? true),
          observacoes: compromisso.observacoes || '',

          precisa_revisao: isDuplicating ? false : compromisso.precisa_revisao || false,
          motivo_revisao: isDuplicating ? '' : compromisso.motivo_revisao || '',
        })
      } else {
        // Defaults inteligentes para criação
        const isCartao = defaultSecao === 'cartoes_credito'
        const isAnual = defaultSecao === 'assinaturas_anuais'

        const metodosSemDinheiro = metodosPagamento.filter((m) => {
          const tipo = (m.tipo || '').toLowerCase()
          const nome = (m.nome || '').toLowerCase()
          const codigo = (m.codigo || '').toLowerCase()
          if (tipo === 'dinheiro') return false
          if (nome === 'dinheiro' || nome.includes('dinheiro')) return false
          if (codigo === 'dinheiro' || codigo === 'dinherio') return false
          return true
        })

        const defaultCardConta = contas.find((c) => c.tipo === 'cartao' && c.ativa)
        const defaultCard = defaultCardConta?.id || ''
        const resolvedDefaultConta =
          defaultContaId ||
          (isCartao ? defaultCard : contas.find((c) => c.ativa && c.tipo !== 'cartao')?.id || '')
        const resolvedDefaultMetodo = defaultMetodoId || metodosSemDinheiro[0]?.id || ''
        const defaultDizimoTipo = tiposDizimo[0]?.id || ''

        // Titular default a partir do contexto ativo
        const defaultEmpresaId =
          activeContext.empresaIds.length > 0 ? activeContext.empresaIds[0] : empresas[0]?.id || ''
        const defaultPessoaId =
          activeContext.pessoaIds.length > 0 ? activeContext.pessoaIds[0] : pessoas[0]?.id || ''
        const preferCnpj = activeContext.hasEmpresas && !activeContext.hasPessoas

        const todayStr = new Date().toISOString().slice(0, 10)
        const defaultContaObj = contas.find((c) => c.id === resolvedDefaultConta)
        const isDefaultContaCartao =
          (defaultContaObj?.tipo === 'cartao' || contaAceitaCredito(defaultContaObj)) &&
          isMetodoCredito(resolvedDefaultMetodo, metodosPagamento)
        const todayDay =
          isDefaultContaCartao && defaultContaObj?.dia_vencimento
            ? defaultContaObj.dia_vencimento
            : new Date().getDate()

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

          conta_padrao: resolvedDefaultConta,
          metodo_pagamento: resolvedDefaultMetodo,
          pessoa_responsavel: '',
          link_pagamento: '',
          dizimo: false,
          tipo_dizimo: defaultDizimoTipo,
          dizimo_percentual: 100,
          direcionamento: '',
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
    defaultContaId,
    defaultMetodoId,
    isDuplicating,
    open,
    contas,
    metodosPagamento,
    tiposDizimo,
    activeContext,
    pessoas,
    empresas,
  ])

  // Ocorrência paga mais recente (ou selecionada)
  const ocorrenciaPagaMaisRecente = useMemo(() => {
    return ocorrenciasPagas[0] || null
  }, [ocorrenciasPagas])

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

  // Derivação automática da seção do painel a partir do método de pagamento, conta e regra de repetição:
  // REGRA: o ciclo da fatura e seção 'cartoes_credito' aplicam-se EXCLUSIVAMENTE quando o método é Crédito
  // E a conta aceita crédito (ou é tipo cartão) com fechamento/vencimento.
  // 1) Método é crédito E (conta tipo cartão OU conta aceita crédito) -> 'cartoes_credito'
  // 2) Repetição 'anual' -> 'assinaturas_anuais'
  // 3) Demais -> 'contas_mensais_pix_boleto'
  const secaoDerivada = useMemo((): SecaoDespesa => {
    const c = contas.find((item) => item.id === form.conta_padrao)
    const metodoEhCredito = isMetodoCredito(form.metodo_pagamento, metodosPagamento)
    const contaTemCredito = c
      ? (c.tipo === 'cartao' || contaAceitaCredito(c)) && !!c.dia_fechamento
      : false

    if (metodoEhCredito && contaTemCredito) {
      return 'cartoes_credito'
    }
    if (form.regra_repeticao === 'anual') {
      return 'assinaturas_anuais'
    }
    return 'contas_mensais_pix_boleto'
  }, [contas, form.conta_padrao, form.metodo_pagamento, form.regra_repeticao, metodosPagamento])

  // Opções de contas para o select "Conta de pagamento prevista / Cartão":
  // Lista contas ativas cadastradas (bancaria, caixa, cartao, marketplace) ordenadas por ordem / nome.
  // Preserva a conta já vinculada no compromisso em edição apenas se houver compromisso existente sendo editado.
  const contasOptions = useMemo(() => {
    const list = contas.filter((c) => {
      if (c.ativa) return true
      if (compromisso && form.conta_padrao && c.id === form.conta_padrao) return true
      return false
    })
    return list.slice().sort((a, b) => {
      const ordemA = a.ordem ?? 999999
      const ordemB = b.ordem ?? 999999
      if (ordemA !== ordemB) return ordemA - ordemB
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    })
  }, [contas, form.conta_padrao, compromisso])

  // Métodos de pagamento filtrados (remove a opção de 'dinheiro' no formulário)
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

  // Conta de pagamento selecionada
  const selectedConta = contas.find((c) => c.id === form.conta_padrao)
  // Conta com suporte a crédito (tipo 'cartao' ou tipos_pagamento incluindo 'credito')
  const temCredito = contaAceitaCredito(selectedConta)
  const selectedMetodoEhCredito = isMetodoCredito(form.metodo_pagamento, metodosPagamento)
  // Só considera compra no ciclo do cartão se o método for CRÉDITO e a conta tiver suporte a crédito
  const isContaCartao = (selectedConta?.tipo === 'cartao' || temCredito) && selectedMetodoEhCredito
  const isSelectedContaCartao = isContaCartao || secaoDerivada === 'cartoes_credito'

  // Ciclo da fatura para compras no cartão (calculado em tempo real com base na conta, método crédito e data_inicio)
  const faturaCicloCartao = useMemo(() => {
    if (!isSelectedContaCartao || !selectedConta || !temCredito || !form.data_inicio) return null
    return calcularFaturaCartao(selectedConta, form.data_inicio)
  }, [isSelectedContaCartao, selectedConta, temCredito, form.data_inicio])

  const avisoFaturaCartao = useMemo(() => {
    if (!isSelectedContaCartao || !selectedConta || !temCredito || !form.data_inicio) return null
    return getAvisoFaturaCartao(selectedConta, form.data_inicio)
  }, [isSelectedContaCartao, selectedConta, temCredito, form.data_inicio])

  // Data de vencimento formatada ou dia de vencimento derivado do ciclo do cartão
  const dataVencimentoCicloCartaoFormatada = useMemo(() => {
    if (!faturaCicloCartao) return null
    return formatDate(faturaCicloCartao.dataVencimento)
  }, [faturaCicloCartao])

  // Método de pagamento selecionado
  const selectedMetodoPagamento = useMemo(() => {
    if (!form.metodo_pagamento) return null
    return metodosPagamento.find((m) => m.id === form.metodo_pagamento) || null
  }, [form.metodo_pagamento, metodosPagamento])

  // Identifica se o método de pagamento não depende de vencimento fixo
  // (Pix, débito, transferência, dinheiro ou conta do tipo caixa — métodos pagos na hora pelo saldo atual).
  const isMetodoIsentoDeVencimento = useMemo(() => {
    if (selectedConta?.tipo === 'caixa') return true

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
  }, [selectedConta, selectedMetodoPagamento])

  // Alerta informativo orientativo: se a conta tem tipos_pagamento configurados,
  // o aviso orientativo aparece SOMENTE quando o tipo do método escolhido não está nos tipos da conta;
  // se está nos tipos, nenhum aviso; se a conta não tem tipos cadastrados, mantém o aviso conservador.
  const avisoCartaoMetodoNaoCartao = useMemo(() => {
    if (!selectedConta || !form.metodo_pagamento) return null
    const selectedMetodo = metodosPagamento.find((m) => m.id === form.metodo_pagamento)
    if (!selectedMetodo) return null

    const tiposConta = selectedConta.tipos_pagamento
    if (tiposConta && tiposConta.length > 0) {
      const tipoMetodo = despesasService.mapearMetodoParaTipoPagamento(selectedMetodo, tiposConta)
      if (!tiposConta.includes(tipoMetodo)) {
        const metodoNome = selectedMetodo.nome || 'selecionado'
        return `O método de pagamento "${metodoNome}" não está configurado entre os tipos aceitos pela conta "${selectedConta.nome}". Verifique se a forma de pagamento e a conta estão corretas.`
      }
      return null
    }

    // Se a conta não tem tipos cadastrados, manter aviso conservador
    if (selectedConta.tipo === 'cartao' && selectedMetodo.tipo !== 'cartao') {
      const metodoNome = selectedMetodo.nome || 'Pix/Boleto'
      return `A conta "${selectedConta.nome}" é um cartão de crédito e o método selecionado é ${metodoNome} — se a intenção é pagar a fatura do cartão, tudo bem; se a intenção é pagamento direto, considere escolher uma conta bancária.`
    }

    return null
  }, [selectedConta, form.metodo_pagamento, metodosPagamento])

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
  // Isenta pagamentos imediatos (Pix, débito, transferência, dinheiro ou caixa) e compras no cartão de crédito
  // (onde o vencimento é por natureza governado pelo ciclo da fatura, não pela data da compra).
  // Também não bloqueia nem adverte quando data_inicio for de mês retroativo (as ocorrências retroativas
  // são geradas normalmente respeitando o dia de vencimento).
  const avisoIncompatibilidadeData = useMemo(() => {
    if (form.regra_repeticao === 'avulso') return null
    if (isMetodoIsentoDeVencimento) return null
    if (isSelectedContaCartao) return null
    if (!form.data_inicio) return null

    // Se a data de início for em mês retroativo em relação ao mês atual, permitir livremente
    const currentComp = new Date().toISOString().slice(0, 7)
    const startComp = form.data_inicio.slice(0, 7)
    if (startComp < currentComp) return null

    const day = parseInt(form.data_inicio.slice(8, 10), 10)
    const diaVenc = Number(form.dia_vencimento)
    if (diaVenc && day !== diaVenc) {
      return `A data da primeira cobrança (${formatDate(
        form.data_inicio,
      )}) está marcada para o dia ${day}, enquanto o dia de vencimento fixado é ${diaVenc}. Ajuste um dos campos para manter a consistência dos vencimentos.`
    }
    return null
  }, [
    form.data_inicio,
    form.dia_vencimento,
    form.regra_repeticao,
    isMetodoIsentoDeVencimento,
    isSelectedContaCartao,
  ])

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
    // Não se aplica a pagamentos sem dependência de vencimento (Pix, débito, transferência, dinheiro, caixa) nem a compras no cartão,
    // tampouco a compromissos com data_inicio retroativa (mês passado), cuja geração criará ocorrências retroativas.
    if (
      form.regra_repeticao !== 'avulso' &&
      !isMetodoIsentoDeVencimento &&
      !isSelectedContaCartao &&
      form.data_inicio
    ) {
      const currentComp = new Date().toISOString().slice(0, 7)
      const startComp = form.data_inicio.slice(0, 7)
      const isRetroativa = startComp < currentComp

      if (!isRetroativa) {
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
    }

    // Nota: A combinação de conta de cartão de crédito com método Pix/Boleto é permitida
    // (fluxo de pagamento de fatura via Pix/Boleto). O aviso é apenas visual e não bloqueia o salvamento.

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

      const isFormData = Boolean(selectedAnexoConta || removerAnexoConta)
      let saved: DespesaCompromisso

      if (isFormData) {
        const fd = new FormData()
        fd.append('descricao', form.descricao.trim())
        if (form.fornecedor.trim()) fd.append('fornecedor', form.fornecedor.trim())
        if (form.categoria) fd.append('categoria', form.categoria)
        if (form.tag) fd.append('tag', form.tag)
        fd.append('secao', secaoDerivada)

        // Titular
        fd.append('titular_tipo', form.titular_tipo)
        if (form.titular_tipo === 'cpf' && form.titular_pessoa) {
          fd.append('titular_pessoa', form.titular_pessoa)
        }
        if (form.titular_tipo === 'cnpj' && form.titular_empresa) {
          fd.append('titular_empresa', form.titular_empresa)
        }

        // Contexto_tipo legado
        fd.append('contexto_tipo', form.titular_tipo === 'cnpj' ? 'empresa' : 'pessoal')
        if (form.titular_tipo === 'cnpj' && form.titular_empresa) {
          fd.append('empresa', form.titular_empresa)
        }
        const pessoaFinal =
          form.pessoa_responsavel || (form.titular_tipo === 'cpf' ? form.titular_pessoa : null)
        if (pessoaFinal) fd.append('pessoa', pessoaFinal)

        // Cobrança
        fd.append('regra_repeticao', isParcelado ? 'mensal' : form.regra_repeticao)
        fd.append('tipo_valor', form.tipo_valor)
        fd.append('modalidade_parcelamento', form.modalidade_parcelamento)
        fd.append('total_parcelas', String(totalParcelasNum))
        fd.append('parcela_inicial', String(parcelaInicialNum))
        if (isParcelado) {
          fd.append('valor_parcela', String(Number(form.valor_estimado)))
        }
        const diaVencNum =
          isSelectedContaCartao && selectedConta?.dia_vencimento
            ? Number(selectedConta.dia_vencimento)
            : form.regra_repeticao === 'avulso'
              ? parseInt(form.data_inicio.slice(8, 10), 10)
              : Number(form.dia_vencimento) || 10
        fd.append('dia_vencimento', String(diaVencNum))
        fd.append(
          'regra_vencimento_texto',
          form.regra_repeticao === 'avulso'
            ? 'Único'
            : isParcelado
              ? `${diaVencNum}/m (${totalParcelasNum}x)`
              : `${diaVencNum}/m`,
        )
        fd.append('data_inicio', `${form.data_inicio} 00:00:00.000Z`)
        if (dataFimIso) fd.append('data_fim_calculada', dataFimIso)
        fd.append('valor_estimado', String(Number(form.valor_estimado)))

        // Pagamento
        if (form.conta_padrao) fd.append('conta_padrao', form.conta_padrao)
        if (form.metodo_pagamento) fd.append('metodo_pagamento', form.metodo_pagamento)
        if (form.link_pagamento) fd.append('link_pagamento', form.link_pagamento)
        fd.append('dizimo', String(form.dizimo))
        if (form.dizimo && form.tipo_dizimo) fd.append('tipo_dizimo', form.tipo_dizimo)
        fd.append('dizimo_percentual', String(form.dizimo_percentual ?? 100))
        if (form.direcionamento?.trim()) fd.append('direcionamento', form.direcionamento.trim())
        fd.append('ativo', String(form.ativo))
        if (form.observacoes) fd.append('observacoes', form.observacoes)

        fd.append('precisa_revisao', String(form.precisa_revisao))
        if (form.motivo_revisao) fd.append('motivo_revisao', form.motivo_revisao)

        // Anexo da conta
        if (selectedAnexoConta) {
          fd.append('anexo_conta', selectedAnexoConta)
        } else if (removerAnexoConta) {
          fd.append('anexo_conta', '')
        }

        saved = await despesasService.saveCompromisso(
          fd,
          isDuplicating ? undefined : compromisso?.id,
        )
      } else {
        const diaVencNumPayload =
          isSelectedContaCartao && selectedConta?.dia_vencimento
            ? Number(selectedConta.dia_vencimento)
            : form.regra_repeticao === 'avulso'
              ? parseInt(form.data_inicio.slice(8, 10), 10)
              : Number(form.dia_vencimento) || 10

        const payload: Partial<DespesaCompromisso> = {
          descricao: form.descricao.trim(),
          fornecedor: form.fornecedor.trim() || (null as unknown as string),
          categoria: form.categoria || (null as unknown as string),
          tag: form.tag || (null as unknown as string),
          secao: secaoDerivada,

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
          // Se parcelado, regra_repeticao no banco deve ser 'mensal' (enum PB: 'mensal' | 'anual' | 'avulso')
          regra_repeticao: isParcelado ? 'mensal' : form.regra_repeticao,
          tipo_valor: form.tipo_valor,
          modalidade_parcelamento: form.modalidade_parcelamento,
          total_parcelas: totalParcelasNum,
          parcela_inicial: parcelaInicialNum,
          valor_parcela: isParcelado ? Number(form.valor_estimado) : (null as unknown as number),
          dia_vencimento: diaVencNumPayload,
          regra_vencimento_texto:
            form.regra_repeticao === 'avulso'
              ? 'Único'
              : isParcelado
                ? `${diaVencNumPayload}/m (${totalParcelasNum}x)`
                : `${diaVencNumPayload}/m`,
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
          dizimo_percentual: Number(form.dizimo_percentual ?? 100),
          direcionamento: form.direcionamento?.trim() || (null as unknown as string),
          ativo: form.ativo,
          observacoes: form.observacoes || (null as unknown as string),

          precisa_revisao: form.precisa_revisao,
          motivo_revisao: form.motivo_revisao || (null as unknown as string),
        }

        saved = await despesasService.saveCompromisso(
          payload,
          isDuplicating ? undefined : compromisso?.id,
        )
      }

      // Se for edição e o comprovante da ocorrência paga mudou, atualiza a ocorrência e sincroniza o lançamento
      if (!isDuplicating && compromisso && ocorrenciaPagaMaisRecente) {
        if (selectedComprovanteOcorrencia) {
          const fdOcorr = new FormData()
          fdOcorr.append('comprovante_pagamento', selectedComprovanteOcorrencia)
          const updatedOcorr = await despesasService.atualizarOcorrencia(
            ocorrenciaPagaMaisRecente.id,
            fdOcorr as any,
          )

          // Se houver lançamento financeiro vinculado à ocorrência, sincroniza o comprovante nele também
          if (ocorrenciaPagaMaisRecente.lancamento) {
            try {
              const fdLanc = new FormData()
              fdLanc.append('comprovante', selectedComprovanteOcorrencia)
              await financeService.saveLancamento(fdLanc, ocorrenciaPagaMaisRecente.lancamento)
            } catch (errLanc) {
              console.warn('Erro ao sincronizar comprovante no lançamento vinculado:', errLanc)
            }
          }
        } else if (removerComprovanteOcorrencia) {
          const fdOcorr = new FormData()
          fdOcorr.append('comprovante_pagamento', '')
          await despesasService.atualizarOcorrencia(ocorrenciaPagaMaisRecente.id, fdOcorr as any)

          // Sincroniza remoção no lançamento vinculado
          if (ocorrenciaPagaMaisRecente.lancamento) {
            try {
              const fdLanc = new FormData()
              fdLanc.append('comprovante', '')
              await financeService.saveLancamento(fdLanc, ocorrenciaPagaMaisRecente.lancamento)
            } catch (errLanc) {
              console.warn(
                'Erro ao sincronizar remoção do comprovante no lançamento vinculado:',
                errLanc,
              )
            }
          }
        }
      }

      // Se for novo compromisso ou duplicação, gera as primeiras ocorrências automaticamente.
      // Se for edição, sincroniza as ocorrências pendentes (status 'prevista') que não foram ajustadas manualmente.
      if (!compromisso || isDuplicating) {
        await despesasService.gerarOcorrenciasParaCompromisso(saved)
      } else {
        await despesasService.sincronizarOcorrenciasCompromisso(saved)
      }

      toast({
        title: isDuplicating
          ? 'Despesa duplicada com sucesso!'
          : compromisso
            ? 'Compromisso atualizado'
            : 'Compromisso cadastrado!',
        description: isDuplicating
          ? 'A nova despesa foi cadastrada e suas ocorrências previstas foram geradas.'
          : compromisso
            ? 'Compromisso atualizado e ocorrências pendentes sincronizadas com sucesso.'
            : 'Os dados da despesa e as ocorrências foram organizados com sucesso.',
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Erro ao salvar compromisso:', err)
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
              {isDuplicating
                ? 'Duplicar compromisso de despesa'
                : compromisso
                  ? 'Editar compromisso de despesa'
                  : 'Novo compromisso de despesa'}
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

              {/* Data da primeira cobrança / data da compra */}
              <div className="space-y-1.5">
                <Label className="font-semibold">
                  {isSelectedContaCartao
                    ? 'Data da compra *'
                    : form.regra_repeticao === 'avulso'
                      ? 'Data de vencimento *'
                      : '1ª cobrança / Início *'}
                </Label>
                <Input
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) => {
                    const newDate = e.target.value
                    let newDay = form.dia_vencimento
                    if (isSelectedContaCartao && selectedConta?.dia_vencimento) {
                      newDay = Number(selectedConta.dia_vencimento)
                    } else if (newDate && !isSelectedContaCartao) {
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
                {isSelectedContaCartao && (
                  <p className="text-[11px] text-muted-foreground">
                    Data em que a compra no cartão foi/será realizada.
                  </p>
                )}
              </div>

              {/* Dia de vencimento (ou exibição de vencimento atrelado ao cartão) */}
              {isSelectedContaCartao ? (
                <div className="space-y-1.5">
                  <Label className="font-semibold text-muted-foreground">Data de vencimento</Label>
                  <Input
                    type="text"
                    disabled
                    value={
                      dataVencimentoCicloCartaoFormatada
                        ? `Vencimento: ${dataVencimentoCicloCartaoFormatada}`
                        : selectedConta?.dia_vencimento
                          ? `Todo dia ${selectedConta.dia_vencimento}`
                          : 'Vinculado ao cartão'
                    }
                    className="bg-secondary/40 font-medium text-xs cursor-not-allowed text-foreground"
                  />
                  <p className="text-[11px] font-medium text-primary">
                    Vencimento definido pelo ciclo do cartão
                    {dataVencimentoCicloCartaoFormatada
                      ? `: ${dataVencimentoCicloCartaoFormatada}`
                      : ''}
                  </p>
                </div>
              ) : (
                form.regra_repeticao !== 'avulso' && (
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
                )
              )}
            </div>

            {/* Badge dinâmica do ciclo do cartão e aviso em tempo real */}
            {isSelectedContaCartao && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {faturaCicloCartao ? (
                    <Badge
                      variant="outline"
                      className="border-primary/40 bg-primary/10 text-primary font-bold text-xs px-2.5 py-1"
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
                      Ciclo do Cartão de Crédito
                    </Badge>
                  )}
                  {selectedConta && (
                    <span className="text-xs text-muted-foreground">
                      Cartão: <strong>{selectedConta.nome}</strong> (fecha dia{' '}
                      {selectedConta.dia_fechamento || 10}, vence dia{' '}
                      {selectedConta.dia_vencimento || 20})
                    </span>
                  )}
                </div>
                {avisoFaturaCartao && (
                  <p className="text-xs font-semibold text-primary">{avisoFaturaCartao}</p>
                )}
              </div>
            )}

            {/* Alerta de incompatibilidade entre data da 1ª cobrança e dia de vencimento (somente não-cartão) */}
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
                    if (c && (c.tipo === 'cartao' || contaAceitaCredito(c))) {
                      if (c.dia_vencimento) {
                        updated.dia_vencimento = c.dia_vencimento
                      }
                      const matched = metodosPagamento.find(
                        (m) =>
                          m.conta_padrao === c.id ||
                          (isMetodoCredito(m) &&
                            m.nome.toLowerCase().includes(c.nome.toLowerCase())),
                      )
                      if (matched && !updated.metodo_pagamento) {
                        updated.metodo_pagamento = matched.id
                      }
                    }
                    setForm(updated)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione conta de onde o dinheiro sairá" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {contasOptions.map((c) => (
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
                {form.conta_padrao && (
                  <ContaContextoWarning
                    contaId={form.conta_padrao}
                    contas={contas}
                    className="mt-1"
                  />
                )}
                <p className="text-[11px] text-muted-foreground">
                  A conta não deduz nem substitui o titular da obrigação.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold">Método de pagamento</Label>
                <Select
                  value={form.metodo_pagamento || 'none'}
                  onValueChange={(v) => {
                    const metodoId = v === 'none' ? '' : v
                    const isCred = isMetodoCredito(metodoId, metodosPagamento)
                    let updated = { ...form, metodo_pagamento: metodoId }
                    if (isCred && selectedConta && (selectedConta.tipo === 'cartao' || temCredito)) {
                      if (selectedConta.dia_vencimento) {
                        updated.dia_vencimento = selectedConta.dia_vencimento
                      }
                    }
                    setForm(updated)
                  }}
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
                <p className="text-[11px] text-muted-foreground">
                  Mantido separado da conta bancária/cartão.
                </p>
                {avisoCartaoMetodoNaoCartao && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-500/10 p-2.5 text-xs text-amber-900">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <p className="leading-relaxed">{avisoCartaoMetodoNaoCartao}</p>
                  </div>
                )}
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

              {/* Anexos: Conta a pagar e Comprovante de pagamento */}
              <div className="sm:col-span-2 pt-2 border-t border-border space-y-4">
                <div className="rounded-xl border border-border/80 bg-stone-50/50 p-3.5 space-y-3">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <span className="text-xs font-bold text-foreground">
                      Anexos do compromisso e pagamento
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Conta a pagar e comprovante de quitação
                    </span>
                  </div>

                  {/* 1. Conta a pagar (despesas_compromisso.anexo_conta) */}
                  <div className="space-y-1">
                    <AnexoUploadField
                      label="Conta a pagar (Boleto, fatura ou foto da conta)"
                      helperText="Envie um .PDF ou uma imagem da galeria ou da câmera do seu dispositivo (até 15MB)."
                      selectedFile={selectedAnexoConta}
                      onFileSelect={(file) => {
                        setSelectedAnexoConta(file)
                        if (file) setRemoverAnexoConta(false)
                      }}
                      currentFileName={isDuplicating ? undefined : compromisso?.anexo_conta}
                      collectionNameOrId={isDuplicating ? undefined : 'despesas_compromisso'}
                      recordId={isDuplicating ? undefined : compromisso?.id}
                      isRemovingCurrent={removerAnexoConta}
                      onRemoveCurrent={() => {
                        setRemoverAnexoConta(true)
                        setSelectedAnexoConta(null)
                      }}
                      disabled={submitting}
                    />
                    {isDuplicating && compromisso?.anexo_conta && (
                      <p className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-300/40 rounded-lg p-2 mt-1">
                        A despesa original possui um anexo ({compromisso.anexo_conta}). Por
                        segurança, selecione o novo boleto/documento acima para esta cópia.
                      </p>
                    )}
                  </div>

                  {/* 2. Comprovante de pagamento (despesas_ocorrencias.comprovante_pagamento) */}
                  {!isDuplicating && compromisso && (
                    <div className="pt-2 border-t border-border/60 space-y-1.5">
                      {loadingOcorrenciasPagas ? (
                        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                          <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                          <span>Carregando comprovantes de pagamento...</span>
                        </div>
                      ) : ocorrenciaPagaMaisRecente ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground">
                              Comprovante de pagamento vinculado{' '}
                              {ocorrenciaPagaMaisRecente.data_pagamento && (
                                <span className="text-muted-foreground font-normal">
                                  (Pago em {formatDate(ocorrenciaPagaMaisRecente.data_pagamento)})
                                </span>
                              )}
                            </span>
                            {ocorrenciasPagas.length > 1 && (
                              <span className="text-[10px] rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">
                                {ocorrenciasPagas.length} pagamentos realizados
                              </span>
                            )}
                          </div>

                          <AnexoUploadField
                            label="Comprovante de pagamento"
                            helperText="Comprovante da quitação bancária ou Pix (PDF ou imagem, até 15MB)."
                            selectedFile={selectedComprovanteOcorrencia}
                            onFileSelect={(file) => {
                              setSelectedComprovanteOcorrencia(file)
                              if (file) setRemoverComprovanteOcorrencia(false)
                            }}
                            currentFileName={ocorrenciaPagaMaisRecente.comprovante_pagamento}
                            collectionNameOrId="despesas_ocorrencias"
                            recordId={ocorrenciaPagaMaisRecente.id}
                            isRemovingCurrent={removerComprovanteOcorrencia}
                            onRemoveCurrent={() => {
                              setRemoverComprovanteOcorrencia(true)
                              setSelectedComprovanteOcorrencia(null)
                            }}
                            disabled={submitting}
                          />
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border/80 bg-secondary/20 p-3 text-xs text-muted-foreground flex items-center justify-between">
                          <span>
                            <strong>Comprovante de pagamento:</strong> Nenhuma ocorrência paga
                            registrada ainda para este compromisso. O comprovante poderá ser anexado
                            ao dar baixa ou registrar o pagamento.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                  <Label className="font-bold text-foreground">Dízimo sobre esta despesa</Label>
                  <p className="text-xs text-muted-foreground">
                    Define se esta despesa entra no cálculo do dízimo e em qual proporção
                  </p>
                </div>
                <Switch
                  checked={form.dizimo}
                  onCheckedChange={(v) => {
                    setForm({
                      ...form,
                      dizimo: v,
                      dizimo_percentual: v
                        ? form.dizimo_percentual === 0
                          ? 100
                          : form.dizimo_percentual
                        : 0,
                    })
                  }}
                />
              </div>

              {/* Percentual de dízimo com botões de toque rápido */}
              <div className="space-y-2 pt-1 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">
                    Percentual base de dízimo:{' '}
                    <span className="text-primary font-bold">{form.dizimo_percentual ?? 100}%</span>
                  </Label>
                  {form.dizimo_percentual === 0 ? (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Não incide dízimo (0%)
                    </Badge>
                  ) : form.dizimo_percentual === 100 ? (
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                      Integral (100%)
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-amber-500/10 text-amber-700"
                    >
                      Parcial ({form.dizimo_percentual}%)
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[100, 75, 50, 25, 0].map((pct) => {
                    const isSelected = form.dizimo_percentual === pct
                    return (
                      <Button
                        key={pct}
                        type="button"
                        size="sm"
                        variant={isSelected ? 'default' : 'outline'}
                        className={`h-7 px-2.5 text-xs font-semibold rounded-md ${
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'bg-background hover:bg-secondary/60'
                        }`}
                        onClick={() => {
                          setForm({
                            ...form,
                            dizimo_percentual: pct,
                            dizimo: pct > 0,
                          })
                        }}
                      >
                        {pct}%
                      </Button>
                    )
                  })}
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-xs text-muted-foreground">Custom:</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.dizimo_percentual ?? 100}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                        setForm({
                          ...form,
                          dizimo_percentual: val,
                          dizimo: val > 0,
                        })
                      }}
                      className="h-7 w-16 text-xs text-right font-semibold"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {form.dizimo_percentual === 0
                    ? 'Com 0%, as parcelas e ocorrências geradas não entrarão na base do dízimo.'
                    : `Cada parcela paga contribuirá com ${form.dizimo_percentual}% do seu valor na base do dízimo do mês em que for paga.`}
                </p>
              </div>

              {form.dizimo && (
                <div className="space-y-3 pt-2 border-t border-border/60">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Classificação do Dízimo / Oferta ministerial</Label>
                    <Select
                      value={form.tipo_dizimo || 'none'}
                      onValueChange={(v) =>
                        setForm({ ...form, tipo_dizimo: v === 'none' ? '' : v })
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
                  <div className="space-y-1.5">
                    <Label className="text-xs">Direcionamento (opcional)</Label>
                    <Input
                      value={form.direcionamento || ''}
                      onChange={(e) => setForm({ ...form, direcionamento: e.target.value })}
                      placeholder="Ex.: Igreja sede, Ministério de louvor, Bateria, Missões..."
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Indica para onde ou para quem a oferta/dízimo é direcionada.
                    </p>
                  </div>
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
              {isDuplicating ? 'Cadastrar cópia' : 'Salvar compromisso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
