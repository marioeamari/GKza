import pb from '@/lib/pocketbase/client'
import type { PausaPonto } from '@/lib/funcionarios'
import {
  normalizarDataPonto,
  buildFiltroPontoData,
  validarPodeRegistrarEntrada,
  validarOrigemPontoPermitida,
  MSG_BLOQUEIO_FORA_DO_LOCAL,
} from '@/lib/funcionarios'
import { getLocalDateStr, dateOnly, toPocketBaseDate } from '@/lib/format'

export interface FuncionarioRecord {
  id: string
  nome: string
  cargo?: string
  valor_hora: number
  salario_base?: number
  dias_mes?: number
  horas_dia?: number
  hora_almoco_conta?: boolean
  ciclo_pagamento: 'semanal' | 'quinzenal' | 'mensal' | 'personalizado'
  pix?: string
  telefone?: string
  ativo: boolean
  token_sessao?: string
  pin?: string
  /** Funções (cargos de checklist) do funcionário — relation multi p/ funcionarios_funcoes. */
  funcoes?: string[]
  created?: string
  updated?: string
}

export interface FuncionarioDividaRecord {
  id: string
  funcionario: string
  descricao: string
  valor_total: number
  saldo_atual: number
  percentual_abatimento: number // ex: 60 para 60%
  ativa: boolean
  created?: string
  updated?: string
}

export interface FuncionarioEstacaoRecord {
  id: string
  nome: string
  token: string
  token_diario?: string
  token_diario_validade?: string
  ativa: boolean
  local_descricao?: string
  created?: string
  updated?: string
}

export interface FuncionarioPontoRecord {
  id: string
  funcionario: string
  data: string // YYYY-MM-DD
  entrada: string // HH:mm
  saida?: string // HH:mm
  pausas?: PausaPonto[]
  origem: 'estacao_qr' | 'fora_do_local' | 'manual' | 'admin'
  estacao?: string
  local_aproximado?: string
  editado_por?: string
  observacao?: string
  created?: string
  updated?: string
  expand?: {
    funcionario?: FuncionarioRecord
  }
}

export interface FuncionarioFolhaRecord {
  id: string
  funcionario: string
  periodo_inicio: string
  periodo_fim: string
  ganho_total: number
  descontos?: any
  divida_semanal: number
  a_receber: number
  quitada: boolean
  data_quitacao?: string
  lancamento_id?: string
  observacoes?: string
  notificacao_pagamento_enviada?: boolean
  notificacao_pagamento_em?: string
  status_conferencia_colaborador?: 'pendente' | 'confirmado' | 'divergente'
  conferido_colaborador_em?: string
  motivo_divergencia_colaborador?: string
  dias_pendentes_fechamento?: string[]
  created?: string
  updated?: string
  expand?: {
    funcionario?: FuncionarioRecord
  }
}

export interface FuncionarioConfirmacaoRecord {
  id: string
  funcionario: string
  data: string // YYYY-MM-DD
  confirmado: boolean
  confirmado_em?: string
  divergencia_apontada?: boolean
  motivo_divergencia?: string
  ip_origem?: string
  observacao?: string
  created?: string
  updated?: string
}

