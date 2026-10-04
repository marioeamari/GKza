import { describe, it, expect } from 'vitest'
import {
  getMesBrasilia,
  getPercentualDizimoEfetivo,
  calcularValorEfetivoBaseDizimo,
  filtrarOcorrenciasDizimoMes,
  calcularBaseCompartilhadaDizimo,
} from './dizimoCalculo'
import type { DespesaOcorrencia } from '@/types/domain'

describe('Motor de Cálculo de Dízimo e Regras de Base Compartilhada', () => {
  // (a) Ocorrência paga de R$ 200 com dizimo_percentual 50 entra R$ 100 na base
  describe('(a) Ocorrência paga com percentual parcial (ex: R$ 200 a 50%)', () => {
    it('entra exatamente com R$ 100 na base de cálculo quando dizimo_percentual é 50', () => {
      const ocorrencia: Partial<DespesaOcorrencia> = {
        id: 'oc_1',
        status: 'paga',
        valor_pago: 200,
        dizimo_percentual: 50,
      }

      const percentual = getPercentualDizimoEfetivo(ocorrencia)
      expect(percentual).toBe(50)

      const valorEfetivo = calcularValorEfetivoBaseDizimo(ocorrencia)
      expect(valorEfetivo).toBe(100)

      const baseTotal = calcularBaseCompartilhadaDizimo([ocorrencia])
      expect(baseTotal).toBe(100)
    })

    it('calcula corretamente com outros percentuais fracionados (ex: 25%, 75%)', () => {
      const oc25: Partial<DespesaOcorrencia> = {
        valor_pago: 200,
        dizimo_percentual: 25,
      }
      expect(calcularValorEfetivoBaseDizimo(oc25)).toBe(50)

      const oc75: Partial<DespesaOcorrencia> = {
        valor_pago: 200,
        dizimo_percentual: 75,
      }
      expect(calcularValorEfetivoBaseDizimo(oc75)).toBe(150)
    })
  })

  // (b) Percentual 0 exclui a ocorrência da base
  describe('(b) Percentual 0 exclui a ocorrência da base', () => {
    it('resulta em R$ 0 de contribuição efetiva na base quando dizimo_percentual é 0', () => {
      const ocorrencia: Partial<DespesaOcorrencia> = {
        id: 'oc_zero',
        status: 'paga',
        valor_pago: 500,
        dizimo_percentual: 0,
      }

      const percentual = getPercentualDizimoEfetivo(ocorrencia)
      expect(percentual).toBe(0)

      const valorEfetivo = calcularValorEfetivoBaseDizimo(ocorrencia)
      expect(valorEfetivo).toBe(0)

      const baseTotal = calcularBaseCompartilhadaDizimo([ocorrencia])
      expect(baseTotal).toBe(0)
    })

    it('preserva valor_pago para contabilidade mas adiciona 0 na soma da base compartilhada', () => {
      const ocorrencias: Array<Partial<DespesaOcorrencia>> = [
        { id: 'oc_1', status: 'paga', valor_pago: 300, dizimo_percentual: 100 },
        { id: 'oc_2', status: 'paga', valor_pago: 450, dizimo_percentual: 0 },
      ]

      const somaBruta = ocorrencias.reduce((acc, oc) => acc + (oc.valor_pago || 0), 0)
      expect(somaBruta).toBe(750)

      const baseCompartilhada = calcularBaseCompartilhadaDizimo(ocorrencias)
      expect(baseCompartilhada).toBe(300)
    })
  })

  // (c) Percentual ausente/null trata como 100 (compatibilidade com registros antigos)
  describe('(c) Percentual ausente/null trata como 100 (compatibilidade)', () => {
    it('trata dizimo_percentual undefined como 100%', () => {
      const ocorrencia: Partial<DespesaOcorrencia> = {
        id: 'oc_legado_undefined',
        status: 'paga',
        valor_pago: 150,
        dizimo_percentual: undefined,
      }

      expect(getPercentualDizimoEfetivo(ocorrencia)).toBe(100)
      expect(calcularValorEfetivoBaseDizimo(ocorrencia)).toBe(150)
    })

    it('trata dizimo_percentual null como 100%', () => {
      const ocorrencia: Partial<DespesaOcorrencia> = {
        id: 'oc_legado_null',
        status: 'paga',
        valor_pago: 80,
        dizimo_percentual: null as unknown as number,
      }

      expect(getPercentualDizimoEfetivo(ocorrencia)).toBe(100)
      expect(calcularValorEfetivoBaseDizimo(ocorrencia)).toBe(80)
    })

    it('herda percentual do compromisso expandido quando a ocorrência não tiver definido', () => {
      const ocorrenciaComComp: Partial<DespesaOcorrencia> = {
        id: 'oc_sem_pct',
        status: 'paga',
        valor_pago: 200,
        dizimo_percentual: undefined,
        expand: {
          compromisso: {
            dizimo_percentual: 50,
          } as any,
        },
      }

      expect(getPercentualDizimoEfetivo(ocorrenciaComComp)).toBe(50)
      expect(calcularValorEfetivoBaseDizimo(ocorrenciaComComp)).toBe(100)
    })

    it('trata como 100 se tanto a ocorrência quanto o compromisso tiverem percentual null/undefined', () => {
      const ocorrenciaComCompNull: Partial<DespesaOcorrencia> = {
        id: 'oc_comp_null',
        status: 'paga',
        valor_pago: 350,
        dizimo_percentual: null as unknown as number,
        expand: {
          compromisso: {
            dizimo_percentual: null as unknown as number,
          } as any,
        },
      }

      expect(getPercentualDizimoEfetivo(ocorrenciaComCompNull)).toBe(100)
      expect(calcularValorEfetivoBaseDizimo(ocorrenciaComCompNull)).toBe(350)
    })
  })

  // (d) Parcela paga no mês X entra na base do mês X (mês da data_pagamento, fuso Brasília, datas ao meio-dia UTC)
  describe('(d) Alocação temporal no mês de referência (fuso Brasília, meio-dia UTC)', () => {
    it('aloca a parcela paga em 2026-09-25 12:00:00.000Z na base de setembro (2026-09)', () => {
      const dateStr = '2026-09-25 12:00:00.000Z'
      const mes = getMesBrasilia(dateStr)
      expect(mes).toBe('2026-09')

      const ocSetembro: Partial<DespesaOcorrencia> = {
        id: 'oc_setembro',
        status: 'paga',
        valor_pago: 100,
        data_pagamento: dateStr,
        competencia: '2026-08', // competência anterior, mas paga em setembro
      }

      const filtradasSetembro = filtrarOcorrenciasDizimoMes([ocSetembro], '2026-09')
      expect(filtradasSetembro).toHaveLength(1)
      expect(filtradasSetembro[0].id).toBe('oc_setembro')

      const filtradasAgosto = filtrarOcorrenciasDizimoMes([ocSetembro], '2026-08')
      expect(filtradasAgosto).toHaveLength(0)
    })

    it('aloca no mês correto segundo o fuso de Brasília para datas com padrão PocketBase "YYYY-MM-DD 12:00:00.000Z"', () => {
      // 1º dia do mês ao meio-dia UTC -> fuso Brasília (UTC-3) são 09:00 do mesmo dia
      expect(getMesBrasilia('2026-10-01 12:00:00.000Z')).toBe('2026-10')
      // Último dia do mês ao meio-dia UTC
      expect(getMesBrasilia('2026-10-31 12:00:00.000Z')).toBe('2026-10')
      // Próximo mês
      expect(getMesBrasilia('2026-11-01 12:00:00.000Z')).toBe('2026-11')
    })

    it('ignora ocorrências que não estejam com status="paga", mesmo que data_pagamento esteja preenchida', () => {
      const ocPrevista: Partial<DespesaOcorrencia> = {
        id: 'oc_prev',
        status: 'prevista',
        valor_pago: 100,
        data_pagamento: '2026-09-10 12:00:00.000Z',
      }

      const filtradas = filtrarOcorrenciasDizimoMes([ocPrevista], '2026-09')
      expect(filtradas).toHaveLength(0)
    })

    it('usa a competência como fallback apenas se data_pagamento não existir', () => {
      const ocSemDataPagamento: Partial<DespesaOcorrencia> = {
        id: 'oc_fallback_comp',
        status: 'paga',
        valor_pago: 100,
        data_pagamento: null,
        competencia: '2026-09',
      }

      const filtradas = filtrarOcorrenciasDizimoMes([ocSemDataPagamento], '2026-09')
      expect(filtradas).toHaveLength(1)
    })

    it('ordena as ocorrências filtradas cronologicamente por data_pagamento', () => {
      const oc1: Partial<DespesaOcorrencia> = {
        id: 'oc_fim_mes',
        status: 'paga',
        data_pagamento: '2026-09-25 12:00:00.000Z',
      }
      const oc2: Partial<DespesaOcorrencia> = {
        id: 'oc_inicio_mes',
        status: 'paga',
        data_pagamento: '2026-09-05 12:00:00.000Z',
      }
      const oc3: Partial<DespesaOcorrencia> = {
        id: 'oc_meio_mes',
        status: 'paga',
        data_pagamento: '2026-09-14 12:00:00.000Z',
      }

      const filtradas = filtrarOcorrenciasDizimoMes([oc1, oc2, oc3], '2026-09')
      expect(filtradas.map((o) => o.id)).toEqual(['oc_inicio_mes', 'oc_meio_mes', 'oc_fim_mes'])
    })
  })
})
