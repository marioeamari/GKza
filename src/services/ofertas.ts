import pb from '@/lib/pocketbase/client'
import type {
  DiaSemanaOferta,
  MovimentacaoCaixaOferta,
  OfertaVoluntaria,
  ResumoCaixaOfertas,
} from '@/types/domain'

export interface CreateOfertaVoluntariaInput {
  data: string
  valor: number
  direcionamento?: string
  descricao?: string
  recorrente?: boolean
  dia_semana?: DiaSemanaOferta
  regra_id?: string
  tipo?: 'voluntaria'
  contexto_tipo?: string
  lancar_no_caixa?: boolean
}

export interface UpdateOfertaVoluntariaInput {
  data?: string
  valor?: number
  direcionamento?: string
  descricao?: string
  recorrente?: boolean
  dia_semana?: DiaSemanaOferta
  regra_id?: string
  contexto_tipo?: string
}

export interface CreateMovimentacaoCaixaInput {
  tipo: 'entrada' | 'saida'
  data: string
  valor: number
  descricao?: string
  direcionamento?: string
  referencia_oferta?: string
}

const DIA_SEMANA_MAP: Record<DiaSemanaOferta, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
}

// Retorna todas as datas (YYYY-MM-DD) correspondentes a um dia da semana dentro do mês YYYY-MM
export function getDatasDiaSemanaNoMes(anoMes: string, diaSemana: DiaSemanaOferta): string[] {
  const [anoStr, mesStr] = anoMes.split('-')
  const ano = parseInt(anoStr, 10)
  const mes = parseInt(mesStr, 10) // 1 a 12
  const targetDay = DIA_SEMANA_MAP[diaSemana]

  const datas: string[] = []
  // Começa no dia 1 do mês
  const cur = new Date(Date.UTC(ano, mes - 1, 1, 12, 0, 0))
  while (cur.getUTCMonth() === mes - 1) {
    if (cur.getUTCDay() === targetDay) {
      const y = cur.getUTCFullYear()
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
      const d = String(cur.getUTCDate()).padStart(2, '0')
      datas.push(`${y}-${m}-${d}`)
    }
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return datas
}

export const ofertasService = {
  // Lista todas as ofertas voluntárias
  async listOfertasVoluntarias(filter?: string): Promise<OfertaVoluntaria[]> {
    return pb.collection('ofertas_voluntarias').getFullList<OfertaVoluntaria>({
      filter: filter || '',
      sort: 'data,created',
    })
  },

  // Busca ofertas do mês específico (YYYY-MM), e se houver regras recorrentes ativas, sincroniza
  async getOfertasMes(anoMes: string): Promise<OfertaVoluntaria[]> {
    // 1. Sincronizar ocorrências recorrentes para o mês solicitado
    await this.sincronizarRecorrenciasMes(anoMes)

    // 2. Buscar as ofertas daquele mês
    // Note que `data` no PB é ISO timestamp ou data prefixada
    const filtro = `data >= '${anoMes}-01' && data <= '${anoMes}-31 23:59:59'`
    return pb.collection('ofertas_voluntarias').getFullList<OfertaVoluntaria>({
      filter: filtro,
      sort: 'data,created',
    })
  },

  // Sincroniza regras recorrentes para o mês de forma idempotente
  // Importante: NÃO ressuscita ocorrências excluídas ou meses após o cancelamento da regra
  async sincronizarRecorrenciasMes(anoMes: string): Promise<void> {
    try {
      // Busca todas as ocorrências recorrentes existentes com regra_id
      const todasRecorrentes = await pb
        .collection('ofertas_voluntarias')
        .getFullList<OfertaVoluntaria>({
          filter: "recorrente = true && dia_semana != '' && regra_id != ''",
          sort: '-data',
        })

      // Agrupa por regra_id para obter a definição de cada regra e o histórico de datas existentes
      const regrasDef = new Map<string, OfertaVoluntaria>()
      const datasPorRegra = new Map<string, Set<string>>()
      const minDataPorRegra = new Map<string, string>()

      for (const of of todasRecorrentes) {
        if (!of.regra_id) continue
        if (!regrasDef.has(of.regra_id)) {
          regrasDef.set(of.regra_id, of)
        }
        const setDatas = datasPorRegra.get(of.regra_id) || new Set<string>()
        const dataDia = of.data ? of.data.slice(0, 10) : ''
        if (dataDia) {
          setDatas.add(dataDia)
          const minAtual = minDataPorRegra.get(of.regra_id)
          if (!minAtual || dataDia < minAtual) {
            minDataPorRegra.set(of.regra_id, dataDia)
          }
        }
        datasPorRegra.set(of.regra_id, setDatas)
      }

      for (const [regraId, def] of regrasDef.entries()) {
        if (!def.dia_semana) continue

        // Se uma regra foi criada com data inicial posterior a este mês, não antecipa
        const minData = minDataPorRegra.get(regraId)
        if (minData && minData.slice(0, 7) > anoMes) {
          continue
        }

        const datasJaCriadas = datasPorRegra.get(regraId) || new Set<string>()

        // Se para este mês já existe ao menos 1 registro da regra, não autocompleta datas ausentes
        // para respeitar ocorrências pontuais que o usuário deletou intencionalmente naquele mês!
        const temRegistroNoMes = Array.from(datasJaCriadas).some((d) => d.startsWith(anoMes))
        if (temRegistroNoMes) {
          continue
        }

        // Se o mês ainda não tem nenhuma ocorrência dessa regra, verifica se a regra é ativa
        // (existe alguma ocorrência no mês atual ou meses futuros da regra).
        // Se a regra não tem nenhuma ocorrência >= anoMes, significa que foi encerrada/excluída deste ponto em diante!
        const temOcorrenciasFuturasOuPresentes = Array.from(datasJaCriadas).some(
          (d) => d.slice(0, 7) >= anoMes,
        )
        if (!temOcorrenciasFuturasOuPresentes) {
          // Regra foi encerrada antes ou neste mês
          continue
        }

        const datasEsperadas = getDatasDiaSemanaNoMes(anoMes, def.dia_semana)

        // Verifica se a matriz/regra gerava caixa
        let geraCaixa = false
        try {
          const caixaMatriz = await pb.collection('caixa_ofertas').getList(1, 1, {
            filter: `referencia_oferta.regra_id = '${regraId}'`,
          })
          geraCaixa = caixaMatriz.totalItems > 0
        } catch (_) {
          geraCaixa = false
        }

        for (const dataStr of datasEsperadas) {
          if (!datasJaCriadas.has(dataStr)) {
            // Cria a ocorrência para este dia
            const nova = await pb.collection('ofertas_voluntarias').create<OfertaVoluntaria>({
              data: `${dataStr} 12:00:00`,
              valor: def.valor,
              direcionamento: def.direcionamento || '',
              descricao: def.descricao || '',
              recorrente: true,
              dia_semana: def.dia_semana,
              regra_id: regraId,
              tipo: 'voluntaria',
              contexto_tipo: def.contexto_tipo || 'pessoal',
            })

            datasJaCriadas.add(dataStr)

            if (geraCaixa) {
              await pb.collection('caixa_ofertas').create({
                tipo: 'entrada',
                data: `${dataStr} 12:00:00`,
                valor: def.valor,
                descricao: def.descricao || `Oferta voluntária recorrente (${def.dia_semana})`,
                direcionamento: def.direcionamento || '',
                referencia_oferta: nova.id,
              })
            }
          }
        }
      }
    } catch (err) {
      console.warn('Aviso ao sincronizar ofertas recorrentes:', err)
    }
  },

  // Cria uma oferta voluntária (avulsa ou recorrente)
  async createOfertaVoluntaria(input: CreateOfertaVoluntariaInput): Promise<OfertaVoluntaria> {
    const isRecorrente = Boolean(input.recorrente && input.dia_semana)
    const regraId = isRecorrente
      ? `regra_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      : ''

    const dataHora =
      input.data.includes(' ') || input.data.includes('T') ? input.data : `${input.data} 12:00:00`

    if (!isRecorrente) {
      // Oferta simples
      const oferta = await pb.collection('ofertas_voluntarias').create<OfertaVoluntaria>({
        data: dataHora,
        valor: input.valor,
        direcionamento: input.direcionamento || '',
        descricao: input.descricao || '',
        recorrente: false,
        tipo: 'voluntaria',
        contexto_tipo: input.contexto_tipo || 'pessoal',
      })

      if (input.lancar_no_caixa) {
        await pb.collection('caixa_ofertas').create({
          tipo: 'entrada',
          data: dataHora,
          valor: input.valor,
          descricao: input.descricao || 'Oferta voluntária',
          direcionamento: input.direcionamento || '',
          referencia_oferta: oferta.id,
        })
      }

      return oferta
    }

    // Oferta recorrente:
    // Cria a primeira ocorrência / matriz com a regra_id
    const anoMes = input.data.slice(0, 7)
    const diasMes = getDatasDiaSemanaNoMes(anoMes, input.dia_semana!)

    // Certifique-se de que a data selecionada ou o primeiro dia da recorrência seja usado
    const ofertaCriada = await pb.collection('ofertas_voluntarias').create<OfertaVoluntaria>({
      data: dataHora,
      valor: input.valor,
      direcionamento: input.direcionamento || '',
      descricao: input.descricao || '',
      recorrente: true,
      dia_semana: input.dia_semana,
      regra_id: regraId,
      tipo: 'voluntaria',
      contexto_tipo: input.contexto_tipo || 'pessoal',
    })

    if (input.lancar_no_caixa) {
      await pb.collection('caixa_ofertas').create({
        tipo: 'entrada',
        data: dataHora,
        valor: input.valor,
        descricao: input.descricao || `Oferta voluntária (${input.dia_semana})`,
        direcionamento: input.direcionamento || '',
        referencia_oferta: ofertaCriada.id,
      })
    }

    // Gera os demais dias do mês selecionado
    const dataBaseStr = input.data.slice(0, 10)
    for (const d of diasMes) {
      if (d !== dataBaseStr) {
        const item = await pb.collection('ofertas_voluntarias').create<OfertaVoluntaria>({
          data: `${d} 12:00:00`,
          valor: input.valor,
          direcionamento: input.direcionamento || '',
          descricao: input.descricao || '',
          recorrente: true,
          dia_semana: input.dia_semana,
          regra_id: regraId,
          tipo: 'voluntaria',
          contexto_tipo: input.contexto_tipo || 'pessoal',
        })

        if (input.lancar_no_caixa) {
          await pb.collection('caixa_ofertas').create({
            tipo: 'entrada',
            data: `${d} 12:00:00`,
            valor: input.valor,
            descricao: input.descricao || `Oferta voluntária (${input.dia_semana})`,
            direcionamento: input.direcionamento || '',
            referencia_oferta: item.id,
          })
        }
      }
    }

    return ofertaCriada
  },

  // Atualiza uma oferta individual
  async updateOfertaVoluntaria(
    id: string,
    input: UpdateOfertaVoluntariaInput,
  ): Promise<OfertaVoluntaria> {
    const data: Record<string, unknown> = {}
    if (input.data !== undefined) {
      data.data =
        input.data.includes(' ') || input.data.includes('T') ? input.data : `${input.data} 12:00:00`
    }
    if (input.valor !== undefined) data.valor = input.valor
    if (input.direcionamento !== undefined) data.direcionamento = input.direcionamento
    if (input.descricao !== undefined) data.descricao = input.descricao
    if (input.contexto_tipo !== undefined) data.contexto_tipo = input.contexto_tipo

    const updated = await pb.collection('ofertas_voluntarias').update<OfertaVoluntaria>(id, data)

    // Se houver movimentação correspondente no caixa, sincroniza valor/direcionamento/descrição
    try {
      const caixaItens = await pb.collection('caixa_ofertas').getFullList<MovimentacaoCaixaOferta>({
        filter: `referencia_oferta = '${id}'`,
      })
      for (const cx of caixaItens) {
        await pb.collection('caixa_ofertas').update(cx.id, {
          valor: updated.valor,
          direcionamento: updated.direcionamento || '',
          descricao: updated.descricao || cx.descricao,
          data: updated.data,
        })
      }
    } catch (err) {
      console.warn('Erro ao atualizar caixa vinculado:', err)
    }

    return updated
  },

  // Exclui uma oferta voluntária pontual (e remove qualquer movimentação vinculada no caixa)
  async deleteOfertaVoluntaria(id: string): Promise<void> {
    // 1. Remover movimentações vinculadas no caixa se existirem
    try {
      const caixaItens = await pb.collection('caixa_ofertas').getFullList<MovimentacaoCaixaOferta>({
        filter: `referencia_oferta = '${id}'`,
      })
      for (const cx of caixaItens) {
        try {
          await pb.collection('caixa_ofertas').delete(cx.id)
        } catch (err) {
          console.warn(`Erro ao excluir movimentação ${cx.id} do caixa:`, err)
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar movimentações vinculadas no caixa de ofertas:', err)
    }

    // 2. Excluir a oferta voluntária
    await pb.collection('ofertas_voluntarias').delete(id)
  },

  // Exclui todas as ocorrências de uma regra recorrente (ou a partir de uma data de referência)
  // e remove todas as movimentações no caixa correspondentes
  async deleteRegraRecorrente(
    regraId: string,
    options?: { aPartirDeData?: string; apenasFuturas?: boolean },
  ): Promise<{ ofertasRemovidas: number; caixaRemovidos: number }> {
    if (!regraId) {
      return { ofertasRemovidas: 0, caixaRemovidos: 0 }
    }

    let filtroOfertas = `regra_id = '${regraId}'`
    if (options?.aPartirDeData) {
      filtroOfertas += ` && data >= '${options.aPartirDeData}'`
    }

    const ofertas = await pb.collection('ofertas_voluntarias').getFullList<OfertaVoluntaria>({
      filter: filtroOfertas,
    })

    let ofertasRemovidas = 0
    let caixaRemovidos = 0

    // Para cada oferta a remover, limpar o caixa correspondente
    for (const of of ofertas) {
      try {
        const caixaItens = await pb
          .collection('caixa_ofertas')
          .getFullList<MovimentacaoCaixaOferta>({
            filter: `referencia_oferta = '${of.id}'`,
          })
        for (const cx of caixaItens) {
          try {
            await pb.collection('caixa_ofertas').delete(cx.id)
            caixaRemovidos++
          } catch (cxErr) {
            console.warn(`Erro ao excluir caixa ${cx.id}:`, cxErr)
          }
        }
      } catch (err) {
        console.warn(`Erro ao consultar caixa para oferta ${of.id}:`, err)
      }

      try {
        await pb.collection('ofertas_voluntarias').delete(of.id)
        ofertasRemovidas++
      } catch (ofErr) {
        console.warn(`Erro ao excluir oferta ${of.id}:`, ofErr)
      }
    }

    return { ofertasRemovidas, caixaRemovidos }
  },

  // Vincula / lança uma oferta voluntária existente no caixa
  async lancarOfertaNoCaixa(oferta: OfertaVoluntaria): Promise<MovimentacaoCaixaOferta> {
    // Verifica se já está no caixa
    const existentes = await pb.collection('caixa_ofertas').getList<MovimentacaoCaixaOferta>(1, 1, {
      filter: `referencia_oferta = '${oferta.id}'`,
    })
    if (existentes.totalItems > 0) {
      return existentes.items[0]
    }

    return pb.collection('caixa_ofertas').create<MovimentacaoCaixaOferta>({
      tipo: 'entrada',
      data: oferta.data,
      valor: oferta.valor,
      descricao: oferta.descricao || 'Oferta voluntária',
      direcionamento: oferta.direcionamento || '',
      referencia_oferta: oferta.id,
    })
  },

  // Remove lançamento do caixa vinculado a uma oferta
  async removerOfertaDoCaixa(ofertaId: string): Promise<void> {
    const existentes = await pb.collection('caixa_ofertas').getFullList<MovimentacaoCaixaOferta>({
      filter: `referencia_oferta = '${ofertaId}'`,
    })
    for (const item of existentes) {
      await pb.collection('caixa_ofertas').delete(item.id)
    }
  },

  // ==========================================
  // CAIXA DE OFERTAS
  // ==========================================

  // Lista movimentações do caixa do mês com expansão da oferta voluntária
  async listMovimentacoesMes(anoMes: string): Promise<MovimentacaoCaixaOferta[]> {
    const filtro = `data >= '${anoMes}-01' && data <= '${anoMes}-31 23:59:59'`
    return pb.collection('caixa_ofertas').getFullList<MovimentacaoCaixaOferta>({
      filter: filtro,
      sort: 'data,created',
      expand: 'referencia_oferta',
    })
  },

  // Lista todas as movimentações de todos os tempos para cálculo do saldo acumulado
  async getResumoCaixa(anoMes: string): Promise<ResumoCaixaOfertas> {
    const todas = await pb.collection('caixa_ofertas').getFullList<MovimentacaoCaixaOferta>({
      sort: 'data,created',
    })

    let totalEntradasMes = 0
    let totalSaidasMes = 0
    let saldoAcumuladoGeral = 0

    for (const mov of todas) {
      const v = mov.valor || 0
      if (mov.tipo === 'entrada') {
        saldoAcumuladoGeral += v
        if (mov.data.startsWith(anoMes)) {
          totalEntradasMes += v
        }
      } else {
        saldoAcumuladoGeral -= v
        if (mov.data.startsWith(anoMes)) {
          totalSaidasMes += v
        }
      }
    }

    return {
      totalEntradasMes,
      totalSaidasMes,
      saldoMes: totalEntradasMes - totalSaidasMes,
      saldoAcumuladoGeral,
    }
  },

  // Cria movimentação manual no caixa (Entrada avulsa ou Saída/Utilização)
  async createMovimentacaoCaixa(
    input: CreateMovimentacaoCaixaInput,
  ): Promise<MovimentacaoCaixaOferta> {
    const dataHora =
      input.data.includes(' ') || input.data.includes('T') ? input.data : `${input.data} 12:00:00`
    return pb.collection('caixa_ofertas').create<MovimentacaoCaixaOferta>({
      tipo: input.tipo,
      data: dataHora,
      valor: input.valor,
      descricao: input.descricao || '',
      direcionamento: input.direcionamento || '',
      referencia_oferta: input.referencia_oferta || null,
    })
  },

  // Exclui movimentação do caixa
  async deleteMovimentacaoCaixa(id: string): Promise<void> {
    await pb.collection('caixa_ofertas').delete(id)
  },
}
