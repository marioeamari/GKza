migrate(
  (app) => {
    // 1. Corrigir especificamente a ocorrência p31tybdjwcj0fpv do compromisso IPTU (jhne6cxkdo5srp9)
    // Movendo da data retroativa (2026-01-28) para a próxima data futura correta (2027-01-28 12:00:00.000Z, competencia 2027-01)
    // Preservando apenas se status for 'prevista' e sem lancamento financeiro vinculado.
    app
      .db()
      .newQuery(`
      UPDATE despesas_ocorrencias
      SET
        data_vencimento = '2027-01-28 12:00:00.000Z',
        competencia = '2027-01'
      WHERE
        id = 'p31tybdjwcj0fpv'
        AND status = 'prevista'
        AND (lancamento IS NULL OR lancamento = '')
    `)
      .execute()

    // 2. Corrigir quaisquer outras ocorrências anuais em aberto (status 'prevista' e sem baixa)
    // geradas no passado em 2026 antes de 2026-09-25 para o ano seguinte
    app
      .db()
      .newQuery(`
      UPDATE despesas_ocorrencias
      SET
        data_vencimento = strftime('%Y', data_vencimento) + 1 || substr(data_vencimento, 5),
        competencia = strftime('%Y', data_vencimento) + 1 || '-' || substr(competencia, 6)
      WHERE
        status = 'prevista'
        AND (lancamento IS NULL OR lancamento = '')
        AND secao = 'assinaturas_anuais'
        AND data_vencimento < '2026-09-25'
    `)
      .execute()
  },
  (app) => {
    // Reversão
    app
      .db()
      .newQuery(`
      UPDATE despesas_ocorrencias
      SET
        data_vencimento = '2026-01-28 00:00:00.000Z',
        competencia = '2026-01'
      WHERE
        id = 'p31tybdjwcj0fpv'
    `)
      .execute()
  },
)
