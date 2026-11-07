/// Regra de recorrência da agenda (0.0.299, migração 0150): compromissos manuais
/// recorrentes podem ter ocorrências individuais excluídas. As datas excluídas
/// (YYYY-MM-DD, fuso America/Sao_Paulo) ficam gravadas em
/// agenda_eventos.recorrencia_excecoes (JSON array) e a projeção do calendário
/// pula essas ocorrências. A série em si nunca é removida por aqui — para apagar
/// tudo, o registro é excluído (deleteEvento). Eventos do Google (origem 'google')
/// continuam gerenciados pela sincronização (0.0.296/0.0.298) e não recebem exceções.

export const CAMPO_EXCECOES = 'recorrencia_excecoes'

/** Extrai o dia YYYY-MM-DD de uma data do evento (pura, ISO ou estilo PocketBase). */
export function dataOcorrenciaDeEvento(dataEvento: string | undefined, diaBase: string): string {
  if (!dataEvento) return diaBase
  const s = String(dataEvento).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (s.includes('T') || s.includes(' ')) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      // getLocalDateStr usa America/Sao_Paulo — o mesmo fuso da projeção da agenda
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d)
      const y = parts.find((p) => p.type === 'year')?.value
      const m = parts.find((p) => p.type === 'month')?.value
      const dd = parts.find((p) => p.type === 'day')?.value
      if (y && m && dd) return `${y}-${m}-${dd}`
    }
  }
  return diaBase
}

/** Lê a lista de dias excluídos de um evento de forma tolerante (JSON inválido = vazio). */
export function lerExcecoes(json: string | undefined | null): string[] {
  if (!json || !json.trim()) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((v) => {
        const s = String(v ?? '').trim()
        const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
        return m ? m[1] : null
      })
      .filter((v): v is string => !!v)
  } catch {
    return []
  }
}

/** true quando a ocorrência do dia `dataOcorrencia` foi excluída da série. */
export function isOcorrenciaExcluida(
  excecoesJson: string | undefined | null,
  dataOcorrencia: string | undefined,
): boolean {
  if (!excecoesJson || !dataOcorrencia) return false
  const dia = dataOcorrenciaDeEvento(dataOcorrencia, dataOcorrencia.slice(0, 10))
  return lerExcecoes(excecoesJson).includes(dia)
}

/** Adiciona um dia às exceções, deduplicado e ordenado. */
export function adicionarExcecao(json: string | undefined | null, dataOcorrencia: string): string {
  const dia = dataOcorrenciaDeEvento(dataOcorrencia, dataOcorrencia.slice(0, 10))
  const dias = lerExcecoes(json)
  if (!dias.includes(dia)) dias.push(dia)
  return JSON.stringify([...dias].sort())
}
