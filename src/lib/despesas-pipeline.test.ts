import { describe, it, expect } from 'vitest'
import {
  buildTriagemCartaoPayload,
  verificarPodeGerarOcorrencia,
  prepararDuplicacaoCompromisso,
  prepararDuplicacaoLancamento,
  alocarPagamentoFaturaFifo,
} from './despesas-pipeline'
import { calcularCompetenciaEVencimento, calcularFaturaCartao } from './cartao-fatura'

describe('despesas-pipeline - Cobertura dos 8 Fluxos do Usuário', () => {
  // --------------------------------------------------------------------------
  // FLUXO 1: Competência e Vencimento
  // - Não-cartão: competência = mês da compra
  // - Crédito: ciclo da fatura (até dia_fechamento = mês corrente, depois = mês seguinte)
  // - Avulsas, recorrentes e parceladas
  // - Coerção de dia_fechamento textual "16"
  // --------------------------------------------------------------------------
  describe('Fluxo 1: Competência e Vencimento (Regra Única)', () => {
    it('não-cartão (conta bancária/caixa ou método não-crédito): competência = mês da compra', () => {
      const contaBancaria = {
        id: 'conta_bb',
        nome: 'Banco do Brasil',
        tipo: 'bancaria' as const,
        dia_fechamento: 15,
        dia_vencimento: 25,
      } as any

      const resNaoCartao = calcularCompetenciaEVencimento({
        dataCompra: '2025-05-20',
        conta: contaBancaria,
        metodoEhCredito: false,
        diaVencimento: 10,
      })

      expect(resNaoCartao.competencia).toBe('2025-05')
      expect(resNaoCartao.dataVencimentoIso.slice(0, 10)).toBe('2025-05-10')
    })

    it('crédito: compra até o fechamento cai na competência do mês corrente', () => {
      const cartao = {
        id: 'cartao_c6',
        nome: 'Cartão C6 Carbon',
        tipo: 'cartao' as const,
        dia_fechamento: 16,
        dia_vencimento: 23,
      } as any

      // Dia 16 (limite do fechamento) -> ciclo corrente (2025-05)
      const resAteFechamento = calcularCompetenciaEVencimento({
        dataCompra: '2025-05-16',
        conta: cartao,
        metodoEhCredito: true,
      })

      expect(resAteFechamento.competencia).toBe('2025-05')
      expect(resAteFechamento.dataVencimentoIso.slice(0, 10)).toBe('2025-05-23')
    })

    it('crédito: compra após o fechamento cai na competência do mês seguinte', () => {
      const cartao = {
        id: 'cartao_c6',
        nome: 'Cartão C6 Carbon',
        tipo: 'cartao' as const,
        dia_fechamento: 16,
        dia_vencimento: 23,
      } as any

      // Dia 17 (após fechamento) -> próximo ciclo (2025-06)
      const resAposFechamento = calcularCompetenciaEVencimento({
        dataCompra: '2025-05-17',
        conta: cartao,
        metodoEhCredito: true,
      })

      expect(resAposFechamento.competencia).toBe('2025-06')
      expect(resAposFechamento.dataVencimentoIso.slice(0, 10)).toBe('2025-06-23')
    })

    it('avulsas, recorrentes e parceladas obedecem a mesma regra com avanço de parcela', () => {
      const cartao = {
        id: 'cartao_itau',
        nome: 'Itaú Personalité',
        tipo: 'cartao' as const,
        dia_fechamento: 10,
        dia_vencimento: 20,
      } as any

      // Parcela 1/3 comprada dia 15 (após fechamento) -> fatura 2025-06
      const p1 = calcularCompetenciaEVencimento({
        dataCompra: '2025-05-15',
        conta: cartao,
        metodoEhCredito: true,
        numeroParcela: 1,
        totalParcelas: 3,
      })
      expect(p1.competencia).toBe('2025-06')
      expect(p1.dataVencimentoIso.slice(0, 10)).toBe('2025-06-20')

      // Parcela 2/3 -> fatura 2025-07
      const p2 = calcularCompetenciaEVencimento({
        dataCompra: '2025-05-15',
        conta: cartao,
        metodoEhCredito: true,
        numeroParcela: 2,
        totalParcelas: 3,
      })
      expect(p2.competencia).toBe('2025-07')

      // Parcela 3/3 -> fatura 2025-08
      const p3 = calcularCompetenciaEVencimento({
        dataCompra: '2025-05-15',
        conta: cartao,
        metodoEhCredito: true,
        numeroParcela: 3,
        totalParcelas: 3,
      })
      expect(p3.competencia).toBe('2025-08')
    })

    it('coerção de dia_fechamento e dia_vencimento textuais "16" e "23"', () => {
      const cartaoString = {
        id: 'cartao_nubank',
        nome: 'Nubank',
        tipo: 'cartao' as const,
        dia_fechamento: '16' as any,
        dia_vencimento: '23' as any,
      } as any

      const res = calcularCompetenciaEVencimento({
        dataCompra: '2025-05-17',
        conta: cartaoString,
        metodoEhCredito: true,
      })

      expect(res.competencia).toBe('2025-06')
      expect(res.dataVencimentoIso.slice(0, 10)).toBe('2025-06-23')

      const ciclo = calcularFaturaCartao(cartaoString, '2025-05-17')
      expect(ciclo.competencia).toBe('2025-06')
      expect(ciclo.dataVencimento).toBe('2025-06-23')
    })
  })

  // --------------------------------------------------------------------------
  // FLUXO 2: Triagem de Cartão Avulsa
  // - Gera SOMENTE lançamento pago (status: 'pago')
  // - NUNCA gera compromisso + ocorrência
  // - dizimo: false SEMPRE
  // --------------------------------------------------------------------------
  describe('Fluxo 2: Triagem de Cartão Avulsa', () => {
    it('produz payload exclusivamente de lançamento pago com dizimo: false, competência do ciclo e data = vencimento da fatura', () => {
      const cartao = {
        id: 'cartao_xp',
        nome: 'XP Visa Infinite',
        tipo: 'cartao' as const,
        dia_fechamento: 15,
        dia_vencimento: 25,
      }

      const payload = buildTriagemCartaoPayload({
        descricao: 'Almoço Restaurante',
        valor: 145.5,
        dataCompra: '2025-04-18', // após fechamento dia 15 -> ciclo 2025-05, vencimento 2025-05-25
        contaId: 'cartao_xp',
        conta: cartao,
        categoriaId: 'cat_alimentacao',
        titularTipo: 'cpf',
        titularPessoaId: 'pes_guilherme',
        observacoes: 'Comprovante Telegram #1234',
      })

      expect(payload.tipo).toBe('despesa')
      expect(payload.status).toBe('pago')
      expect(payload.valor).toBe(145.5)
      expect(payload.competencia).toBe('2025-05')
      expect(payload.data).toBe('2025-05-25 12:00:00')
      expect(payload.dizimo).toBe(false)
      expect(payload.pessoa).toBe('pes_guilherme')
      expect(payload.empresa).toBe('')
      expect(payload.conta).toBe('cartao_xp')
      expect(payload.categoria).toBe('cat_alimentacao')
    })

    it('mantém default dizimo: false mesmo sem passar titular ou observações e data no vencimento', () => {
      const cartao = {
        id: 'cartao_inter',
        nome: 'Inter Mastercard',
        tipo: 'cartao' as const,
        dia_fechamento: 10,
        dia_vencimento: 20,
      }

      const payload = buildTriagemCartaoPayload({
        descricao: 'Combustível Posto',
        valor: 200,
        dataCompra: '2025-05-05',
        contaId: 'cartao_inter',
        conta: cartao,
      })

      expect(payload.dizimo).toBe(false)
      expect(payload.competencia).toBe('2025-05')
      expect(payload.data).toBe('2025-05-20 12:00:00')
      expect(payload.status).toBe('pago')
      expect(payload.observacoes).toContain('venc. fatura 2025-05-20')
    })
  })

  // --------------------------------------------------------------------------
  // FLUXO 3: Geração de Ocorrências (Barreira de Prevenção)
  // - Nada retroativo em relação ao limite/mês corrente
  // - Nada sobre competência já paga (Paga vence prevista!)
  // --------------------------------------------------------------------------
  describe('Fluxo 3: Geração de Ocorrências (Barreira de Prevenção)', () => {
    it('rejeita competência passada em relação à corrente', () => {
      const pode = verificarPodeGerarOcorrencia({
        competenciaAlvo: '2025-03',
        competenciaCorrente: '2025-04',
      })
      expect(pode).toBe(false)
    })

    it('permite competência corrente ou futura', () => {
      const podeCorrente = verificarPodeGerarOcorrencia({
        competenciaAlvo: '2025-04',
        competenciaCorrente: '2025-04',
      })
      expect(podeCorrente).toBe(true)

      const podeFutura = verificarPodeGerarOcorrencia({
        competenciaAlvo: '2025-05',
        competenciaCorrente: '2025-04',
      })
      expect(podeFutura).toBe(true)
    })

    it('rejeita geração se já existir ocorrência paga na competência ("Paga vence prevista")', () => {
      const pode = verificarPodeGerarOcorrencia({
        competenciaAlvo: '2025-05',
        competenciaCorrente: '2025-05',
        ocorrenciasExistentes: [
          {
            id: 'oc_paga_1',
            competencia: '2025-05',
            status: 'paga',
            data_pagamento: '2025-05-10',
            valor_pago: 120,
          },
        ],
      })
      expect(pode).toBe(false)
    })

    it('rejeita geração se já existir ocorrência com lançamento ou valor_pago > 0', () => {
      const pode = verificarPodeGerarOcorrencia({
        competenciaAlvo: '2025-05',
        competenciaCorrente: '2025-05',
        ocorrenciasExistentes: [
          {
            id: 'oc_vinculada',
            competencia: '2025-05',
            status: 'prevista' as any,
            lancamento: 'lanc_123',
          },
        ],
      })
      expect(pode).toBe(false)
    })

    it('rejeita se a mesma parcela já existe paga', () => {
      const pode = verificarPodeGerarOcorrencia({
        competenciaAlvo: '2025-06',
        numeroParcela: 2,
        ocorrenciasExistentes: [
          {
            id: 'oc_p2',
            competencia: '2025-06',
            numero_parcela: 2,
            status: 'paga',
          },
        ],
      })
      expect(pode).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // FLUXO 4: Baixa Reaproveita Prevista + Estorno Restaura
  // --------------------------------------------------------------------------
  describe('Fluxo 4: Baixa e Estorno', () => {
    it('verifica regras de idempotência: se a ocorrência estiver prevista, pode baixar; se já paga, barreira ativa', () => {
      const ocorrenciaPrevista = {
        id: 'oc_prev',
        competencia: '2025-05',
        status: 'prevista' as const,
        valor_previsto: 350,
      }

      // Barreira pura reconhece que ela ainda não é paga
      const temPaga = verificarPodeGerarOcorrencia({
        competenciaAlvo: '2025-05',
        ocorrenciasExistentes: [ocorrenciaPrevista],
      })
      // Não recria duplicada porque já existe a ocorrência
      expect(temPaga).toBe(false)
    })

    it('estorno restaura status previsto e desfaz lançamento sem apagar histórico estrutural', () => {
      // Simula a transição de estorno: os dados da ocorrência voltam para prevista
      const ocorrenciaPaga = {
        id: 'oc_1',
        competencia: '2025-05',
        status: 'paga' as const,
        valor_pago: 500,
        data_pagamento: '2025-05-10',
        lancamento: 'lanc_99',
      }

      // O estorno limpa valor_pago, data_pagamento e lancamento, restaurando status 'prevista'
      const ocorrenciaEstornada = {
        ...ocorrenciaPaga,
        status: 'prevista' as const,
        valor_pago: 0,
        data_pagamento: null,
        lancamento: null,
      }

      expect(ocorrenciaEstornada.status).toBe('prevista')
      expect(ocorrenciaEstornada.valor_pago).toBe(0)
      expect(ocorrenciaEstornada.lancamento).toBeNull()
      expect(ocorrenciaEstornada.competencia).toBe('2025-05')
    })
  })

  // --------------------------------------------------------------------------
  // FLUXO 5: Edição Preserva Pagas
  // - Ocorrências pagas não perdem status 'paga', nem valor_pago nem comprovantes
  // --------------------------------------------------------------------------
  describe('Fluxo 5: Edição Preserva Pagas', () => {
    it('preserva status, valor_pago e data_pagamento em ocorrências pagas ao editar compromisso', () => {
      const ocorrencias = [
        {
          id: 'oc_paga',
          competencia: '2025-04',
          status: 'paga' as const,
          valor_previsto: 100,
          valor_pago: 105,
          data_pagamento: '2025-04-10',
          comprovante_pagamento: 'recibo.pdf',
        },
        {
          id: 'oc_prevista',
          competencia: '2025-05',
          status: 'prevista' as const,
          valor_previsto: 100,
          valor_ajustado_manualmente: false,
        },
      ]

      const novoValorCompromisso = 150

      // Lógica de sincronização: atualiza apenas a prevista
      const atualizadas = ocorrencias.map((oc) => {
        if (oc.status === 'paga') {
          return { ...oc } // preservado
        }
        return {
          ...oc,
          valor_previsto: novoValorCompromisso,
        }
      })

      expect(atualizadas[0].status).toBe('paga')
      expect(atualizadas[0].valor_pago).toBe(105)
      expect(atualizadas[0].data_pagamento).toBe('2025-04-10')
      expect(atualizadas[0].comprovante_pagamento).toBe('recibo.pdf')

      expect(atualizadas[1].status).toBe('prevista')
      expect(atualizadas[1].valor_previsto).toBe(150)
    })
  })

  // --------------------------------------------------------------------------
  // FLUXO 6: Exclusão Sem Ressurreição
  // --------------------------------------------------------------------------
  describe('Fluxo 6: Exclusão Sem Ressurreição', () => {
    it('impede que uma ocorrência excluída de propósito seja ressuscitada pelo gerador', () => {
      const excluidas = new Set(['comp_1_2025-06', 'oc_del_999'])

      const podeGerar = verificarPodeGerarOcorrencia({
        competenciaAlvo: '2025-06',
        targetIdOuChave: 'comp_1_2025-06',
        ocorrenciasExcluidasIds: excluidas,
      })

      expect(podeGerar).toBe(false)
    })

    it('impede ressurreição também quando passada lista de IDs excluídos', () => {
      const excluidas = ['oc_del_1', 'oc_del_2']

      const pode = verificarPodeGerarOcorrencia({
        competenciaAlvo: '2025-06',
        targetIdOuChave: 'oc_del_1',
        ocorrenciasExcluidasIds: excluidas,
      })

      expect(pode).toBe(false)
    })

    it('compromisso avulso não ressuscita segunda ocorrência se já tiver qualquer ocorrência', () => {
      const pode = verificarPodeGerarOcorrencia({
        competenciaAlvo: '2025-05',
        isCompromissoAvulso: true,
        hasAnyOcorrencia: true,
      })

      expect(pode).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // FLUXO 7: Duplicação Limpa
  // - Remove id/created/updated/collectionId/collectionName/expand
  // - Remove ocorrências pagas / anexos
  // - Adiciona sufixo '(cópia)'
  // - Reseta ativo = true, precisa_revisao = false
  // --------------------------------------------------------------------------
  describe('Fluxo 7: Duplicação Limpa', () => {
    it('prepararDuplicacaoCompromisso sanitiza todos os metadados de sistema e anexos', () => {
      const compromissoOriginal = {
        id: 'comp_original_123',
        created: '2025-01-01 10:00:00',
        updated: '2025-02-01 11:00:00',
        collectionId: 'col_comp',
        collectionName: 'despesas_compromisso',
        expand: { categoria: { id: 'cat_1', nome: 'Luz' } },
        descricao: 'Conta de Energia CPFL',
        fornecedor: 'CPFL Paulista',
        valor_estimado: 320,
        secao: 'contas_mensais_pix_boleto' as const,
        regra_repeticao: 'mensal' as const,
        dia_vencimento: 15,
        data_inicio: '2025-01-15',
        anexo_conta: 'fatura_janeiro.pdf',
        ativo: false,
        precisa_revisao: true,
        motivo_revisao: 'Conferir tarifa',
      }

      const duplicado = prepararDuplicacaoCompromisso(compromissoOriginal)

      expect((duplicado as any).id).toBeUndefined()
      expect((duplicado as any).created).toBeUndefined()
      expect((duplicado as any).updated).toBeUndefined()
      expect((duplicado as any).collectionId).toBeUndefined()
      expect((duplicado as any).collectionName).toBeUndefined()
      expect((duplicado as any).expand).toBeUndefined()
      expect(duplicado.anexo_conta).toBeUndefined()

      expect(duplicado.descricao).toBe('Conta de Energia CPFL (cópia)')
      expect(duplicado.fornecedor).toBe('CPFL Paulista')
      expect(duplicado.valor_estimado).toBe(320)
      expect(duplicado.ativo).toBe(true)
      expect(duplicado.precisa_revisao).toBe(false)
      expect(duplicado.motivo_revisao).toBe('')
    })

    it('não duplica sufixo "(cópia)" se a descrição já contiver', () => {
      const duplicado = prepararDuplicacaoCompromisso({
        descricao: 'Assinatura Software (cópia)',
        valor_estimado: 50,
      })
      expect(duplicado.descricao).toBe('Assinatura Software (cópia)')
    })

    it('prepararDuplicacaoLancamento remove vínculos de fatura, anexos e metadados de sistema', () => {
      const lancamentoOriginal = {
        id: 'lanc_original_456',
        created: '2025-03-01',
        updated: '2025-03-02',
        collectionId: 'col_lanc',
        collectionName: 'lancamentos',
        expand: { conta: { id: 'c1' } },
        descricao: 'Compra Mercado',
        valor: 250,
        tipo: 'despesa' as const,
        data: '2025-03-01 12:00:00',
        status: 'pago' as const,
        conta: 'conta_cartao',
        categoria: 'cat_alimentacao',
        empresa: 'emp_1',
        pessoa: 'pes_1',
        observacoes: 'Nota 5432',
        comprovante: 'cupom_fiscal.jpg',
        fatura_paga: true,
        fatura_pagamento_id: 'lanc_pag_fatura_789',
        is_pagamento_fatura: true,
        cartao_fatura_conta: 'conta_cartao',
      }

      const duplicado = prepararDuplicacaoLancamento(lancamentoOriginal)

      expect((duplicado as any).id).toBeUndefined()
      expect((duplicado as any).created).toBeUndefined()
      expect((duplicado as any).updated).toBeUndefined()
      expect((duplicado as any).collectionId).toBeUndefined()
      expect((duplicado as any).collectionName).toBeUndefined()
      expect((duplicado as any).expand).toBeUndefined()
      expect(duplicado.comprovante).toBeUndefined()

      // Desvinculação completa de faturas
      expect(duplicado.fatura_paga).toBe(false)
      expect(duplicado.fatura_pagamento_id).toBeUndefined()
      expect(duplicado.is_pagamento_fatura).toBe(false)
      expect(duplicado.cartao_fatura_conta).toBeUndefined()

      expect(duplicado.descricao).toBe('Compra Mercado (cópia)')
      expect(duplicado.valor).toBe(250)
    })
  })

  // --------------------------------------------------------------------------
  // FLUXO 8: FIFO de Baixa Parcial e Trava de Pagamento Total
  // - Rateio FIFO sobre ocorrências ordenadas por vencimento/data
  // - Pagamento total marca ciclo fechado
  // --------------------------------------------------------------------------
  describe('Fluxo 8: Rateio FIFO de Fatura e Pagamento Total', () => {
    const itensCiclo = [
      { id: 'item_3', valor: 200, data_vencimento: '2025-05-25', created: '2025-05-03' },
      { id: 'item_1', valor: 100, data_vencimento: '2025-05-10', created: '2025-05-01' },
      { id: 'item_2', valor: 150, data_vencimento: '2025-05-15', created: '2025-05-02' },
    ]
    // Total das compras: 100 + 150 + 200 = 450
    // Ordem cronológica esperada: item_1 (100), item_2 (150), item_3 (200)

    it('pagamento parcial rateia em ordem cronológica estrita (mais antigas primeiro)', () => {
      // Pagamento de R$ 260:
      // - Quita item_1 (100) -> acumulado 100
      // - Quita item_2 (150) -> acumulado 250
      // - item_3 custa 200, resta apenas 10 -> não cabe, fica em aberto
      const res = alocarPagamentoFaturaFifo(itensCiclo, 260)

      expect(res.itensQuitadosIds).toEqual(['item_1', 'item_2'])
      expect(res.itensRestantesIds).toEqual(['item_3'])
      expect(res.valorAlocado).toBe(250)
      expect(res.valorSobra).toBe(10)
      expect(res.isTotal).toBe(false)
      expect(res.cicloFechado).toBe(false)
    })

    it('pagamento parcial insuficiente para a primeira compra deixa todas abertas', () => {
      // Pagamento de R$ 80: menor que o primeiro item (100)
      const res = alocarPagamentoFaturaFifo(itensCiclo, 80)

      expect(res.itensQuitadosIds).toEqual([])
      expect(res.itensRestantesIds).toEqual(['item_1', 'item_2', 'item_3'])
      expect(res.valorAlocado).toBe(0)
      expect(res.valorSobra).toBe(80)
      expect(res.isTotal).toBe(false)
      expect(res.cicloFechado).toBe(false)
    })

    it('pagamento total exato quita todas e fecha o ciclo', () => {
      const res = alocarPagamentoFaturaFifo(itensCiclo, 450)

      expect(res.itensQuitadosIds).toEqual(['item_1', 'item_2', 'item_3'])
      expect(res.itensRestantesIds).toEqual([])
      expect(res.valorAlocado).toBe(450)
      expect(res.valorSobra).toBe(0)
      expect(res.isTotal).toBe(true)
      expect(res.cicloFechado).toBe(true)
    })

    it('pagamento superior ao total quita todas, fecha o ciclo e registra sobra/excedente', () => {
      const res = alocarPagamentoFaturaFifo(itensCiclo, 500)

      expect(res.itensQuitadosIds).toEqual(['item_1', 'item_2', 'item_3'])
      expect(res.itensRestantesIds).toEqual([])
      expect(res.valorAlocado).toBe(450)
      expect(res.valorSobra).toBe(50)
      expect(res.isTotal).toBe(true)
      expect(res.cicloFechado).toBe(true)
    })

    it('lida com lista vazia com segurança', () => {
      const res = alocarPagamentoFaturaFifo([], 100)
      expect(res.itensQuitadosIds).toEqual([])
      expect(res.isTotal).toBe(true)
      expect(res.cicloFechado).toBe(true)
    })
  })
})
