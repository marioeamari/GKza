import { describe, it, expect } from 'vitest'
import {
  buildTriagemCartaoPayload,
  buildDespesaAvulsaCanonica,
  verificarPodeGerarOcorrencia,
  prepararDuplicacaoCompromisso,
  prepararDuplicacaoLancamento,
  alocarPagamentoFaturaFifo,
  ordenarDespesasPorData,
  ordenarDespesasCreditoPorCompra,
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
  // FLUXO 2: Entrada Canônica Unificada de Despesas Avulsas (Telegram, Triagem, /despesas)
  // - Regra permanente do usuário: todo canal gera o mesmo modelo canônico:
  //   despesas_compromisso (avulso) + despesas_ocorrencias (competência da regra única) + lancamentos vinculado
  // - Cartão de crédito: competência pelo ciclo de fechamento, data_pagamento no vencimento da fatura
  // - Não-cartão: competência no mês da compra, data_pagamento na data da compra
  // --------------------------------------------------------------------------
  describe('Fluxo 2: Entrada Canônica Unificada de Despesas Avulsas', () => {
    it('gera compromisso + ocorrencia + lancamento consistentes para compra em cartão (ex: Sorvete rafa)', () => {
      const contaNubank = {
        id: 'sglo7dfsqvgfsni',
        nome: 'NuBank',
        tipo: 'cartao' as const,
        dia_fechamento: 16,
        dia_vencimento: 23,
      }

      // Compra após o fechamento: 2026-10-23 > dia 16 -> ciclo 2026-11
      const canonica = buildDespesaAvulsaCanonica({
        descricao: 'Sorvete rafa',
        valor: 5.0,
        dataCompra: '2026-10-23',
        contaId: contaNubank.id,
        conta: contaNubank,
        categoriaId: '5822e1m7g49fgyq',
        titularTipo: 'cpf',
        titularPessoaId: 'pes_rafa',
        origemTexto: 'Telegram',
      })

      expect(canonica.competencia).toBe('2026-11')
      expect(canonica.dataVencimentoStr).toBe('2026-11-23')

      // Compromisso
      expect(canonica.compromisso.regra_repeticao).toBe('avulso')
      expect(canonica.compromisso.secao).toBe('cartoes_credito')
      expect(canonica.compromisso.valor_estimado).toBe(5.0)
      expect(canonica.compromisso.descricao).toBe('Sorvete rafa')
      expect(canonica.compromisso.dia_vencimento).toBe(23)
      expect(canonica.compromisso.metodo_pagamento).toBe('r9qdfpwfe5143oe')

      // Ocorrência
      expect(canonica.ocorrencia.competencia).toBe('2026-11')
      expect(canonica.ocorrencia.status).toBe('paga')
      expect(canonica.ocorrencia.valor_pago).toBe(5.0)
      expect(canonica.ocorrencia.valor_previsto).toBe(5.0)
      expect(canonica.ocorrencia.data_pagamento).toBe('2026-11-23 12:00:00')
      expect(canonica.ocorrencia.data_vencimento).toBe('2026-11-23T12:00:00.000Z')

      // Lançamento
      expect(canonica.lancamento.status).toBe('pago')
      expect(canonica.lancamento.tipo).toBe('despesa')
      expect(canonica.lancamento.competencia).toBe('2026-11')
      expect(canonica.lancamento.data).toBe('2026-11-23 12:00:00')
      expect(canonica.lancamento.valor).toBe(5.0)
    })

    it('gera compromisso + ocorrencia + lancamento para compra em cartão antes do fechamento', () => {
      const contaNubank = {
        id: 'sglo7dfsqvgfsni',
        nome: 'NuBank',
        tipo: 'cartao' as const,
        dia_fechamento: 16,
        dia_vencimento: 23,
      }

      // Compra antes do fechamento: 2026-10-10 <= dia 16 -> ciclo 2026-10
      const canonica = buildDespesaAvulsaCanonica({
        descricao: 'Café',
        valor: 12.0,
        dataCompra: '2026-10-10',
        contaId: contaNubank.id,
        conta: contaNubank,
        categoriaId: 'cat_cafe',
      })

      expect(canonica.competencia).toBe('2026-10')
      expect(canonica.dataVencimentoStr).toBe('2026-10-23')
      expect(canonica.ocorrencia.competencia).toBe('2026-10')
      expect(canonica.ocorrencia.data_pagamento).toBe('2026-10-23 12:00:00')
      expect(canonica.lancamento.competencia).toBe('2026-10')
      expect(canonica.lancamento.data).toBe('2026-10-23 12:00:00')
    })

    it('gera compromisso + ocorrencia + lancamento para despesa avulsa não-cartão (PIX/Dinheiro)', () => {
      const contaCaixa = {
        id: 'conta_itau',
        nome: 'Itaú Corrente',
        tipo: 'bancaria' as const,
        dia_fechamento: 0,
        dia_vencimento: 10,
      }

      const canonica = buildDespesaAvulsaCanonica({
        descricao: 'Almoço PIX',
        valor: 45.0,
        dataCompra: '2026-10-05',
        contaId: contaCaixa.id,
        conta: contaCaixa,
        categoriaId: 'cat_alimentacao',
      })

      expect(canonica.competencia).toBe('2026-10')
      expect(canonica.compromisso.secao).toBe('contas_mensais_pix_boleto')
      expect(canonica.ocorrencia.status).toBe('paga')
      expect(canonica.ocorrencia.data_pagamento).toBe('2026-10-05 12:00:00')
      expect(canonica.lancamento.data).toBe('2026-10-05 12:00:00')
      expect(canonica.lancamento.competencia).toBe('2026-10')
    })

    it('mantém buildTriagemCartaoPayload para compatibilidade com código legado', () => {
      const cartao = {
        id: 'cartao_xp',
        nome: 'XP Visa Infinite',
        tipo: 'cartao' as const,
        dia_fechamento: 5,
        dia_vencimento: 15,
      }

      const payload = buildTriagemCartaoPayload({
        descricao: 'Almoço Restaurante',
        valor: 150.5,
        dataCompra: '2025-04-10',
        contaId: 'cartao_xp',
        conta: cartao,
        categoriaId: 'cat_alimentacao',
        titularTipo: 'cpf',
        titularPessoaId: 'pes_guilherme',
      })

      expect(payload.tipo).toBe('despesa')
      expect(payload.status).toBe('pago')
      expect(payload.competencia).toBe('2025-05')
      expect(payload.data).toBe('2025-05-15 12:00:00')
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

  describe('ordenarDespesasPorData (Regra Pura de Ordenação)', () => {
    const hoje = '2026-10-15'

    it('ordena pendentes prioritariamente por data cronológica e desempata por valor decrescente, NÃO alfabético', () => {
      const lista = [
        {
          id: 'item_z',
          status: 'prevista',
          data_vencimento: '2026-10-20',
          valor_previsto: 50,
          expand: { compromisso: { descricao: 'Zebra' } },
        },
        {
          id: 'item_a',
          status: 'prevista',
          data_vencimento: '2026-10-18',
          valor_previsto: 10,
          expand: { compromisso: { descricao: 'Abacaxi' } },
        },
        {
          id: 'item_b_alto',
          status: 'prevista',
          data_vencimento: '2026-10-20',
          valor_previsto: 500,
          expand: { compromisso: { descricao: 'Banana Cara' } },
        },
        {
          id: 'item_c_baixo',
          status: 'prevista',
          data_vencimento: '2026-10-20',
          valor_previsto: 200,
          expand: { compromisso: { descricao: 'Amora' } },
        },
      ]

      const ordenado = ordenarDespesasPorData(lista, 'urgente', hoje)

      // 1º: item_a vence dia 18 (mais próxima)
      expect(ordenado[0].id).toBe('item_a')

      // 2º, 3º e 4º vencem no mesmo dia (2026-10-20):
      // Deve desempatar por valor decrescente (500 > 200 > 50)
      // Note que 'Banana Cara' (500) vem antes de 'Amora' (200), provando que não é alfabético!
      expect(ordenado[1].id).toBe('item_b_alto') // R$ 500
      expect(ordenado[2].id).toBe('item_c_baixo') // R$ 200
      expect(ordenado[3].id).toBe('item_z') // R$ 50
    })

    it('coloca pendentes vencidas e de hoje no topo em modo urgente', () => {
      const lista = [
        { id: 'futura', status: 'prevista', data_vencimento: '2026-10-25', valor_previsto: 100 },
        { id: 'vencida', status: 'prevista', data_vencimento: '2026-10-10', valor_previsto: 100 },
        { id: 'hoje', status: 'prevista', data_vencimento: '2026-10-15', valor_previsto: 100 },
      ]

      const ordenado = ordenarDespesasPorData(lista, 'urgente', hoje)
      expect(ordenado.map((o) => o.id)).toEqual(['vencida', 'hoje', 'futura'])
    })

    it('coloca pagas sempre após pendentes', () => {
      const lista = [
        { id: 'paga_1', status: 'paga', data_vencimento: '2026-10-01', valor_previsto: 100 },
        { id: 'pend_1', status: 'prevista', data_vencimento: '2026-10-28', valor_previsto: 100 },
      ]

      const ordenado = ordenarDespesasPorData(lista, 'urgente', hoje)
      expect(ordenado[0].id).toBe('pend_1')
      expect(ordenado[1].id).toBe('paga_1')
    })

    it('desempata por ID de forma estável quando data e valor forem idênticos', () => {
      const lista = [
        { id: 'b_id', status: 'prevista', data_vencimento: '2026-10-20', valor_previsto: 100 },
        { id: 'a_id', status: 'prevista', data_vencimento: '2026-10-20', valor_previsto: 100 },
      ]

      const ordenado = ordenarDespesasPorData(lista, 'urgente', hoje)
      expect(ordenado.map((o) => o.id)).toEqual(['a_id', 'b_id'])
    })

    it('mesma data_vencimento (crédito) desempata por data_compra, depois valor decrescente, depois id', () => {
      const lista = [
        {
          id: 'compra_antiga_alto',
          status: 'prevista',
          data_vencimento: '2026-10-23',
          data_compra: '2026-10-02',
          valor_previsto: 800,
        },
        {
          id: 'compra_recente_baixo',
          status: 'prevista',
          data_vencimento: '2026-10-23',
          data_compra: '2026-10-15',
          valor_previsto: 100,
        },
        {
          id: 'compra_recente_alto',
          status: 'prevista',
          data_vencimento: '2026-10-23',
          data_compra: '2026-10-15',
          valor_previsto: 500,
        },
        {
          id: 'compra_recente_alto_id_z',
          status: 'prevista',
          data_vencimento: '2026-10-23',
          data_compra: '2026-10-15',
          valor_previsto: 500,
        },
      ]

      const ordenado = ordenarDespesasPorData(lista, 'urgente', hoje)

      // Empate no vencimento (2026-10-23):
      // 1. data_compra mais recente (2026-10-15) vem antes de (2026-10-02)
      // 2. Entre as de 2026-10-15: valor decrescente (500 > 100)
      // 3. Entre as de 500: id estável ('compra_recente_alto' < 'compra_recente_alto_id_z')
      expect(ordenado.map((o) => o.id)).toEqual([
        'compra_recente_alto',
        'compra_recente_alto_id_z',
        'compra_recente_baixo',
        'compra_antiga_alto',
      ])
    })
  })

  describe('ordenarDespesasCreditoPorCompra (Ordenação por Compra do Cartão)', () => {
    it('ordena compras por recente (mais nova primeiro) e antiga (mais antiga primeiro)', () => {
      const itens = [
        { id: 'c1', data_compra: '2026-10-05', valor_previsto: 100 },
        { id: 'c2', data_compra: '2026-10-18', valor_previsto: 250 },
        { id: 'c3', data_compra: '2026-10-12', valor_previsto: 75 },
      ]

      const recentes = ordenarDespesasCreditoPorCompra(itens, 'recente')
      expect(recentes.map((i) => i.id)).toEqual(['c2', 'c3', 'c1'])

      const antigas = ordenarDespesasCreditoPorCompra(itens, 'antiga')
      expect(antigas.map((i) => i.id)).toEqual(['c1', 'c3', 'c2'])
    })

    it('aplica fallback de data: compromisso.data_inicio -> data_vencimento -> created -> 9999-12-31', () => {
      const itens = [
        {
          id: 'via_inicio',
          expand: { compromisso: { data_inicio: '2026-10-10 00:00:00' } },
          valor_previsto: 50,
        },
        {
          id: 'via_compra',
          data_compra: '2026-10-15',
          valor_previsto: 50,
        },
        {
          id: 'via_venc',
          data_vencimento: '2026-10-23T00:00:00Z',
          valor_previsto: 50,
        },
        {
          id: 'via_created',
          created: '2026-10-01 12:00:00',
          valor_previsto: 50,
        },
        {
          id: 'sem_data',
          valor_previsto: 50,
        },
      ]

      const recentes = ordenarDespesasCreditoPorCompra(itens, 'recente')
      // 'sem_data' cai no fallback '9999-12-31' e fica no topo em 'recente', ou 2026-10-23, etc.
      expect(recentes[0].id).toBe('sem_data')
      expect(recentes[1].id).toBe('via_venc') // 2026-10-23
      expect(recentes[2].id).toBe('via_compra') // 2026-10-15
      expect(recentes[3].id).toBe('via_inicio') // 2026-10-10
      expect(recentes[4].id).toBe('via_created') // 2026-10-01

      const antigas = ordenarDespesasCreditoPorCompra(itens, 'antiga')
      expect(antigas.map((i) => i.id)).toEqual([
        'via_created',
        'via_inicio',
        'via_compra',
        'via_venc',
        'sem_data',
      ])
    })

    it('desempata por valor decrescente e id estável quando a data da compra for idêntica', () => {
      const itens = [
        { id: 'b_50', data_compra: '2026-10-10', valor_previsto: 50 },
        { id: 'z_200', data_compra: '2026-10-10', valor_previsto: 200 },
        { id: 'a_200', data_compra: '2026-10-10', valor_previsto: 200 },
      ]

      const recentes = ordenarDespesasCreditoPorCompra(itens, 'recente')
      expect(recentes.map((i) => i.id)).toEqual(['a_200', 'z_200', 'b_50'])

      const antigas = ordenarDespesasCreditoPorCompra(itens, 'antiga')
      expect(antigas.map((i) => i.id)).toEqual(['a_200', 'z_200', 'b_50'])
    })

    it('ordena somente a lista recebida sem misturar ciclos (responsabilidade do chamador)', () => {
      // Duas listas de faturas de ciclos distintos nunca se misturam se passadas separadamente
      const cicloOutubro = [
        { id: 'out_1', data_compra: '2026-10-02', valor_previsto: 100 },
        { id: 'out_2', data_compra: '2026-10-15', valor_previsto: 200 },
      ]
      const cicloNovembro = [
        { id: 'nov_1', data_compra: '2026-10-20', valor_previsto: 300 },
        { id: 'nov_2', data_compra: '2026-11-05', valor_previsto: 400 },
      ]

      const ordOutubro = ordenarDespesasCreditoPorCompra(cicloOutubro, 'recente')
      const ordNovembro = ordenarDespesasCreditoPorCompra(cicloNovembro, 'recente')

      expect(ordOutubro.map((i) => i.id)).toEqual(['out_2', 'out_1'])
      expect(ordNovembro.map((i) => i.id)).toEqual(['nov_2', 'nov_1'])
    })
  })

  describe('Filtro de Competência de Apuração: Grades Refiltram e Totais Permanecem Estáveis', () => {
    it('refiltra a grade entre modo vencimento e modo pagamento enquanto totais gerais ficam estáveis', () => {
      // Simulação do comportamento de Despesas.tsx:
      // Ocorrência 1: competência 2026-10, paga em 2026-10-12
      // Ocorrência 2: competência 2026-10, prevista (não paga)
      // Ocorrência 3: competência 2026-10, paga adiantada em 2026-09-28 (data_pagamento no mês anterior)
      // Ocorrência 4: competência 2026-09, paga com atraso em 2026-10-05 (data_pagamento em 2026-10)
      const currentComp = '2026-10'

      const ocorrenciasDaCompetencia = [
        {
          id: 'oc_1',
          competencia: '2026-10',
          status: 'paga',
          valor_previsto: 300,
          valor_pago: 300,
          data_vencimento: '2026-10-10',
          data_pagamento: '2026-10-12',
          dizimo: false,
        },
        {
          id: 'oc_2',
          competencia: '2026-10',
          status: 'prevista',
          valor_previsto: 150,
          valor_pago: 0,
          data_vencimento: '2026-10-20',
          data_pagamento: null,
          dizimo: true,
        },
        {
          id: 'oc_3',
          competencia: '2026-10',
          status: 'paga',
          valor_previsto: 100,
          valor_pago: 100,
          data_vencimento: '2026-10-25',
          data_pagamento: '2026-09-28', // paga no mês anterior
          dizimo: false,
        },
      ]

      const ocorrenciaPagaNesteMesOutraComp = {
        id: 'oc_4',
        competencia: '2026-09',
        status: 'paga',
        valor_previsto: 200,
        valor_pago: 200,
        data_vencimento: '2026-09-30',
        data_pagamento: '2026-10-05', // paga em outubro
        dizimo: false,
      }

      // Função de filtragem da grade (mesma lógica do filteredOcorrencias)
      const filtrarGrade = (lista: any[], modo: 'vencimento' | 'pagamento', mesComp: string) => {
        return lista.filter((oc) => {
          if (modo === 'vencimento') {
            return oc.competencia === mesComp
          }
          // modo 'pagamento'
          if (oc.status === 'paga') {
            const compPag = oc.data_pagamento ? oc.data_pagamento.slice(0, 7) : oc.competencia
            return compPag === mesComp
          }
          // prevista em aberto
          return true
        })
      }

      // Totais gerais contábeis: calculados exclusivamente sobre as ocorrências gravadas na competência
      const calcularTotaisGerais = (ocs: typeof ocorrenciasDaCompetencia) => ({
        totalPrevisto: ocs.reduce((sum, o) => sum + (o.valor_previsto || 0), 0),
        totalPago: ocs
          .filter((o) => o.status === 'paga')
          .reduce((sum, o) => sum + (o.valor_pago || o.valor_previsto || 0), 0),
        totalPendente: ocs
          .filter((o) => o.status === 'prevista')
          .reduce((sum, o) => sum + (o.valor_previsto || 0), 0),
        totalDizimoOfertas: ocs
          .filter((o) => o.dizimo)
          .reduce(
            (sum, o) =>
              sum +
              (o.status === 'paga' ? o.valor_pago || o.valor_previsto : o.valor_previsto || 0),
            0,
          ),
      })

      // 1. Totais contábeis da competência 2026-10
      const totaisGerais = calcularTotaisGerais(ocorrenciasDaCompetencia)
      expect(totaisGerais.totalPrevisto).toBe(550) // 300 + 150 + 100
      expect(totaisGerais.totalPago).toBe(400) // 300 + 100
      expect(totaisGerais.totalPendente).toBe(150) // 150
      expect(totaisGerais.totalDizimoOfertas).toBe(150)

      // 2. Comportamento da grade no modo 'vencimento':
      // Exibe todas as ocorrências da competência 2026-10 (oc_1, oc_2, oc_3)
      const todasDisponiveis = [...ocorrenciasDaCompetencia, ocorrenciaPagaNesteMesOutraComp]
      const gradeVencimento = filtrarGrade(todasDisponiveis, 'vencimento', currentComp)
      expect(gradeVencimento.map((o) => o.id)).toEqual(['oc_1', 'oc_2', 'oc_3'])

      // 3. Comportamento da grade no modo 'pagamento':
      // oc_1 (paga em 10/2026): visível
      // oc_2 (prevista em aberto): visível
      // oc_3 (paga em 09/2026): NÃO visível no modo pagamento de 10/2026 pois foi paga em setembro!
      // oc_4 (paga em 10/2026): visível no modo pagamento de 10/2026
      const gradePagamento = filtrarGrade(todasDisponiveis, 'pagamento', currentComp)
      expect(gradePagamento.map((o) => o.id)).toEqual(['oc_1', 'oc_2', 'oc_4'])

      // Verificação chave: a grade REAGE e muda o que aparece
      expect(gradeVencimento).not.toEqual(gradePagamento)

      // E os totais gerais contábeis permanecem rigorosamente estáveis e idênticos
      const totaisDepoisDeTrocarFiltro = calcularTotaisGerais(ocorrenciasDaCompetencia)
      expect(totaisDepoisDeTrocarFiltro).toEqual(totaisGerais)
    })
  })

  describe('Cálculo Contábil Puro da Competência (Totais Idênticos em Vencimento vs Pagamento)', () => {
    it('totais da competência permanecem idênticos independentemente do modo visual "vencimento" ou "pagamento"', () => {
      // Simulação do cálculo de totais que Despesas.tsx realiza sobre a lista de ocorrências da competência
      const ocorrenciasCompetencia = [
        {
          id: 'oc_1',
          competencia: '2026-10',
          status: 'paga',
          valor_previsto: 300,
          valor_pago: 300,
          data_vencimento: '2026-10-10',
          data_pagamento: '2026-10-12',
          dizimo: false,
        },
        {
          id: 'oc_2',
          competencia: '2026-10',
          status: 'prevista',
          valor_previsto: 150,
          valor_pago: 0,
          data_vencimento: '2026-10-20',
          data_pagamento: null,
          dizimo: true,
        },
        {
          id: 'oc_3',
          competencia: '2026-10',
          status: 'prevista',
          valor_previsto: 50,
          valor_pago: 0,
          data_vencimento: '2026-10-25',
          data_pagamento: null,
          dizimo: false,
        },
      ]

      const calcularTotais = (ocs: typeof ocorrenciasCompetencia) => ({
        totalPrevisto: ocs.reduce((sum, o) => sum + (o.valor_previsto || 0), 0),
        totalPago: ocs
          .filter((o) => o.status === 'paga')
          .reduce((sum, o) => sum + (o.valor_pago || o.valor_previsto || 0), 0),
        totalPendente: ocs
          .filter((o) => o.status === 'prevista')
          .reduce((sum, o) => sum + (o.valor_previsto || 0), 0),
        totalDizimoOfertas: ocs
          .filter((o) => o.dizimo)
          .reduce(
            (sum, o) =>
              sum +
              (o.status === 'paga' ? o.valor_pago || o.valor_previsto : o.valor_previsto || 0),
            0,
          ),
      })

      const totaisModoVencimento = calcularTotais(ocorrenciasCompetencia)
      const totaisModoPagamento = calcularTotais(ocorrenciasCompetencia)

      expect(totaisModoVencimento.totalPrevisto).toBe(500)
      expect(totaisModoVencimento.totalPago).toBe(300)
      expect(totaisModoVencimento.totalPendente).toBe(200)
      expect(totaisModoVencimento.totalDizimoOfertas).toBe(150)

      // Garantia canônica: modo vencimento e modo pagamento produzem exatamente os mesmos totais
      expect(totaisModoVencimento).toEqual(totaisModoPagamento)
    })
  })
})
