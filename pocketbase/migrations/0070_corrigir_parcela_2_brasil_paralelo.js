migrate(
  (app) => {
    // FRENTE 1: Correção pontual da parcela 2/12 da "Assinatura Brasil Paralelo"
    // Parcela 2 gerada incorretamente com competência '2026-09' e vencimento '2026-09-20'
    // O usuário registrou pagamento na fatura de outubro, mas foi gravado em 2026-09.
    // Atualiza a ocorrência para competência '2026-10' e vencimento '2026-10-20'.
    // Atualiza o lançamento vinculado para competência '2026-10'.

    // 1. Atualizar ocorrência da parcela 2 se estiver com competência '2026-09'
    app
      .db()
      .newQuery(`
      UPDATE despesas_ocorrencias
      SET competencia = '2026-10',
          data_vencimento = '2026-10-20 12:00:00.000Z'
      WHERE id IN (
        SELECT o.id
        FROM despesas_ocorrencias o
        JOIN despesas_compromisso c ON c.id = o.compromisso
        WHERE c.descricao LIKE '%Brasil Paralelo%'
          AND o.numero_parcela = 2
          AND o.competencia = '2026-09'
      )
    `)
      .execute()

    // 2. Atualizar lançamento associado à parcela 2 da Assinatura Brasil Paralelo
    app
      .db()
      .newQuery(`
      UPDATE lancamentos
      SET competencia = '2026-10'
      WHERE id IN (
        SELECT o.lancamento
        FROM despesas_ocorrencias o
        JOIN despesas_compromisso c ON c.id = o.compromisso
        WHERE c.descricao LIKE '%Brasil Paralelo%'
          AND o.numero_parcela = 2
          AND o.lancamento IS NOT NULL
          AND o.lancamento != ''
      )
      AND competencia = '2026-09'
    `)
      .execute()
  },
  (app) => {
    // Reverter caso necessário
    app
      .db()
      .newQuery(`
      UPDATE despesas_ocorrencias
      SET competencia = '2026-09',
          data_vencimento = '2026-09-20 12:00:00.000Z'
      WHERE id IN (
        SELECT o.id
        FROM despesas_ocorrencias o
        JOIN despesas_compromisso c ON c.id = o.compromisso
        WHERE c.descricao LIKE '%Brasil Paralelo%'
          AND o.numero_parcela = 2
          AND o.competencia = '2026-10'
      )
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE lancamentos
      SET competencia = '2026-09'
      WHERE id IN (
        SELECT o.lancamento
        FROM despesas_ocorrencias o
        JOIN despesas_compromisso c ON c.id = o.compromisso
        WHERE c.descricao LIKE '%Brasil Paralelo%'
          AND o.numero_parcela = 2
          AND o.lancamento IS NOT NULL
          AND o.lancamento != ''
      )
      AND competencia = '2026-10'
    `)
      .execute()
  },
)
