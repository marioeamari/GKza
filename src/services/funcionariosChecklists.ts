import pb from '@/lib/pocketbase/client'
import { getLocalDateStr, toPocketBaseDate, dateOnly } from '@/lib/format'
import {
  checklistAplicaAoDia,
  checklistVigeNoCheckIn,
  contarItensPendentes,
  horaAtualSP,
  validarOrigemMarcacaoChecklist,
  type ChecklistItemExecucao,
  type PeriodoChecklist,
} from '@/lib/funcionariosChecklists'

export interface FuncionarioFuncaoRecord {
  id: string
  nome: string
  created?: string
  updated?: string
}

export interface FuncionarioChecklistRecord {
  id: string
  nome: string
  periodo: PeriodoChecklist
  dia_semana?: number
  dia_mes?: number
  itens: ChecklistItemTemplate[]
  funcoes: string[]
  created?: string
  updated?: string
  expand?: {
    funcoes?: FuncionarioFuncaoRecord[]
  }
}

export interface FuncionarioChecklistExecucaoRecord {
  id: string
  funcionario: string
  checklist: string
  data: string // YYYY-MM-DD
  itens: ChecklistItemExecucao[]
  observacao?: string
  created?: string
  updated?: string
  expand?: {
    checklist?: FuncionarioChecklistRecord
    funcionario?: { id: string; nome: string }
  }
}

export interface ChecklistItemTemplate {
  texto: string
}

