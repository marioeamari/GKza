migrate(
  (app) => {
    // TAREFA 2: Apagar ocorrências fantasma
    // Critérios estritos:
    // 1. status = 'prevista'
    // 2. lancamento IS NULL OR lancamento = ''
    // 3. valor_pago = 0 ou nulo
    // 4. data_pagamento IS NULL OR data_pagamento = ''
    // 5. competência ou vencimento anterior ao mês de data_inicio do compromisso vinculado
    // (inclui as 6 de agosto de 2026 criadas indevidamente para compromissos com data_inicio em setembro/2026)
    // NUNCA apagar ocorrências pagas nem com lançamento vinculado sob nenhuma hipótese!

    // 1. Deletar ocorrências mensais/gerais fantasmas onde competencia < mês de data_inicio do compromisso
    app
      .db()
      .newQuery(`
      DELETE FROM despesas_ocorrencias
      WHERE
        status = 'prevista'
        AND (lancamento IS NULL OR lancamento = '')
        AND (data_pagamento IS NULL OR data_pagamento = '')
        AND (valor_pago IS NULL OR valor_pago = 0)
        AND id IN (
          SELECT o.id
          FROM despesas_ocorrencias o
          JOIN despesas_compromisso c ON c.id = o.compromisso
          WHERE o.competencia < substr(c.data_inicio, 1, 7)
        )
    `)
      .execute()

    // 2. Deletar também por segurança as 6 ocorrências especificamente identificadas caso alguma variação de data ocorra
    const idsFantasmas = [
      '7esixruwd264jtg',
      'lj5ju5brmdzxnvt',
      'tmx1rhipkpeatg0',
      'nw6peu6f5h538wy',
      'e7xatphp65gtyxw',
      'tjfebxnvfo7p5zi',
    ]

    for (let i = 0; i < idsFantasmas.length; i++) {
      app
        .db()
        .newQuery(`
        DELETE FROM despesas_ocorrencias
        WHERE
          id = {:id}
          AND status = 'prevista'
          AND (lancamento IS NULL OR lancamento = '')
          AND (data_pagamento IS NULL OR data_pagamento = '')
      `)
        .bind({ id: idsFantasmas[i] })
        .execute()
    }
  },
  (app) => {
    // Reversão não é necessária para limpeza de registros fantasma/inválidos
  },
)
