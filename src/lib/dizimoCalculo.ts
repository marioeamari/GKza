import { getLocalDateStr } from '@/lib/format'
import type { DespesaOcorrencia } from '@/types/domain'

/**
 * Extrai o mês no formato YYYY-MM respeitando estritamente o fuso de Brasília (America/Sao_Paulo).
 * Suporta formatos como '2026-09-25 12:00:00.000Z', ISO padrão '2026-09-25T12:00:00.000Z'
 * e datas de competência 'YYYY-MM' / 'YYYY-MM-DD'.
 */
export function getMesBrasilia(dateStr?: string | null): string | null {
  if (!dateStr) return null
  try {
    const iso =
      dateStr.includes(' ') && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr
    const d = new Date(iso)
    if (!isNaN(d.getTime())) {
      return getLocalDateStr(d).slice(0, 7) // 'YYYY-MM'
    }
  } catch {
    /* fallback */
  }
  return dateStr.slice(0, 7)
}

/**
 * Obtém o percentual efetivo de dízimo aplicável a uma ocorrência:
 * - Se `dizimo_percentual` da ocorrência estiver preenchido (inclusive 0), usa-o.
 * - Caso contrário, recorre ao `dizimo_percentual` do compromisso expandido.
 * - Se ambos forem ausentes/null/undefined, assume 100 por compatibilidade histórica.
 */
export function getPercentualDizimoEfetivo(oc: {
  dizimo_percentual?: number | null
  expand?: {
    compromisso?: {
      dizimo_percentual?: number | null
    }
  }
}): number {
  if (oc.dizimo_percentual !== undefined && oc.dizimo_percentual !== null) {
    return oc.dizimo_percentual
  }
  const compPct = oc.expand?.compromisso?.dizimo_percentual
  if (compPct !== undefined && compPct !== null) {
    return compPct
  }
  return 100
}

/**
 * Calcula a contribuição ponderada de uma ocorrência individual na base do dízimo:
 * valor_efetivo = valor_pago * (percentual_efetivo) / 100.
 */
export function calcularValorEfetivoBaseDizimo(oc: {
  valor_pago?: number | null
  dizimo_percentual?: number | null
  expand?: {
    compromisso?: {
      dizimo_percentual?: number | null
    }
  }
}): number {
  const pct = getPercentualDizimoEfetivo(oc)
  const valorPago = oc.valor_pago || 0
  return (valorPago * pct) / 100
}

/**
 * Filtra ocorrências pagas elegíveis para a base do dízimo de um determinado mês:
 * - status === 'paga'
 * - dizimo !== false (ou já pré-filtrado por dizimo=true)
 * - data_pagamento (ou fallback competencia) pertencente ao mês de referência no fuso Brasília.
 */
export function filtrarOcorrenciasDizimoMes<T extends Partial<DespesaOcorrencia>>(
  ocorrencias: T[],
  selectedMonth: string,
): T[] {
  return ocorrencias
    .filter((oc) => {
      if (oc.status !== 'paga') return false
      const mes =
        getMesBrasilia(oc.data_pagamento) || (oc.competencia ? oc.competencia.slice(0, 7) : null)
      return mes === selectedMonth
    })
    .sort((a, b) => {
      const dataA = a.data_pagamento || a.competencia || ''
      const dataB = b.data_pagamento || b.competencia || ''
      return dataA.localeCompare(dataB)
    })
}

/**
 * Normaliza e identifica se uma ocorrência ou compromisso pertence a um determinado
 * tipo ministerial de contribuição ('dizimo', 'oferta', 'primicias').
 */
export function matchesTipoCalculo(
  tipoAlvo: 'dizimo' | 'oferta' | 'primicias',
  oc: {
    tipo_dizimo?: string | null
    expand?: {
      tipo_dizimo?: {
        nome?: string | null
        codigo?: string | null
        id?: string | null
      } | null
      compromisso?: {
        tipo_dizimo?: string | null
        expand?: {
          tipo_dizimo?: {
            nome?: string | null
            codigo?: string | null
            id?: string | null
          } | null
        } | null
      } | null
    } | null
  },
  tiposDizimoList: Array<{ id: string; nome: string; codigo?: string }> = [],
): boolean {
  // Coleta possíveis identificadores e nomes
  const tipoId =
    oc.tipo_dizimo ||
    oc.expand?.tipo_dizimo?.id ||
    oc.expand?.compromisso?.tipo_dizimo ||
    oc.expand?.compromisso?.expand?.tipo_dizimo?.id ||
    ''

  const tipoRecord = tiposDizimoList.find((t) => t.id === tipoId)

  const rawNome = (
    oc.expand?.tipo_dizimo?.nome ||
    oc.expand?.compromisso?.expand?.tipo_dizimo?.nome ||
    tipoRecord?.nome ||
    ''
  ).toLowerCase()

  const rawCodigo = (
    oc.expand?.tipo_dizimo?.codigo ||
    oc.expand?.compromisso?.expand?.tipo_dizimo?.codigo ||
    tipoRecord?.codigo ||
    ''
  ).toLowerCase()

  const strToTest = `${rawNome} ${rawCodigo}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  if (tipoAlvo === 'oferta') {
    return strToTest.includes('oferta')
  }

  if (tipoAlvo === 'primicias') {
    return strToTest.includes('primicia')
  }

  // Para 'dizimo':
  // Se for explicitamente dízimo, ou se não for nem oferta nem primícia (dízimo é o tipo padrão/predominante)
  if (strToTest.includes('oferta') || strToTest.includes('primicia')) {
    return false
  }

  return true
}

/**
 * Filtra ocorrências em aberto (status != 'paga') de um mês específico
 * que correspondam ao tipo ministerial ('dizimo', 'oferta', 'primicias') ou todas.
 */
export function filtrarOcorrenciasAbertoDizimoMes<T extends Partial<DespesaOcorrencia>>(
  ocorrencias: T[],
  selectedMonth: string,
  tipoAlvo?: 'dizimo' | 'oferta' | 'primicias',
  tiposDizimoList: Array<{ id: string; nome: string; codigo?: string }> = [],
): T[] {
  return ocorrencias
    .filter((oc) => {
      if (oc.status === 'paga') return false
      // Verifica competência do mês selecionado
      const comp = oc.competencia ? oc.competencia.slice(0, 7) : null
      if (comp !== selectedMonth) return false

      if (tipoAlvo) {
        return matchesTipoCalculo(tipoAlvo, oc as any, tiposDizimoList)
      }
      return true
    })
    .sort((a, b) => {
      const dueA = a.data_vencimento || ''
      const dueB = b.data_vencimento || ''
      return dueA.localeCompare(dueB)
    })
}

/**
 * Calcula a base única compartilhada ponderada para dízimo, oferta e primícias:
 * Soma valor_efetivo de cada ocorrência do mês.
 */
export function calcularBaseCompartilhadaDizimo(
  ocorrencias: Array<{
    valor_pago?: number | null
    dizimo_percentual?: number | null
    expand?: {
      compromisso?: {
        dizimo_percentual?: number | null
      }
    }
  }>,
): number {
  return ocorrencias.reduce((acc, oc) => acc + calcularValorEfetivoBaseDizimo(oc), 0)
}