export const funcionariosService = {
  // --- FUNCIONÁRIOS ---
  async listarFuncionarios(somenteAtivos = false): Promise<FuncionarioRecord[]> {
    const filter = somenteAtivos ? 'ativo = true' : ''
    return await pb.collection('funcionarios').getFullList<FuncionarioRecord>({
      filter,
      sort: 'nome',
    })
  },

  async buscarFuncionarioPorId(id: string): Promise<FuncionarioRecord> {
    return await pb.collection('funcionarios').getOne<FuncionarioRecord>(id)
  },

  async buscarFuncionarioPorTokenSessao(token: string): Promise<FuncionarioRecord | null> {
    if (!token) return null
    try {
      return await pb
        .collection('funcionarios')
        .getFirstListItem<FuncionarioRecord>(`token_sessao = "${token}"`)
    } catch (_) {
      return null
    }
  },

  async criarFuncionario(
    dados: Omit<FuncionarioRecord, 'id' | 'created' | 'updated'>,
  ): Promise<FuncionarioRecord> {
    return await pb.collection('funcionarios').create<FuncionarioRecord>(dados)
  },

  async atualizarFuncionario(
    id: string,
    dados: Partial<FuncionarioRecord>,
  ): Promise<FuncionarioRecord> {
    return await pb.collection('funcionarios').update<FuncionarioRecord>(id, dados)
  },

  async excluirFuncionario(id: string): Promise<boolean> {
    return await pb.collection('funcionarios').delete(id)
  },

  // --- DÍVIDAS ---
  async listarDividas(funcionarioId?: string): Promise<FuncionarioDividaRecord[]> {
    const filter = funcionarioId ? `funcionario = "${funcionarioId}"` : ''
    return await pb.collection('funcionarios_dividas').getFullList<FuncionarioDividaRecord>({
      filter,
      sort: '-created',
    })
  },

  async criarDivida(
    dados: Omit<FuncionarioDividaRecord, 'id' | 'created' | 'updated'>,
  ): Promise<FuncionarioDividaRecord> {
    return await pb.collection('funcionarios_dividas').create<FuncionarioDividaRecord>(dados)
  },

  async atualizarDivida(
    id: string,
    dados: Partial<FuncionarioDividaRecord>,
  ): Promise<FuncionarioDividaRecord> {
    return await pb.collection('funcionarios_dividas').update<FuncionarioDividaRecord>(id, dados)
  },

  async excluirDivida(id: string): Promise<boolean> {
    return await pb.collection('funcionarios_dividas').delete(id)
  },

  // --- ESTAÇÕES (QR) ---
  async listarEstacoes(): Promise<FuncionarioEstacaoRecord[]> {
    return await pb.collection('funcionarios_estacoes').getFullList<FuncionarioEstacaoRecord>({
      sort: 'nome',
    })
  },

  async buscarEstacaoPorToken(token: string): Promise<FuncionarioEstacaoRecord | null> {
    if (!token) return null
    const hojeStr = getLocalDateStr() // Data atual no fuso America/Sao_Paulo (YYYY-MM-DD)

    try {
      // 1. Busca por token_diario nas estações ativas
      const estacao = await pb
        .collection('funcionarios_estacoes')
        .getFirstListItem<FuncionarioEstacaoRecord>(`token_diario = "${token}" && ativa = true`)

      if (estacao) {
        // Validação estrita de data: somente aceito se a validade bater com hoje
        const validadeStr = estacao.token_diario_validade
          ? dateOnly(estacao.token_diario_validade)
          : ''
        if (validadeStr === hojeStr) {
          return estacao
        }
        // Token diário antigo / expirado -> rejeitado como "estação não localizada"
        return null
      }
    } catch (_) {
      // Nenhum registro encontrado com token_diario
    }

    // 2. Compatibilidade / Fallback de transição:
    // Se ainda não tiver token_diario gerado no banco ou for a primeira leitura de estação antiga
    try {
      const estacaoLegada = await pb
        .collection('funcionarios_estacoes')
        .getFirstListItem<FuncionarioEstacaoRecord>(`token = "${token}" && ativa = true`)

      if (estacaoLegada) {
        // Se a estação ainda não possuía token_diario ou está expirada, gera na primeira leitura
        const validadeLegada = estacaoLegada.token_diario_validade
          ? dateOnly(estacaoLegada.token_diario_validade)
          : ''

        if (!estacaoLegada.token_diario || validadeLegada !== hojeStr) {
          const novoToken = crypto.randomUUID().replace(/-/g, '')
          const tokenDiario = `ponto_${novoToken}`
          const agoraIso = new Date().toISOString()
          try {
            const atualizada = await pb
              .collection('funcionarios_estacoes')
              .update<FuncionarioEstacaoRecord>(estacaoLegada.id, {
                token_diario: tokenDiario,
                token_diario_validade: agoraIso,
              })
            return atualizada
          } catch {
            return estacaoLegada
          }
        }
        // Se a estação legada já tinha token_diario gerado para hoje, o acesso pelo token fixo antigo
        // não é mais aceito (somente o token_diario de hoje é aceito)
        return null
      }
    } catch (_) {
      // Estação não localizada
    }

    return null
  },

  async criarEstacao(dados: {
    nome: string
    token: string
    ativa: boolean
    local_descricao?: string
  }): Promise<FuncionarioEstacaoRecord> {
    return await pb.collection('funcionarios_estacoes').create<FuncionarioEstacaoRecord>(dados)
  },

  async atualizarEstacao(
    id: string,
    dados: Partial<FuncionarioEstacaoRecord>,
  ): Promise<FuncionarioEstacaoRecord> {
    return await pb.collection('funcionarios_estacoes').update<FuncionarioEstacaoRecord>(id, dados)
  },

  // --- PONTOS ---
  async listarPontos(params?: {
    funcionarioId?: string
    dataInicio?: string
    dataFim?: string
  }): Promise<FuncionarioPontoRecord[]> {
    const filters: string[] = []
    if (params?.funcionarioId) filters.push(`funcionario = "${params.funcionarioId}"`)
    if (params?.dataInicio) {
      const ini = normalizarDataPonto(params.dataInicio)
      filters.push(`data >= "${ini} 00:00:00"`)
    }
    if (params?.dataFim) {
      const fim = normalizarDataPonto(params.dataFim)
      filters.push(`data <= "${fim} 23:59:59"`)
    }

    const registros = await pb
      .collection('funcionarios_pontos')
      .getFullList<FuncionarioPontoRecord>({
        filter: filters.join(' && '),
        sort: 'data,entrada',
        expand: 'funcionario',
      })

    // Normaliza campo data para YYYY-MM-DD para consumo seguro e consistente em toda a UI
    return registros.map((r) => ({
      ...r,
      data: normalizarDataPonto(r.data),
    }))
  },

  async buscarPontosDoDia(
    funcionarioId: string,
    dataHoje?: string,
  ): Promise<FuncionarioPontoRecord[]> {
    if (!funcionarioId) return []
    const diaStr = normalizarDataPonto(dataHoje || getLocalDateStr())
    try {
      const filtroData = buildFiltroPontoData(diaStr)
      const records = await pb
        .collection('funcionarios_pontos')
        .getFullList<FuncionarioPontoRecord>({
          filter: `funcionario = "${funcionarioId}" && ${filtroData}`,
          sort: '-created',
        })
      return records.map((r) => ({
        ...r,
        data: normalizarDataPonto(r.data),
      }))
    } catch (err) {
      console.warn('Erro ao buscar pontos do dia:', err)
      return []
    }
  },

  async buscarPontoAbertoHoje(
    funcionarioId: string,
    dataHoje?: string,
  ): Promise<FuncionarioPontoRecord | null> {
    try {
      const records = await this.buscarPontosDoDia(funcionarioId, dataHoje)
      // Procura primeiro um ponto sem saída registrada
      const aberto = records.find((r) => !r.saida || r.saida.trim() === '')
      return aberto || null
    } catch (_) {
      return null
    }
  },

  async buscarUltimoPontoDoDia(
    funcionarioId: string,
    dataHoje?: string,
  ): Promise<FuncionarioPontoRecord | null> {
    try {
      const records = await this.buscarPontosDoDia(funcionarioId, dataHoje)
      return records[0] || null
    } catch (_) {
      return null
    }
  },

  async registrarEntrada(params: {
    funcionarioId: string
    data?: string // YYYY-MM-DD (se omitido usa getLocalDateStr() em America/Sao_Paulo)
    hora: string // HH:mm
    origem: 'estacao_qr' | 'fora_do_local' | 'manual' | 'admin'
    estacao?: string
    localAproximado?: string
    editadoPor?: string
    observacao?: string
  }): Promise<FuncionarioPontoRecord> {
    // REGRA: batida de ponto só a partir do escaneamento do QR da estação.
    // Origem 'fora_do_local' é recusada; lançamento 'admin' permanece permitido.
    validarOrigemPontoPermitida(params.origem)

    const diaAlvo = normalizarDataPonto(params.data || getLocalDateStr())

    // Regra anti-duplicidade estrita:
    // Se não for lançamento administrativo retroativo, valida se já há ponto hoje
    if (params.origem !== 'admin') {
      const pontosHoje = await this.buscarPontosDoDia(params.funcionarioId, diaAlvo)
      const validacao = validarPodeRegistrarEntrada(pontosHoje, diaAlvo)
      if (!validacao.pode) {
        throw new Error(validacao.motivo || 'Entrada não permitida: ponto já registrado hoje.')
      }
    }

    const pontoCriado = await pb.collection('funcionarios_pontos').create<FuncionarioPontoRecord>({
      funcionario: params.funcionarioId,
      data: toPocketBaseDate(diaAlvo),
      entrada: params.hora,
      pausas: [],
      origem: params.origem,
      estacao: params.estacao || '',
      local_aproximado: params.localAproximado || '',
      editado_por: params.editadoPor || '',
      observacao: params.observacao || '',
    })

    return {
      ...pontoCriado,
      data: normalizarDataPonto(pontoCriado.data),
    }
  },

  async registrarSaida(
    pontoId: string,
    horaSaida: string,
    origem?: FuncionarioPontoRecord['origem'],
  ): Promise<FuncionarioPontoRecord> {
    // REGRA: saída só a partir do escaneamento do QR da estação ('admin' permanece permitido).
    validarOrigemPontoPermitida(origem)
    return await pb.collection('funcionarios_pontos').update<FuncionarioPontoRecord>(pontoId, {
      saida: horaSaida,
    })
  },

  async registrarPausa(
    pontoId: string,
    pausasAtuais: PausaPonto[],
    horaInicioPausa: string,
    origem?: FuncionarioPontoRecord['origem'],
  ): Promise<FuncionarioPontoRecord> {
    // REGRA: pausa só a partir do escaneamento do QR da estação ('admin' permanece permitido).
    validarOrigemPontoPermitida(origem)
    const novasPausas = [...pausasAtuais, { inicio: horaInicioPausa }]
    return await pb.collection('funcionarios_pontos').update<FuncionarioPontoRecord>(pontoId, {
      pausas: novasPausas,
    })
  },

  async retomarPausa(
    pontoId: string,
    pausasAtuais: PausaPonto[],
    horaFimPausa: string,
    origem?: FuncionarioPontoRecord['origem'],
  ): Promise<FuncionarioPontoRecord> {
    // REGRA: retorno da pausa só a partir do escaneamento do QR da estação ('admin' permitido).
    validarOrigemPontoPermitida(origem)
    const novasPausas = pausasAtuais.map((p, index) => {
      if (index === pausasAtuais.length - 1 && !p.fim) {
        return { ...p, fim: horaFimPausa }
      }
      return p
    })
    return await pb.collection('funcionarios_pontos').update<FuncionarioPontoRecord>(pontoId, {
      pausas: novasPausas,
    })
  },

  async atualizarPontoManual(
    pontoId: string,
    dados: Partial<FuncionarioPontoRecord>,
    adminNome: string,
  ): Promise<FuncionarioPontoRecord> {
    const payload: any = {
      ...dados,
      editado_por: adminNome,
    }
    if (dados.data) {
      payload.data = toPocketBaseDate(normalizarDataPonto(dados.data))
    }
    const atualizado = await pb
      .collection('funcionarios_pontos')
      .update<FuncionarioPontoRecord>(pontoId, payload)
    return {
      ...atualizado,
      data: normalizarDataPonto(atualizado.data),
    }
  },

  async excluirPonto(id: string): Promise<boolean> {
    return await pb.collection('funcionarios_pontos').delete(id)
  },

  // --- FOLHAS DE PAGAMENTO ---
  async listarFolhas(funcionarioId?: string): Promise<FuncionarioFolhaRecord[]> {
    const filter = funcionarioId ? `funcionario = "${funcionarioId}"` : ''
    return await pb.collection('funcionarios_folhas').getFullList<FuncionarioFolhaRecord>({
      filter,
      sort: '-periodo_fim',
      expand: 'funcionario',
    })
  },

  async buscarUltimaFolhaQuitada(funcionarioId: string): Promise<FuncionarioFolhaRecord | null> {
    try {
      const records = await pb
        .collection('funcionarios_folhas')
        .getFullList<FuncionarioFolhaRecord>({
          filter: `funcionario = "${funcionarioId}" && quitada = true`,
          sort: '-periodo_fim',
          limit: 1,
        })
      return records[0] || null
    } catch (_) {
      return null
    }
  },

  // --- CONFIRMAÇÕES DE ATIVIDADE DO FUNCIONÁRIO ---
  async listarConfirmacoes(params: {
    funcionarioId: string
    dataInicio?: string
    dataFim?: string
  }): Promise<FuncionarioConfirmacaoRecord[]> {
    if (!params.funcionarioId) return []
    const filters: string[] = [`funcionario = "${params.funcionarioId}"`]
    if (params.dataInicio) {
      const ini = normalizarDataPonto(params.dataInicio)
      filters.push(`data >= "${ini} 00:00:00"`)
    }
    if (params.dataFim) {
      const fim = normalizarDataPonto(params.dataFim)
      filters.push(`data <= "${fim} 23:59:59"`)
    }

    try {
      const records = await pb
        .collection('funcionarios_confirmacoes')
        .getFullList<FuncionarioConfirmacaoRecord>({
          filter: filters.join(' && '),
          sort: 'data',
        })

      return records.map((r) => ({
        ...r,
        data: normalizarDataPonto(r.data),
      }))
    } catch (err) {
      console.warn('Erro ao listar confirmações:', err)
      return []
    }
  },

  async buscarConfirmacaoPorData(
    funcionarioId: string,
    dataYYYYMMDD: string,
  ): Promise<FuncionarioConfirmacaoRecord | null> {
    if (!funcionarioId || !dataYYYYMMDD) return null
    const diaLimpo = normalizarDataPonto(dataYYYYMMDD)
    try {
      const filtro = `funcionario = "${funcionarioId}" && ${buildFiltroPontoData(diaLimpo)}`
      const rec = await pb
        .collection('funcionarios_confirmacoes')
        .getFirstListItem<FuncionarioConfirmacaoRecord>(filtro)
      return {
        ...rec,
        data: normalizarDataPonto(rec.data),
      }
    } catch {
      return null
    }
  },

  async confirmarDataTrabalhada(params: {
    funcionarioId: string
    data: string // YYYY-MM-DD
    divergencia?: boolean
    motivoDivergencia?: string
  }): Promise<FuncionarioConfirmacaoRecord> {
    const diaLimpo = normalizarDataPonto(params.data)
    const existente = await this.buscarConfirmacaoPorData(params.funcionarioId, diaLimpo)

    const payload = {
      funcionario: params.funcionarioId,
      data: toPocketBaseDate(diaLimpo),
      confirmado: !params.divergencia,
      confirmado_em: !params.divergencia ? new Date().toISOString() : null,
      divergencia_apontada: Boolean(params.divergencia),
      motivo_divergencia: params.motivoDivergencia || '',
    }

    if (existente) {
      const atualizado = await pb
        .collection('funcionarios_confirmacoes')
        .update<FuncionarioConfirmacaoRecord>(existente.id, payload)
      return {
        ...atualizado,
        data: normalizarDataPonto(atualizado.data),
      }
    }

    const criado = await pb
      .collection('funcionarios_confirmacoes')
      .create<FuncionarioConfirmacaoRecord>(payload)
    return {
      ...criado,
      data: normalizarDataPonto(criado.data),
    }
  },

  async fecharFolha(params: {
    funcionarioId: string
    periodoInicio: string
    periodoFim: string
    ganhoTotal: number
    descontos: any
    dividaSemanal: number
    aReceber: number
    quitada: boolean
    diasPendentes?: string[]
    observacoes?: string
    gerarLancamentoFinanceiro?: boolean
    contaId?: string
    categoriaId?: string
    usuarioNome?: string
  }): Promise<FuncionarioFolhaRecord> {
    let lancamentoId = ''

    // Se optou por gerar despesa no financeiro e há valor positivo a pagar
    if (params.gerarLancamentoFinanceiro && params.aReceber > 0 && params.contaId) {
      try {
        const descLancamento = `Pagamento Funcionário - ${params.periodoInicio} a ${params.periodoFim}`
        const novoLanc = await pb.collection('lancamentos').create({
          descricao: descLancamento,
          valor: params.aReceber,
          tipo: 'despesa',
          data: new Date().toISOString().split('T')[0],
          status: 'pago',
          conta: params.contaId,
          categoria: params.categoriaId || '',
          observacoes: `Quitação de folha de pagamento do colaborador`,
        })
        lancamentoId = novoLanc.id
      } catch (err) {
        console.warn('Erro ao gerar lançamento no financeiro:', err)
      }
    }

    // Criar a folha
    const agoraIso = new Date().toISOString()
    const folha = await pb.collection('funcionarios_folhas').create<FuncionarioFolhaRecord>({
      funcionario: params.funcionarioId,
      periodo_inicio: params.periodoInicio,
      periodo_fim: params.periodoFim,
      ganho_total: params.ganhoTotal,
      descontos: params.descontos,
      divida_semanal: params.dividaSemanal,
      a_receber: params.aReceber,
      quitada: params.quitada,
      data_quitacao: params.quitada ? agoraIso.split('T')[0] : null,
      lancamento_id: lancamentoId,
      observacoes: params.observacoes || '',
      notificacao_pagamento_enviada: params.quitada,
      notificacao_pagamento_em: params.quitada ? agoraIso : null,
      status_conferencia_colaborador: 'pendente',
      dias_pendentes_fechamento: params.diasPendentes || [],
    })

    // Se a folha for quitada, abater o saldo das dívidas envolvidas
    if (params.quitada && params.descontos?.dividas && Array.isArray(params.descontos.dividas)) {
      for (const d of params.descontos.dividas) {
        if (d.dividaId && d.valorAbatido > 0) {
          try {
            const divAtual = await pb
              .collection('funcionarios_dividas')
              .getOne<FuncionarioDividaRecord>(d.dividaId)
            const novoSaldo = Math.max(
              0,
              Math.round((divAtual.saldo_atual - d.valorAbatido) * 100) / 100,
            )
            await pb.collection('funcionarios_dividas').update(d.dividaId, {
              saldo_atual: novoSaldo,
              ativa: novoSaldo > 0,
            })
          } catch (err) {
            console.warn(`Erro ao abater saldo da dívida ${d.dividaId}:`, err)
          }
        }
      }
    }

    return folha
  },

  async confirmarConferenciaFolhaColaborador(params: {
    folhaId: string
    status: 'confirmado' | 'divergente'
    motivoDivergencia?: string
  }): Promise<FuncionarioFolhaRecord> {
    const agoraIso = new Date().toISOString()
    const payload: Partial<FuncionarioFolhaRecord> = {
      status_conferencia_colaborador: params.status,
      conferido_colaborador_em: agoraIso,
      motivo_divergencia_colaborador: params.motivoDivergencia || '',
    }
    return await pb
      .collection('funcionarios_folhas')
      .update<FuncionarioFolhaRecord>(params.folhaId, payload)
  },

  async buscarFolhaPendenteConferenciaColaborador(
    funcionarioId: string,
  ): Promise<FuncionarioFolhaRecord | null> {
    if (!funcionarioId) return null
    try {
      // Retorna a folha mais recente quitada que ainda está aguardando conferência do colaborador
      // ou a última quitada
      const records = await pb
        .collection('funcionarios_folhas')
        .getFullList<FuncionarioFolhaRecord>({
          filter: `funcionario = "${funcionarioId}" && quitada = true`,
          sort: '-periodo_fim',
          limit: 5,
        })

      // Procura primeiro alguma com status_conferencia_colaborador = 'pendente' ou 'divergente'
      const pendente = records.find(
        (f) => !f.status_conferencia_colaborador || f.status_conferencia_colaborador === 'pendente',
      )
      return pendente || records[0] || null
    } catch (err) {
      console.warn('Erro ao buscar folha para conferência do colaborador:', err)
      return null
    }
  },
}
