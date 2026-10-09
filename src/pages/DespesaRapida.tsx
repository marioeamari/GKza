import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  History,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Tag,
  Trash2,
  User,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useAppContext } from '@/contexts/AppContext'
import { estabelecimentosService } from '@/services/estabelecimentos'
import { despesasService } from '@/services/despesas'
import { financeService } from '@/services/finance'
import { formatCurrency, formatDate } from '@/lib/format'
import { apiMessage } from '@/lib/api-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type {
  Conta,
  Estabelecimento,
  MetodoPagamento,
  TelegramRegistroPendente,
} from '@/types/domain'

const LAST_CONTEXT_KEY = 'gkza_despesa_rapida_last_context_id'
const RECENT_SUPPLIERS_KEY = 'gkza_despesa_rapida_recent_suppliers'
const FAVORITE_SUPPLIERS_KEY = 'gkza_despesa_rapida_favorite_suppliers'

interface EstabelecimentoHistoricoSugerido {
  contaId?: string
  metodoId?: string
  totalUsos: number
}

import { useNavigate, useSearchParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'

export default function DespesaRapida() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { grupos, activeContext, setContextGroup, setContextAll } = useAppContext()

  // Dados auxiliares carregados do sistema
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [fornecedores, setFornecedores] = useState<Estabelecimento[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [metodosPagamento, setMetodosPagamento] = useState<MetodoPagamento[]>([])
  const [descricoesSugeridas, setDescricoesSugeridas] = useState<string[]>([])

  // Modo de edição
  const [editingPendenteId, setEditingPendenteId] = useState<string | null>(null)

  // Formulário
  const [contextoId, setContextoId] = useState<string>('all')
  const [descricao, setDescricao] = useState('')
  const [valorStr, setValorStr] = useState('')
  const [fornecedorNome, setFornecedorNome] = useState('')
  const [selectedFornecedorId, setSelectedFornecedorId] = useState<string | null>(null)
  const [contaId, setContaId] = useState<string>('')
  const [metodoId, setMetodoId] = useState<string>('')
  const [dataHora, setDataHora] = useState(() => {
    const now = new Date()
    const tzOffset = now.getTimezoneOffset() * 60000
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16)
  })
  const [anexoFile, setAnexoFile] = useState<File | null>(null)
  const [anexoPreview, setAnexoPreview] = useState<string | null>(null)

  // Histórico e sugestões derivadas
  const [historicoFornecedores, setHistoricoFornecedores] = useState<
    Record<string, EstabelecimentoHistoricoSugerido>
  >({})
  const [sugestaoAtiva, setSugestaoAtiva] = useState<EstabelecimentoHistoricoSugerido | null>(null)

  // Busca e modal de estabelecimentos
  const [fornecedorSearchOpen, setFornecedorSearchOpen] = useState(false)
  const [fornecedorQuery, setFornecedorQuery] = useState('')
  const [novoFornecedorDialogOpen, setNovoFornecedorDialogOpen] = useState(false)
  const [novoFornecedorNome, setNovoFornecedorNome] = useState('')
  const [salvandoNovoFornecedor, setSalvandoNovoFornecedor] = useState(false)

  // Fornecedores Recentes e Favoritos (localStorage)
  const [recentSupplierNames, setRecentSupplierNames] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_SUPPLIERS_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [favoriteSupplierNames, setFavoriteSupplierNames] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITE_SUPPLIERS_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Envio e Estado
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null)

  // Últimos lançamentos do usuário
  const [ultimosLancamentos, setUltimosLancamentos] = useState<TelegramRegistroPendente[]>([])
  const [loadingUltimos, setLoadingUltimos] = useState(false)
  const [ultimosAberto, setUltimosAberto] = useState(true)

  // 1. Carregamento inicial de cadastros do ERP
  const loadInitialData = async () => {
    setLoadingInitial(true)
    try {
      const [allContas, allMetodos, allFornecedores, recentCompromissos, recentPendentes] =
        await Promise.all([
          financeService.listContas().catch(() => [] as Conta[]),
          despesasService.listMetodosPagamento().catch(() => [] as MetodoPagamento[]),
          estabelecimentosService.listEstabelecimentos().catch(() => [] as Estabelecimento[]),
          pb
            .collection('despesas_compromisso')
            .getList(1, 100, {
              sort: '-created',
              fields: 'id,descricao,fornecedor,conta_padrao,metodo_pagamento,created',
            })
            .catch(() => ({ items: [] })),
          pb
            .collection<TelegramRegistroPendente>('telegram_registros_pendentes')
            .getList(1, 100, {
              sort: '-created',
              fields:
                'id,descricao,conta,created,origem_tipo,comprovante_texto,fornecedor,fornecedor_nome,metodo_pagamento,observacoes,expand',
            })
            .catch(() => ({ items: [] })),
        ])

      setContas(allContas)
      setMetodosPagamento(allMetodos)
      setFornecedores(allFornecedores)

      // Descrições sugeridas (mais comuns nos últimos compromissos e pendentes)
      const descCount: Record<string, number> = {}
      for (const item of recentCompromissos.items as any[]) {
        if (item.descricao?.trim()) {
          const d = item.descricao.trim()
          descCount[d] = (descCount[d] || 0) + 1
        }
      }
      for (const item of recentPendentes.items as any[]) {
        if (item.descricao?.trim()) {
          const d = item.descricao.trim()
          descCount[d] = (descCount[d] || 0) + 1
        }
      }
      const sortedDescs = Object.entries(descCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([d]) => d)
      setDescricoesSugeridas(sortedDescs)

      // Agregação de inteligência por fornecedor: conta e método mais usados
      const mapHist: Record<
        string,
        { contas: Record<string, number>; metodos: Record<string, number>; total: number }
      > = {}
      for (const item of recentCompromissos.items as any[]) {
        const forn = item.fornecedor?.trim().toLowerCase()
        if (forn) {
          if (!mapHist[forn]) {
            mapHist[forn] = { contas: {}, metodos: {}, total: 0 }
          }
          mapHist[forn].total++
          if (item.conta_padrao) {
            mapHist[forn].contas[item.conta_padrao] =
              (mapHist[forn].contas[item.conta_padrao] || 0) + 1
          }
          if (item.metodo_pagamento) {
            mapHist[forn].metodos[item.metodo_pagamento] =
              (mapHist[forn].metodos[item.metodo_pagamento] || 0) + 1
          }
        }
      }

      const historicoFinal: Record<string, EstabelecimentoHistoricoSugerido> = {}
      for (const [forn, data] of Object.entries(mapHist)) {
        const topConta = Object.entries(data.contas).sort((a, b) => b[1] - a[1])[0]?.[0]
        const topMetodo = Object.entries(data.metodos).sort((a, b) => b[1] - a[1])[0]?.[0]
        historicoFinal[forn] = {
          contaId: topConta,
          metodoId: topMetodo,
          totalUsos: data.total,
        }
      }
      setHistoricoFornecedores(historicoFinal)
    } catch (err) {
      console.warn('Erro ao carregar dados iniciais da Despesa Rápida:', err)
    } finally {
      setLoadingInitial(false)
    }
  }

  // 2. Carrega os últimos registros criados via PWA pelo usuário
  const loadUltimosLancamentos = async () => {
    setLoadingUltimos(true)
    try {
      // Filtra por origem_tipo = 'pwa'
      const res = await pb
        .collection<TelegramRegistroPendente>('telegram_registros_pendentes')
        .getList(1, 5, {
          sort: '-created',
          filter: `origem_tipo = 'pwa'`,
          expand: 'conta,fornecedor,metodo_pagamento',
        })
      setUltimosLancamentos(res.items)
    } catch (err) {
      console.warn('Erro ao carregar últimos lançamentos PWA:', err)
    } finally {
      setLoadingUltimos(false)
    }
  }

  useEffect(() => {
    loadInitialData()
    loadUltimosLancamentos()
  }, [])

  // Carregar despesa pendente para edição se fornecido na URL (?editar=ID)
  useEffect(() => {
    const editIdParam = searchParams.get('editar')
    if (editIdParam) {
      pb.collection<TelegramRegistroPendente>('telegram_registros_pendentes')
        .getOne(editIdParam, { expand: 'conta,fornecedor,metodo_pagamento' })
        .then((item) => {
          if (item) {
            if (item.status !== 'pendente') {
              setErrorMessage(
                'Este lançamento já foi triado ou descartado e não pode mais ser editado na triagem.',
              )
              return
            }
            setEditingPendenteId(item.id)
            setDescricao(item.descricao || '')
            setValorStr(
              (item.valor || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
            )
            if (item.fornecedor) {
              setSelectedFornecedorId(item.fornecedor)
              setFornecedorNome(
                item.expand?.fornecedor?.nome_fantasia ||
                  item.expand?.fornecedor?.razao_social ||
                  item.fornecedor_nome ||
                  '',
              )
            } else if (item.fornecedor_nome) {
              setSelectedFornecedorId(null)
              setFornecedorNome(item.fornecedor_nome)
            }
            if (item.conta) setContaId(item.conta)
            if (item.metodo_pagamento) setMetodoId(item.metodo_pagamento)
            if (item.data) {
              const d = new Date(item.data)
              const tzOffset = d.getTimezoneOffset() * 60000
              setDataHora(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16))
            }
            setSuccessMessage(null)
            setErrorMessage(null)
            setRedirectCountdown(null)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
        })
        .catch((err) => {
          console.warn('Erro ao carregar despesa para edição:', err)
        })
    }
  }, [searchParams])

  // Recupera último contexto usado (localStorage ou contexto global ativo)
  useEffect(() => {
    try {
      const savedContextId = localStorage.getItem(LAST_CONTEXT_KEY)
      if (
        savedContextId &&
        (savedContextId === 'all' || grupos.some((g) => g.id === savedContextId))
      ) {
        setContextoId(savedContextId)
        return
      }
    } catch {
      /* ignore */
    }

    if (activeContext.groupId) {
      setContextoId(activeContext.groupId)
    } else {
      setContextoId('all')
    }
  }, [grupos, activeContext.groupId])

  // Troca de contexto
  const handleSelectContexto = (id: string) => {
    setContextoId(id)
    try {
      localStorage.setItem(LAST_CONTEXT_KEY, id)
    } catch {
      /* ignore */
    }
    if (id === 'all') {
      setContextAll()
    } else {
      setContextGroup(id)
    }
  }

  // Objeto do contexto selecionado
  const currentGrupo = grupos.find((g) => g.id === contextoId)
  const contextoLabel = currentGrupo ? currentGrupo.nome : 'Todos os cadastros (Geral)'
  const contextoCor = currentGrupo?.cor || '#DF5830'

  // Contas filtradas pelo contexto ativo e ordenadas por relevância
  const contasDoContexto = contas.filter((c) => {
    if (!c.ativa) return false
    if (contextoId === 'all' || !currentGrupo) return true
    // Se a conta pertence aos IDs do grupo selecionado
    const contaIdsGrupo = currentGrupo.contas.map((gc) => gc.id)
    if (contaIdsGrupo.length === 0) return true
    return contaIdsGrupo.includes(c.id)
  })

  // Ordenação das contas: mais utilizadas / ordem configurada
  const contasOrdenadas = [...contasDoContexto].sort((a, b) => {
    const ordA = a.ordem ?? 999
    const ordB = b.ordem ?? 999
    if (ordA !== ordB) return ordA - ordB
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })

  // Seleciona primeira conta válida se a atual não estiver na lista ou vazia
  useEffect(() => {
    if (contasOrdenadas.length > 0) {
      if (!contaId || !contasOrdenadas.some((c) => c.id === contaId)) {
        setContaId(contasOrdenadas[0].id)
      }
    }
  }, [contasOrdenadas, contaId])

  // Conta selecionada atualmente
  const selectedConta = contas.find((c) => c.id === contaId)

  // Métodos de pagamento compatíveis com a conta selecionada
  // Regra: "A conta selecionada filtra os métodos compatíveis" + sempre incluir "Dinheiro"
  const metodosCompativeis = metodosPagamento.filter((m) => {
    if (!m.ativo) return false
    const mTipo = (m.tipo || '').toLowerCase()
    const mNome = (m.nome || '').toLowerCase()
    const mCodigo = (m.codigo || '').toLowerCase()

    // Regra do usuário: "INCLUIR 'Dinheiro' como opção nesta tela"
    if (
      mTipo === 'dinheiro' ||
      mNome.includes('dinheiro') ||
      mCodigo.includes('dinheiro') ||
      mCodigo.includes('dinherio')
    ) {
      return true
    }

    if (!selectedConta) return true

    // Se a conta for do tipo "caixa" (dinheiro em espécie), prioriza dinheiro
    if (selectedConta.tipo === 'caixa') {
      return (
        mTipo === 'dinheiro' ||
        mNome.includes('dinheiro') ||
        mCodigo.includes('dinheiro') ||
        mCodigo.includes('dinherio')
      )
    }

    // Se a conta for Cartão puro
    if (selectedConta.tipo === 'cartao') {
      // Geralmente Cartão suporta Crédito (e às vezes débito se for múltiplo)
      const aceitaCredito = (selectedConta.tipos_pagamento || []).includes('credito')
      const aceitaDebito = (selectedConta.tipos_pagamento || []).includes('debito')
      if (
        aceitaCredito &&
        (mTipo === 'cartao' || mNome.includes('crédito') || mNome.includes('credito'))
      ) {
        return true
      }
      if (aceitaDebito && (mNome.includes('débito') || mNome.includes('debito'))) {
        return true
      }
      // Se não tiver tipos explícitos cadastrados na conta, permite cartao/credito
      return mTipo === 'cartao' || mNome.includes('crédito') || mNome.includes('credito')
    }

    // Se for conta bancária: Pix, Débito, Boleto, Transferência
    if (selectedConta.tipo === 'bancaria') {
      const tipos = selectedConta.tipos_pagamento || ['pix', 'debito', 'transferencia', 'boletos']
      if (tipos.includes('pix') && (mTipo === 'pix' || mNome.includes('pix'))) return true
      if (tipos.includes('debito') && (mNome.includes('débito') || mNome.includes('debito')))
        return true
      if (
        tipos.includes('transferencia') &&
        (mTipo === 'transferencia' ||
          mNome.includes('transferência') ||
          mNome.includes('transferencia'))
      )
        return true
      if (tipos.includes('boletos') && (mTipo === 'boleto' || mNome.includes('boleto'))) return true
      // Se a conta tiver crédito liberado (ex: cartão corporativo integrado na conta corrente)
      if (tipos.includes('credito') && (mNome.includes('crédito') || mNome.includes('credito')))
        return true
      return mTipo !== 'cartao' || mNome.includes('débito') || mNome.includes('debito')
    }

    return true
  })

  // Se o método atual não for compatível com a conta recém-selecionada, escolhe o melhor padrão
  useEffect(() => {
    if (metodosCompativeis.length > 0) {
      if (!metodoId || !metodosCompativeis.some((m) => m.id === metodoId)) {
        // Se for conta cartão, prefere 'Crédito'; se for bancária, prefere 'Pix'
        if (selectedConta?.tipo === 'cartao') {
          const cred = metodosCompativeis.find(
            (m) =>
              m.nome.toLowerCase().includes('crédito') || m.nome.toLowerCase().includes('credito'),
          )
          setMetodoId(cred ? cred.id : metodosCompativeis[0].id)
        } else {
          const pix = metodosCompativeis.find((m) => m.nome.toLowerCase().includes('pix'))
          setMetodoId(pix ? pix.id : metodosCompativeis[0].id)
        }
      }
    }
  }, [metodosCompativeis, selectedConta, metodoId])

  // 3. Inteligência por histórico do fornecedor:
  // Ao selecionar um fornecedor, sugerir (não sobrescrever silenciosamente) última conta e método usados
  const handleSelectFornecedor = (nome: string, id?: string) => {
    const nomeLimpo = nome.trim()
    setFornecedorNome(nomeLimpo)
    setSelectedFornecedorId(id || null)
    setFornecedorSearchOpen(false)

    // Atualiza lista de recentes no localStorage
    if (nomeLimpo) {
      const updated = [
        nomeLimpo,
        ...recentSupplierNames.filter((n) => n.toLowerCase() !== nomeLimpo.toLowerCase()),
      ].slice(0, 10)
      setRecentSupplierNames(updated)
      try {
        localStorage.setItem(RECENT_SUPPLIERS_KEY, JSON.stringify(updated))
      } catch {
        /* ignore */
      }
    }

    // Busca sugestão no histórico agregado
    const hist = historicoFornecedores[nomeLimpo.toLowerCase()]
    if (hist && (hist.contaId || hist.metodoId)) {
      setSugestaoAtiva(hist)
    } else {
      setSugestaoAtiva(null)
    }
  }

  // Aplicar sugestão do histórico
  const handleAplicarSugestao = () => {
    if (!sugestaoAtiva) return
    if (sugestaoAtiva.contaId && contas.some((c) => c.id === sugestaoAtiva.contaId)) {
      setContaId(sugestaoAtiva.contaId)
    }
    if (sugestaoAtiva.metodoId && metodosPagamento.some((m) => m.id === sugestaoAtiva.metodoId)) {
      setMetodoId(sugestaoAtiva.metodoId)
    }
    setSugestaoAtiva(null)
  }

  // Favoritar / Desfavoritar Fornecedor
  const toggleFavoriteSupplier = (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const nameLower = name.trim().toLowerCase()
    let updated: string[] = []
    if (favoriteSupplierNames.some((n) => n.toLowerCase() === nameLower)) {
      updated = favoriteSupplierNames.filter((n) => n.toLowerCase() !== nameLower)
    } else {
      updated = [name.trim(), ...favoriteSupplierNames]
    }
    setFavoriteSupplierNames(updated)
    try {
      localStorage.setItem(FAVORITE_SUPPLIERS_KEY, JSON.stringify(updated))
    } catch {
      /* ignore */
    }
  }

  // Criar estabelecimento rapidamente
  const handleCriarNovoFornecedorRapido = async () => {
    const nome = novoFornecedorNome.trim()
    if (!nome) return
    setSalvandoNovoFornecedor(true)
    try {
      const criado = await estabelecimentosService.saveEstabelecimento({
        nome,
        ativa: true,
      })
      setFornecedores((prev) => [criado, ...prev])
      handleSelectFornecedor(criado.nome, criado.id)
      setNovoFornecedorNome('')
      setNovoFornecedorDialogOpen(false)
    } catch (err) {
      setErrorMessage(apiMessage(err, 'Erro ao criar estabelecimento.'))
    } finally {
      setSalvandoNovoFornecedor(false)
    }
  }

  // Manipulação de imagem do anexo (câmera ou arquivo)
  const handleAnexoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAnexoFile(file)
      const reader = new FileReader()
      reader.onload = () => {
        setAnexoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoverAnexo = () => {
    setAnexoFile(null)
    setAnexoPreview(null)
  }

  // Formatação de valor monetário
  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/\D/g, '')
    if (!v) {
      setValorStr('')
      return
    }
    const num = parseInt(v, 10) / 100
    setValorStr(
      num.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    )
  }

  // Parsing do valor float
  const valorNumerico = parseFloat(valorStr.replace(/\./g, '').replace(',', '.')) || 0

  // Iniciar edição de uma despesa rápida pendente
  const handleEditarDespesa = (item: TelegramRegistroPendente) => {
    if (item.status !== 'pendente') {
      setErrorMessage(
        'Este lançamento já foi triado ou descartado e não pode ser editado na triagem.',
      )
      return
    }
    setEditingPendenteId(item.id)
    setDescricao(item.descricao || '')
    setValorStr(
      (item.valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    )
    if (item.fornecedor) {
      setSelectedFornecedorId(item.fornecedor)
      setFornecedorNome(
        item.expand?.fornecedor?.nome_fantasia ||
          item.expand?.fornecedor?.razao_social ||
          item.fornecedor_nome ||
          '',
      )
    } else if (item.fornecedor_nome) {
      setSelectedFornecedorId(null)
      setFornecedorNome(item.fornecedor_nome)
    } else {
      const fornecedorMatch = item.observacoes?.match(/Fornecedor:\s*([^|]+)/)
      if (fornecedorMatch && fornecedorMatch[1]) {
        setFornecedorNome(fornecedorMatch[1].trim())
        setSelectedFornecedorId(null)
      } else {
        setFornecedorNome('')
        setSelectedFornecedorId(null)
      }
    }

    if (item.conta) setContaId(item.conta)
    if (item.metodo_pagamento) setMetodoId(item.metodo_pagamento)
    if (item.data) {
      const d = new Date(item.data)
      const tzOffset = d.getTimezoneOffset() * 60000
      setDataHora(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16))
    }

    setAnexoFile(null)
    setAnexoPreview(null)
    setSuccessMessage(null)
    setErrorMessage(null)
    setRedirectCountdown(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Cancelar edição
  const handleCancelarEdicao = () => {
    setEditingPendenteId(null)
    setSearchParams({})
    handleNovaDespesa()
  }

  // Reset do formulário para nova despesa
  const handleNovaDespesa = () => {
    setEditingPendenteId(null)
    setDescricao('')
    setValorStr('')
    setFornecedorNome('')
    setSelectedFornecedorId(null)
    setSugestaoAtiva(null)
    setAnexoFile(null)
    setAnexoPreview(null)
    setSuccessMessage(null)
    setErrorMessage(null)
    setRedirectCountdown(null)
    const now = new Date()
    const tzOffset = now.getTimezoneOffset() * 60000
    setDataHora(new Date(now.getTime() - tzOffset).toISOString().slice(0, 16))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Contagem regressiva e retorno automático ao Hub após sucesso
  useEffect(() => {
    if (redirectCountdown === null) return
    if (redirectCountdown <= 0) {
      navigate('/m', {
        replace: true,
        state: { flash: successMessage || 'Despesa salva com sucesso!' },
      })
      return
    }
    const timer = setTimeout(() => {
      setRedirectCountdown((prev) => (prev !== null ? prev - 1 : null))
    }, 1000)
    return () => clearTimeout(timer)
  }, [redirectCountdown, navigate, successMessage])

  // Submissão do formulário: validação e criação ou atualização no telegram_registros_pendentes
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    // Validações obrigatórias
    if (!descricao.trim()) {
      setErrorMessage('Por favor, informe a descrição da despesa.')
      return
    }
    if (valorNumerico <= 0) {
      setErrorMessage('Informe um valor válido maior que zero.')
      return
    }

    setSubmitting(true)
    try {
      const dataIso = dataHora ? new Date(dataHora).toISOString() : new Date().toISOString()

      // Determina contexto de pessoa/empresa do grupo ativo se houver
      let pessoaRef = ''
      let empresaRef = ''
      if (currentGrupo) {
        if (currentGrupo.empresas.length > 0) {
          empresaRef = currentGrupo.empresas[0].id
        } else if (currentGrupo.pessoas.length > 0) {
          pessoaRef = currentGrupo.pessoas[0].id
        }
      }

      // Detalhes complementares para observações/comprovante_texto
      const metodoObj = metodosPagamento.find((m) => m.id === metodoId)
      const obsParts: string[] = ['Origem: PWA (Despesa Rápida)']
      if (fornecedorNome.trim()) obsParts.push(`Fornecedor: ${fornecedorNome.trim()}`)
      if (metodoObj) obsParts.push(`Método: ${metodoObj.nome}`)
      if (user?.name) obsParts.push(`Usuário: ${user.name}`)

      const comprovanteTexto = [
        descricao.trim(),
        fornecedorNome.trim() ? `| Fornecedor: ${fornecedorNome.trim()}` : '',
        metodoObj ? `| Pagamento previsto: ${metodoObj.nome}` : '',
      ]
        .filter(Boolean)
        .join(' ')

      if (editingPendenteId) {
        // MODO EDIÇÃO: Atualiza registro pendente existente
        if (anexoFile) {
          const fd = new FormData()
          fd.append('descricao', descricao.trim())
          fd.append('valor', String(valorNumerico))
          fd.append('data', dataIso)
          if (contaId) fd.append('conta', contaId)
          if (empresaRef) fd.append('empresa', empresaRef)
          if (pessoaRef) fd.append('pessoa', pessoaRef)
          if (contextoLabel) fd.append('contexto_nome', contextoLabel)
          if (selectedFornecedorId) {
            fd.append('fornecedor', selectedFornecedorId)
          }
          if (fornecedorNome.trim()) {
            fd.append('fornecedor_nome', fornecedorNome.trim())
          }
          if (metodoId) {
            fd.append('metodo_pagamento', metodoId)
          }
          fd.append('observacoes', obsParts.join(' | '))
          fd.append('comprovante_texto', comprovanteTexto)
          fd.append('comprovante_foto', anexoFile)

          await pb.collection('telegram_registros_pendentes').update(editingPendenteId, fd)
        } else {
          await pb.collection('telegram_registros_pendentes').update(editingPendenteId, {
            descricao: descricao.trim(),
            valor: valorNumerico,
            data: dataIso,
            conta: contaId || null,
            empresa: empresaRef || null,
            pessoa: pessoaRef || null,
            contexto_nome: contextoLabel,
            fornecedor: selectedFornecedorId || null,
            fornecedor_nome: fornecedorNome.trim() || null,
            metodo_pagamento: metodoId || null,
            observacoes: obsParts.join(' | '),
            comprovante_texto: comprovanteTexto,
          })
        }

        const msg = 'Despesa pendente atualizada com sucesso!'
        setSuccessMessage(msg)
        setEditingPendenteId(null)
        setSearchParams({})
        loadUltimosLancamentos()
        setRedirectCountdown(2)
      } else {
        // MODO CRIAÇÃO: Cria novo registro pendente
        if (anexoFile) {
          const fd = new FormData()
          fd.append('descricao', descricao.trim())
          fd.append('valor', String(valorNumerico))
          fd.append('tipo', 'despesa')
          fd.append('data', dataIso)
          fd.append('status', 'pendente')
          fd.append('origem_tipo', 'pwa')
          if (contaId) fd.append('conta', contaId)
          if (empresaRef) fd.append('empresa', empresaRef)
          if (pessoaRef) fd.append('pessoa', pessoaRef)
          if (contextoLabel) fd.append('contexto_nome', contextoLabel)
          if (selectedFornecedorId) {
            fd.append('fornecedor', selectedFornecedorId)
          }
          if (fornecedorNome.trim()) {
            fd.append('fornecedor_nome', fornecedorNome.trim())
          }
          if (metodoId) {
            fd.append('metodo_pagamento', metodoId)
          }
          fd.append('observacoes', obsParts.join(' | '))
          fd.append('comprovante_texto', comprovanteTexto)
          fd.append('comprovante_foto', anexoFile)

          await pb.collection('telegram_registros_pendentes').create(fd)
        } else {
          await pb.collection('telegram_registros_pendentes').create({
            descricao: descricao.trim(),
            valor: valorNumerico,
            tipo: 'despesa',
            data: dataIso,
            status: 'pendente',
            origem_tipo: 'pwa',
            conta: contaId || null,
            empresa: empresaRef || null,
            pessoa: pessoaRef || null,
            contexto_nome: contextoLabel,
            fornecedor: selectedFornecedorId || null,
            fornecedor_nome: fornecedorNome.trim() || null,
            metodo_pagamento: metodoId || null,
            observacoes: obsParts.join(' | '),
            comprovante_texto: comprovanteTexto,
          })
        }

        const msg = 'Despesa enviada para a Triagem.'
        setSuccessMessage(msg)
        // Limpa formulário após envio com sucesso
        setDescricao('')
        setValorStr('')
        setFornecedorNome('')
        setSelectedFornecedorId(null)
        setSugestaoAtiva(null)
        setAnexoFile(null)
        setAnexoPreview(null)
        const now = new Date()
        const tzOffset = now.getTimezoneOffset() * 60000
        setDataHora(new Date(now.getTime() - tzOffset).toISOString().slice(0, 16))

        // Recarrega últimos lançamentos da PWA
        loadUltimosLancamentos()
        setRedirectCountdown(2)
      }
    } catch (err: any) {
      console.error('Falha ao enviar/atualizar despesa rápida:', err)
      setErrorMessage(
        apiMessage(
          err,
          'Não foi possível salvar a despesa. Verifique sua conexão à internet e tente novamente.',
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Ação de duplicar lançamento anterior
  const handleDuplicar = (item: TelegramRegistroPendente) => {
    setSuccessMessage(null)
    setErrorMessage(null)
    setDescricao(item.descricao || '')
    setValorStr(
      (item.valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    )

    // Tenta obter fornecedor/estabelecimento estruturado ou extrair das observações
    if (item.fornecedor && fornecedores.some((f) => f.id === item.fornecedor)) {
      const fornObj = fornecedores.find((f) => f.id === item.fornecedor)
      setSelectedFornecedorId(item.fornecedor)
      setFornecedorNome(fornObj?.nome || item.fornecedor_nome || '')
    } else if (item.fornecedor_nome) {
      setSelectedFornecedorId(null)
      setFornecedorNome(item.fornecedor_nome)
    } else {
      const fornecedorMatch = item.observacoes?.match(/(?:Estabelecimento|Fornecedor):\s*([^|]+)/i)
      if (fornecedorMatch && fornecedorMatch[1]) {
        const fNome = fornecedorMatch[1].trim()
        setFornecedorNome(fNome)
        setSelectedFornecedorId(null)
      } else {
        setFornecedorNome('')
        setSelectedFornecedorId(null)
      }
    }

    if (item.metodo_pagamento && metodosPagamento.some((m) => m.id === item.metodo_pagamento)) {
      setMetodoId(item.metodo_pagamento)
    }

    if (item.conta && contas.some((c) => c.id === item.conta)) {
      setContaId(item.conta)
    }

    // Atualiza data/hora para o momento atual para uma nova compra
    const now = new Date()
    const tzOffset = now.getTimezoneOffset() * 60000
    setDataHora(new Date(now.getTime() - tzOffset).toISOString().slice(0, 16))

    // Rola suavemente até o topo
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Filtragem de fornecedores na busca modal
  const fornecedoresFiltrados = fornecedores.filter((f) => {
    if (!fornecedorQuery.trim()) return true
    const q = fornecedorQuery.toLowerCase()
    return (
      f.nome?.toLowerCase().includes(q) ||
      f.apelido?.toLowerCase().includes(q) ||
      f.categoria?.toLowerCase().includes(q)
    )
  })

  // Sugestões de fornecedores: Recentes e Favoritos
  const fornecedoresFavoritosList = favoriteSupplierNames
  const fornecedoresRecentesList = recentSupplierNames.filter(
    (n) => !favoriteSupplierNames.some((fav) => fav.toLowerCase() === n.toLowerCase()),
  )

  return (
    <div className="min-h-screen bg-[#FBF8F5] text-stone-900 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] antialiased selection:bg-[#DF5830]/20 selection:text-[#DF5830]">
      {/* Moldura centralizada em tela desktop para simular tela de celular conforme spec (b) */}
      <div className="mx-auto w-full max-w-md min-h-screen bg-white sm:shadow-2xl sm:border-x sm:border-stone-200/80 flex flex-col justify-between">
        {/* CABEÇALHO DO SUB-APP MÓVEL */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-stone-200/80 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#DF5830] to-[#b83f1d] text-white shadow-sm">
                <Zap className="h-5 w-5 fill-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-black tracking-tight leading-none text-stone-900">
                  Despesa Rápida
                </h1>
                <p className="text-[11px] font-semibold text-stone-500 leading-none mt-1">
                  Sub-app móvel GKza
                </p>
              </div>
            </div>
            {/* Atalho para o Hub Móvel */}
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg shrink-0"
              title="Voltar ao Hub Móvel"
            >
              <Link to="/m">Ir ao Hub</Link>
            </Button>{' '}
          </div>

          {/* 1. SELETOR DE CONTEXTO NO TOPO */}
          <div className="mt-2.5 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">
                Contexto:
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-stone-100 text-stone-800 hover:bg-stone-200/70 transition shadow-2xs max-w-[260px] truncate"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: contextoCor }}
                    />
                    <span className="truncate">{contextoLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-stone-500 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg">
                  <DropdownMenuLabel className="text-[10px] uppercase font-bold text-stone-400 px-2 py-1">
                    Trocar Contexto
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => handleSelectContexto('all')}
                    className="text-xs font-semibold cursor-pointer rounded-lg px-2.5 py-2 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#DF5830]" />
                      Todos (Geral)
                    </span>
                    {contextoId === 'all' && <Check className="h-3.5 w-3.5 text-[#DF5830]" />}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {grupos.map((g) => (
                    <DropdownMenuItem
                      key={g.id}
                      onClick={() => handleSelectContexto(g.id)}
                      className="text-xs font-semibold cursor-pointer rounded-lg px-2.5 py-2 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: g.cor || '#DF5830' }}
                        />
                        <span className="truncate">{g.nome}</span>
                      </span>
                      {contextoId === g.id && <Check className="h-3.5 w-3.5 text-[#DF5830]" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* ÁREA CENTRAL: FORMULÁRIO DE LANÇAMENTO */}
        <main className="flex-1 px-4 py-4 space-y-4">
          {/* Mensagem de Sucesso com opção de nova despesa e redirecionamento ao Hub */}
          {successMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm animate-in fade-in-50">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-2xs">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-extrabold text-emerald-950">{successMessage}</h3>
                  <p className="text-xs text-emerald-800/90 mt-0.5 leading-relaxed">
                    {redirectCountdown !== null
                      ? `Retornando ao Hub em ${redirectCountdown}s...`
                      : 'Você pode conferir e aprovar o lançamento na Triagem a qualquer momento.'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      asChild
                      size="sm"
                      className="h-8 px-3 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs rounded-lg"
                    >
                      <Link to="/m">Voltar ao Hub agora</Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNovaDespesa}
                      className="h-8 px-3 text-xs font-semibold border-emerald-300 text-emerald-900 hover:bg-emerald-100 rounded-lg"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Lançar outra
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 rounded-lg"
                    >
                      <Link to="/pendentes">Ver Triagem</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Banner de Edição Ativa */}
          {editingPendenteId && (
            <div className="rounded-2xl border border-orange-300 bg-orange-50/90 p-3 shadow-xs flex items-center justify-between gap-2 animate-in fade-in-50">
              <div className="flex items-center gap-2 min-w-0">
                <Pencil className="h-4 w-4 text-[#DF5830] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-black text-orange-950 truncate">
                    Editando despesa da Triagem
                  </p>
                  <p className="text-[11px] text-orange-800 truncate">
                    Você está alterando os dados antes da confirmação final
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelarEdicao}
                className="h-7 px-2 text-xs font-bold text-orange-900 hover:bg-orange-100 rounded-lg shrink-0"
              >
                Cancelar
              </Button>
            </div>
          )}
          {/* Mensagem de Erro Online / Validação */}
          {errorMessage && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 shadow-sm animate-in fade-in-50">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-destructive">{errorMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-destructive/70 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 2. DESCRIÇÃO DA DESPESA */}
            <div className="space-y-1.5">
              <Label
                htmlFor="descricao"
                className="text-xs font-black uppercase tracking-wider text-stone-600"
              >
                2. Descrição da despesa *
              </Label>
              <Input
                id="descricao"
                placeholder="Ex.: Café da manhã, Uber, Teclado, Almoço..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                required
                className="h-12 text-base rounded-xl border-stone-200 bg-stone-50/50 focus:bg-white focus:border-[#DF5830] transition"
              />

              {/* Sugestões rápidas de descrições frequentes */}
              {descricoesSugeridas.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-stone-400">Sugestões:</span>
                  {descricoesSugeridas.slice(0, 4).map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setDescricao(sug)}
                      className="rounded-full bg-stone-100 hover:bg-stone-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-stone-700 transition"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 3. VALOR DA COMPRA (TECLADO NUMÉRICO DECIMAL) */}
            <div className="space-y-1.5">
              <Label
                htmlFor="valor"
                className="text-xs font-black uppercase tracking-wider text-stone-600"
              >
                3. Valor (R$) *
              </Label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-black text-stone-400">
                  R$
                </span>
                <Input
                  id="valor"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorStr}
                  onChange={handleValorChange}
                  required
                  className="h-14 pl-11 text-2xl font-black rounded-xl border-stone-200 bg-stone-50/50 text-[#DF5830] focus:bg-white focus:border-[#DF5830] transition tabular-nums"
                />
              </div>
            </div>

            {/* 4. ESTABELECIMENTO / LOCAL DE COMPRA (PESQUISÁVEL) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-black uppercase tracking-wider text-stone-600">
                  4. Estabelecimento / Local de compra
                </Label>
                {fornecedorNome && (
                  <button
                    type="button"
                    onClick={() => {
                      setFornecedorNome('')
                      setSelectedFornecedorId(null)
                      setSugestaoAtiva(null)
                    }}
                    className="text-[10px] font-bold text-stone-400 hover:text-stone-700"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div
                onClick={() => setFornecedorSearchOpen(true)}
                className="flex h-12 w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 text-sm text-stone-900 cursor-pointer hover:border-stone-300 transition"
              >
                <div className="flex items-center gap-2 truncate">
                  <Store className="h-4 w-4 text-stone-400 shrink-0" />
                  <span
                    className={
                      fornecedorNome
                        ? 'font-bold text-stone-900 truncate'
                        : 'text-stone-400 font-normal truncate'
                    }
                  >
                    {fornecedorNome || 'Selecionar ou buscar estabelecimento...'}
                  </span>
                </div>
                <Search className="h-4 w-4 text-stone-400 shrink-0" />
              </div>

              {/* Sugestão de Estabelecimento: BANNER DE INTELIGÊNCIA POR HISTÓRICO */}
              {sugestaoAtiva && (
                <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50/70 to-orange-50 p-2.5 text-xs text-orange-950 animate-in fade-in-50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Sparkles className="h-3.5 w-3.5 text-[#DF5830] shrink-0" />
                      <span className="font-semibold truncate">
                        Sugerir última conta e método usados com {fornecedorNome}?
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAplicarSugestao}
                      className="h-6 px-2 text-[10px] font-extrabold bg-[#DF5830] hover:bg-[#b83f1d] text-white rounded-md shrink-0 shadow-2xs"
                    >
                      Aplicar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. CONTA DE PAGAMENTO PREVISTA / CARTÃO */}
            <div className="space-y-1.5">
              <Label
                htmlFor="conta"
                className="text-xs font-black uppercase tracking-wider text-stone-600"
              >
                5. Conta de pagamento prevista / Cartão
              </Label>
              <div className="grid grid-cols-1 gap-1.5">
                <select
                  id="conta"
                  value={contaId}
                  onChange={(e) => setContaId(e.target.value)}
                  className="h-12 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 text-sm font-bold text-stone-800 focus:bg-white focus:border-[#DF5830] transition"
                >
                  {contasOrdenadas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tipo === 'cartao' ? '💳' : c.tipo === 'bancaria' ? '🏦' : '💵'} {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 6. MÉTODO DE PAGAMENTO (FILTRADO PELA CONTA + DINHEIRO) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="metodo"
                  className="text-xs font-black uppercase tracking-wider text-stone-600"
                >
                  6. Método de pagamento
                </Label>
                <span className="text-[10px] font-semibold text-stone-400">
                  {selectedConta?.tipo === 'cartao' ? 'Cartão' : 'Conta/Caixa'}
                </span>
              </div>

              {/* Botões rápidos em formato de pílula para seleção com um toque */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {metodosCompativeis.map((m) => {
                  const selected = metodoId === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMetodoId(m.id)}
                      className={`flex items-center justify-center gap-1.5 h-11 px-2.5 rounded-xl text-xs font-bold transition border ${
                        selected
                          ? 'border-[#DF5830] bg-[#DF5830]/10 text-[#DF5830] shadow-2xs'
                          : 'border-stone-200 bg-stone-50/60 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <CreditCard className="h-3.5 w-3.5 shrink-0 opacity-80" />
                      <span className="truncate">{m.nome}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 7. DATA DA COMPRA */}
            <div className="space-y-1.5">
              <Label
                htmlFor="dataHora"
                className="text-xs font-black uppercase tracking-wider text-stone-600"
              >
                7. Data e hora da compra
              </Label>
              <div className="relative">
                <Input
                  id="dataHora"
                  type="datetime-local"
                  value={dataHora}
                  onChange={(e) => setDataHora(e.target.value)}
                  className="h-11 rounded-xl border-stone-200 bg-stone-50/50 text-xs font-semibold text-stone-800 focus:bg-white focus:border-[#DF5830]"
                />
              </div>
            </div>

            {/* 8. ANEXO / FOTO PELA CÂMERA */}
            <div className="space-y-1.5">
              <Label className="text-xs font-black uppercase tracking-wider text-stone-600">
                8. Comprovante ou Foto (Opcional)
              </Label>
              {anexoPreview ? (
                <div className="relative rounded-2xl border border-stone-200 bg-stone-50 p-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={anexoPreview}
                      alt="Preview do comprovante"
                      className="h-14 w-14 rounded-xl object-cover border border-stone-200"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-stone-900 truncate">
                        {anexoFile?.name || 'Foto capturada'}
                      </p>
                      <p className="text-[10px] text-stone-500 font-medium">
                        {anexoFile?.size ? (anexoFile.size / 1024).toFixed(0) : '0'} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoverAnexo}
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {/* Botão de Câmera Direta (capture="environment") */}
                  <label className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/50 hover:bg-stone-100 hover:border-[#DF5830]/50 transition cursor-pointer text-stone-600">
                    <Camera className="h-5 w-5 text-[#DF5830]" />
                    <span className="text-[11px] font-bold">Tirar Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleAnexoChange}
                      className="hidden"
                    />
                  </label>

                  {/* Botão de Arquivo da Galeria / PDF */}
                  <label className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/50 hover:bg-stone-100 hover:border-[#DF5830]/50 transition cursor-pointer text-stone-600">
                    <ImageIcon className="h-5 w-5 text-stone-500" />
                    <span className="text-[11px] font-bold">Galeria / Anexo</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleAnexoChange}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* BOTÃO PRINCIPAL DESTACADO: ENVIAR PARA TRIAGEM / SALVAR ALTERAÇÕES */}
            <div className="pt-2 flex flex-col gap-2">
              <Button
                type="submit"
                disabled={submitting}
                className="h-14 w-full rounded-2xl bg-gradient-to-r from-[#DF5830] to-[#b83f1d] hover:from-[#c94924] hover:to-[#a33617] text-white text-base font-black tracking-wide shadow-lg shadow-orange-500/20 active:scale-[0.99] transition"
              >
                {submitting ? (
                  <>
                    <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
                    {editingPendenteId ? 'Salvando alterações...' : 'Enviando para triagem...'}
                  </>
                ) : editingPendenteId ? (
                  <>
                    <Pencil className="mr-2 h-5 w-5" />
                    SALVAR ALTERAÇÕES NA TRIAGEM
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-5 w-5 fill-white" />
                    ENVIAR PARA TRIAGEM
                  </>
                )}
              </Button>
              {editingPendenteId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelarEdicao}
                  className="h-10 text-xs font-bold border-stone-200 text-stone-700 hover:bg-stone-100 rounded-xl"
                >
                  Cancelar edição
                </Button>
              )}
            </div>
          </form>

          {/* ÁREA RECOLHÍVEL: ÚLTIMOS LANÇAMENTOS DO USUÁRIO */}
          <section className="pt-4 border-t border-stone-200/80 space-y-2.5">
            <button
              type="button"
              onClick={() => setUltimosAberto(!ultimosAberto)}
              className="flex w-full items-center justify-between text-left py-1 text-xs font-black uppercase tracking-wider text-stone-500 hover:text-stone-800 transition"
            >
              <span className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                Últimos lançamentos (Sub-app)
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  ultimosAberto ? 'rotate-180' : ''
                }`}
              />
            </button>

            {ultimosAberto && (
              <div className="space-y-2">
                {loadingUltimos ? (
                  <div className="flex justify-center py-4">
                    <LoaderCircle className="h-5 w-5 animate-spin text-stone-400" />
                  </div>
                ) : ultimosLancamentos.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-200 p-4 text-center">
                    <p className="text-xs text-stone-400 font-medium">
                      Nenhuma despesa enviada por este sub-app ainda.
                    </p>
                  </div>
                ) : (
                  ultimosLancamentos.map((item) => {
                    const statusLabel =
                      item.status === 'aprovado'
                        ? 'Triada'
                        : item.status === 'descartado'
                          ? 'Descartada'
                          : 'Na Triagem'
                    const statusColor =
                      item.status === 'aprovado'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'descartado'
                          ? 'bg-stone-100 text-stone-600'
                          : 'bg-amber-100 text-amber-800'

                    // Extrair fornecedor se anotado nas observações
                    const matchF = item.observacoes?.match(/Fornecedor:\s*([^|]+)/)
                    const fNome = matchF ? matchF[1].trim() : ''

                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs text-stone-900 truncate">
                              {item.descricao}
                            </span>
                            <Badge
                              variant="secondary"
                              className={`text-[9px] px-1.5 py-0 h-4 font-bold border-0 ${statusColor}`}
                            >
                              {statusLabel}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500 mt-0.5">
                            <span className="font-bold text-[#DF5830]">
                              {formatCurrency(item.valor)}
                            </span>
                            {fNome && <span>• {fNome}</span>}
                            <span>
                              • {formatDate(item.created, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Botão Editar (apenas para registros pendentes na triagem) */}
                          {item.status === 'pendente' ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditarDespesa(item)}
                              className="h-8 px-2.5 text-xs font-bold border-stone-200 hover:border-[#DF5830] hover:text-[#DF5830] text-stone-700 rounded-lg shadow-2xs"
                              title="Editar lançamento pendente na triagem"
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              Editar
                            </Button>
                          ) : (
                            <span
                              className="text-[10px] font-bold text-stone-400 px-1 cursor-default"
                              title="Registro já processado na triagem"
                            >
                              Processada
                            </span>
                          )}

                          {/* Botão Duplicar */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDuplicar(item)}
                            className="h-8 px-2 text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg"
                            title="Preencher formulário com estes dados para novo lançamento"
                          >
                            <Copy className="mr-1 h-3 w-3" />
                            Duplicar
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </section>
        </main>

        {/* RODAPÉ DO SUB-APP */}
        <footer className="border-t border-stone-200/80 bg-stone-50/70 p-3 text-center text-[11px] text-stone-400">
          Despesa Rápida GKza • v1.0
        </footer>
      </div>

      {/* MODAL DE BUSCA / SELEÇÃO DE ESTABELECIMENTOS */}
      <Dialog open={fornecedorSearchOpen} onOpenChange={setFornecedorSearchOpen}>
        <DialogContent className="sm:max-w-md p-5 max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Selecionar Estabelecimento</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Escolha um estabelecimento recente, favorito ou pesquise na base de cadastros.
            </DialogDescription>
          </DialogHeader>

          {/* Campo de pesquisa */}
          <div className="relative my-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input
              placeholder="Pesquisar estabelecimento..."
              value={fornecedorQuery}
              onChange={(e) => setFornecedorQuery(e.target.value)}
              className="pl-9 h-11 text-sm bg-stone-50"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
            {/* Botão para cadastrar novo estabelecimento rápido */}
            <button
              type="button"
              onClick={() => {
                setNovoFornecedorNome(fornecedorQuery)
                setNovoFornecedorDialogOpen(true)
              }}
              className="flex w-full items-center justify-between rounded-xl border border-dashed border-[#DF5830]/40 bg-orange-50/50 p-2.5 text-xs font-bold text-[#DF5830] hover:bg-orange-50 transition"
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Criar novo estabelecimento {fornecedorQuery ? `"${fornecedorQuery}"` : ''}
              </span>
            </button>

            {/* SEÇÃO FAVORITOS */}
            {fornecedoresFavoritosList.length > 0 && !fornecedorQuery && (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 mb-1">
                  ⭐ Favoritos
                </p>
                <div className="space-y-1">
                  {fornecedoresFavoritosList.map((favNome) => (
                    <div
                      key={favNome}
                      onClick={() => handleSelectFornecedor(favNome)}
                      className="flex items-center justify-between rounded-lg p-2 text-xs font-semibold hover:bg-stone-100 cursor-pointer transition"
                    >
                      <span className="truncate">{favNome}</span>
                      <button
                        type="button"
                        onClick={(e) => toggleFavoriteSupplier(favNome, e)}
                        className="text-amber-500 hover:scale-110 p-1"
                      >
                        ★
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SEÇÃO RECENTES */}
            {fornecedoresRecentesList.length > 0 && !fornecedorQuery && (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 mb-1">
                  🕒 Recentes
                </p>
                <div className="space-y-1">
                  {fornecedoresRecentesList.map((recNome) => (
                    <div
                      key={recNome}
                      onClick={() => handleSelectFornecedor(recNome)}
                      className="flex items-center justify-between rounded-lg p-2 text-xs font-semibold hover:bg-stone-100 cursor-pointer transition"
                    >
                      <span className="truncate">{recNome}</span>
                      <button
                        type="button"
                        onClick={(e) => toggleFavoriteSupplier(recNome, e)}
                        className="text-stone-300 hover:text-amber-500 p-1"
                      >
                        ☆
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SEÇÃO TODOS OS ESTABELECIMENTOS CADASTRADOS */}
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 mb-1">
                {fornecedorQuery ? 'Resultados' : 'Todos os Estabelecimentos'}
              </p>
              <div className="space-y-1">
                {fornecedoresFiltrados.length === 0 ? (
                  <p className="text-xs text-stone-400 py-3 text-center">
                    Nenhum estabelecimento encontrado.
                  </p>
                ) : (
                  fornecedoresFiltrados.map((f) => {
                    const isFav = favoriteSupplierNames.some(
                      (fav) => fav.toLowerCase() === f.nome.toLowerCase(),
                    )
                    return (
                      <div
                        key={f.id}
                        onClick={() => handleSelectFornecedor(f.nome, f.id)}
                        className="flex items-center justify-between rounded-lg p-2 text-xs font-semibold hover:bg-stone-100 cursor-pointer transition"
                      >
                        <div className="min-w-0 truncate">
                          <p className="truncate font-bold text-stone-800">{f.nome}</p>
                          {f.apelido && f.apelido !== f.nome && (
                            <p className="text-[10px] text-stone-400 truncate">{f.apelido}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => toggleFavoriteSupplier(f.nome, e)}
                          className={`p-1 text-sm ${isFav ? 'text-amber-500' : 'text-stone-300 hover:text-amber-500'}`}
                        >
                          {isFav ? '★' : '☆'}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL RÁPIDO: NOVO ESTABELECIMENTO (APENAS NOME) */}
      <Dialog open={novoFornecedorDialogOpen} onOpenChange={setNovoFornecedorDialogOpen}>
        <DialogContent className="sm:max-w-xs p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Novo Estabelecimento</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Cadastre rapidamente informando apenas o nome do local de compra.
            </DialogDescription>
          </DialogHeader>

          <div className="my-2 space-y-1.5">
            <Label htmlFor="novoNome" className="text-xs font-bold text-stone-700">
              Nome do Estabelecimento *
            </Label>
            <Input
              id="novoNome"
              placeholder="Ex.: Supermercado XYZ"
              value={novoFornecedorNome}
              onChange={(e) => setNovoFornecedorNome(e.target.value)}
              className="h-11"
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNovoFornecedorDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={salvandoNovoFornecedor || !novoFornecedorNome.trim()}
              onClick={handleCriarNovoFornecedorRapido}
              className="bg-[#DF5830] hover:bg-[#b83f1d] text-white font-bold"
            >
              {salvandoNovoFornecedor ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