export const funcionariosChecklistsService = {
  // --- FUNÇÕES ---
  async listarFuncoes(): Promise<FuncionarioFuncaoRecord[]> {
    return await pb.collection('funcionarios_funcoes').getFullList<FuncionarioFuncaoRecord>({
      sort: 'nome',
    })
  },

  async criarFuncao(nome: string): Promise<FuncionarioFuncaoRecord> {
    return await pb.collection('funcionarios_funcoes').create<FuncionarioFuncaoRecord>({
      nome: nome.trim(),
    })
  },

  async atualizarFuncao(id: string, nome: string): Promise<FuncionarioFuncaoRecord> {
    return await pb.collection('funcionarios_funcoes').update<FuncionarioFuncaoRecord>(id, {
      nome: nome.trim(),
    })
  },

  async excluirFuncao(id: string): Promise<void> {
    await pb.collection('funcionarios_funcoes').delete(id)
  },

  // --- CHECKLISTS ---
  async listarChecklists(): Promise<FuncionarioChecklistRecord[]> {
    return await pb.collection('funcionarios_checklists').getFullList<FuncionarioChecklistRecord>({
      sort: '-created',
      expand: 'funcoes',
    })
  },

  async criarChecklist(dados: {
    nome: string
    periodo: PeriodoChecklist
    dia_semana?: number
    dia_mes?: number
    itens: ChecklistItemTemplate[]
    funcoes: string[]
  }): Promise<FuncionarioChecklistRecord> {
    return await pb.collection('funcionarios_checklists').create<FuncionarioChecklistRecord>(dados)
  },

  async atualizarChecklist(
    id: string,
    dados: {
      nome?: string
      periodo?: PeriodoChecklist
      dia_semana?: number
      dia_mes?: number
      itens?: ChecklistItemTemplate[]
      funcoes?: string[]
    },
  ): Promise<FuncionarioChecklistRecord> {
    return await pb
      .collection('funcionarios_checklists')
      .update<FuncionarioChecklistRecord>(id, dados)
  },

  async excluirChecklist(id: string): Promise<void> {
    await pb.collection('funcionarios_checklists').delete(id)
  },

  // --- VÍNCULO FUNCIONÁRIO → FUNÇÕES ---
  async funcoesDoFuncionario(funcionarioId: string): Promise<string[]> {
    const func = await pb
      .collection('funcionarios')
      .getOne<{ id: string; funcoes?: string[] }>(funcionarioId)
    return func.funcoes || []
  },

  /**
   * Checklists válidos para o funcionário naquele dia/período:
   * interseção funções do funcionário × funções do checklist + vigência do dia
   * + janela manhã/tarde resolvida pela hora da entrada (check-in).
   */
  async checklistsDoDia(
    funcionarioId: string,
    dataYYYYMMDD?: string,
    horaEntrada?: string,
  ): Promise<FuncionarioChecklistRecord[]> {
    const dia = dateOnly(dataYYYYMMDD || getLocalDateStr())
    const funcoesIds = await this.funcoesDoFuncionario(funcionarioId)
    if (funcoesIds.length === 0) return []

    const todos = await this.listarChecklists()
    return todos.filter(
      (cl) =>
        (cl.funcoes || []).some((f) => funcoesIds.includes(f)) &&
        checklistAplicaAoDia(cl, dia) &&
        checklistVigeNoCheckIn(cl, horaEntrada),
    )
  },

  // --- EXECUÇÕES (nascem só no check-in; idempotentes por funcionário+checklist+data) ---
  async listarExecucoes(params?: {
    funcionarioId?: string
    dataInicio?: string
    dataFim?: string
  }): Promise<FuncionarioChecklistExecucaoRecord[]> {
    const filters: string[] = []
    if (params?.funcionarioId) filters.push(`funcionario = "${params.funcionarioId}"`)
    if (params?.dataInicio) filters.push(`data >= "${dateOnly(params.dataInicio)} 00:00:00"`)
    if (params?.dataFim) filters.push(`data <= "${dateOnly(params.dataFim)} 23:59:59"`)

    const registros = await pb
      .collection('funcionarios_checklist_execucoes')
      .getFullList<FuncionarioChecklistExecucaoRecord>({
        filter: filters.join(' && '),
        sort: '-data,-created',
        expand: 'checklist,funcionario',
      })
    return registros.map((r) => ({ ...r, data: dateOnly(r.data) }))
  },

  async buscarExecucaoDoDia(
    funcionarioId: string,
    checklistId: string,
    dataYYYYMMDD?: string,
  ): Promise<FuncionarioChecklistExecucaoRecord | null> {
    const dia = dateOnly(dataYYYYMMDD || getLocalDateStr())
    const execucoes = await this.listarExecucoes({
      funcionarioId,
      dataInicio: dia,
      dataFim: dia,
    })
    return execucoes.find((e) => e.checklist === checklistId) || null
  },

  /**
   * Garante a execução do dia (idempotente). Criada PREGUIÇOSAMENTE: só é
   * chamada quando o funcionário marca o primeiro item — dia sem ponto/check-in
   * não gera execução (sem atraso fantasma).
   */
  async garantirExecucao(
    funcionarioId: string,
    checklist: Pick<FuncionarioChecklistRecord, 'id' | 'itens'>,
    dataYYYYMMDD?: string,
  ): Promise<FuncionarioChecklistExecucaoRecord> {
    const existente = await this.buscarExecucaoDoDia(funcionarioId, checklist.id, dataYYYYMMDD)
    if (existente) return existente

    const criada = await pb
      .collection('funcionarios_checklist_execucoes')
      .create<FuncionarioChecklistExecucaoRecord>({
        funcionario: funcionarioId,
        checklist: checklist.id,
        data: toPocketBaseDate(dateOnly(dataYYYYMMDD || getLocalDateStr())),
        itens: (checklist.itens || []).map((i) => ({
          texto: i.texto,
          marcado: false,
        })),
      })
    return { ...criada, data: dateOnly(criada.data) }
  },

  /**
   * Marca/desmarca um item da execução gravando o horário (HH:mm).
   * REGRA: exige origem válida do ponto — 'estacao_qr' ou 'admin'. Sem QR da
   * estação a marcação é RECUSADA com o aviso padrão.
   */
  async marcarItem(
    execucaoId: string,
    itensAtuais: ChecklistItemExecucao[],
    index: number,
    origem: 'estacao_qr' | 'fora_do_local' | 'manual' | 'admin',
  ): Promise<FuncionarioChecklistExecucaoRecord> {
    validarOrigemMarcacaoChecklist(origem)

    const itens = (itensAtuais || []).map((item, i) => {
      if (i !== index) return item
      if (item.marcado) return { ...item, marcado: false, horario: undefined }
      return { ...item, marcado: true, horario: horaAtualSP() }
    })

    const atualizada = await pb
      .collection('funcionarios_checklist_execucoes')
      .update<FuncionarioChecklistExecucaoRecord>(execucaoId, { itens })
    return { ...atualizada, data: dateOnly(atualizada.data) }
  },

  /**
   * Quantidade de itens pendentes no dia (usada no aviso de saída — apenas
   * avisa, nunca bloqueia).
   */
  async contarItensPendentesDoDia(funcionarioId: string, dataYYYYMMDD?: string): Promise<number> {
    const dia = dateOnly(dataYYYYMMDD || getLocalDateStr())
    const execucoes = await this.listarExecucoes({
      funcionarioId,
      dataInicio: dia,
      dataFim: dia,
    })
    return execucoes.reduce((total, exec) => total + contarItensPendentes(exec.itens), 0)
  },
}
