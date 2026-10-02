migrate(
  (app) => {
    const origemId = '40iihpvg0n66ezh' // NuBank t
    const destinoId = 'sglo7dfsqvgfsni' // NuBank

    // 1. Remapear despesas_ocorrencias vinculadas à conta NuBank t
    app
      .db()
      .newQuery('UPDATE despesas_ocorrencias SET conta = {:destinoId} WHERE conta = {:origemId}')
      .bind({ origemId, destinoId })
      .execute()

    // 2. Remapear despesas_compromisso com conta_padrao NuBank t
    app
      .db()
      .newQuery(
        'UPDATE despesas_compromisso SET conta_padrao = {:destinoId} WHERE conta_padrao = {:origemId}',
      )
      .bind({ origemId, destinoId })
      .execute()

    // 3. Remapear lancamentos com conta NuBank t
    app
      .db()
      .newQuery('UPDATE lancamentos SET conta = {:destinoId} WHERE conta = {:origemId}')
      .bind({ origemId, destinoId })
      .execute()

    // 4. Remapear lancamentos com cartao_fatura_conta NuBank t
    app
      .db()
      .newQuery(
        'UPDATE lancamentos SET cartao_fatura_conta = {:destinoId} WHERE cartao_fatura_conta = {:origemId}',
      )
      .bind({ origemId, destinoId })
      .execute()

    // 5. Remapear telegram_registros_pendentes vinculados a NuBank t
    app
      .db()
      .newQuery(
        'UPDATE telegram_registros_pendentes SET conta = {:destinoId} WHERE conta = {:origemId}',
      )
      .bind({ origemId, destinoId })
      .execute()

    // 6. Remapear metodos_pagamento vinculados a NuBank t (caso haja)
    app
      .db()
      .newQuery(
        'UPDATE metodos_pagamento SET conta_padrao = {:destinoId} WHERE conta_padrao = {:origemId}',
      )
      .bind({ origemId, destinoId })
      .execute()

    // 7. Remapear marketplace_contas vinculadas a NuBank t (caso haja)
    app
      .db()
      .newQuery('UPDATE marketplace_contas SET conta = {:destinoId} WHERE conta = {:origemId}')
      .bind({ origemId, destinoId })
      .execute()

    // 8. Desativar a conta NuBank t para não aparecer mais como grupo ativo
    app
      .db()
      .newQuery('UPDATE contas SET ativa = 0 WHERE id = {:origemId}')
      .bind({ origemId })
      .execute()
  },
  (app) => {
    const origemId = '40iihpvg0n66ezh'
    // Reverter desativação da conta origem
    app
      .db()
      .newQuery('UPDATE contas SET ativa = 1 WHERE id = {:origemId}')
      .bind({ origemId })
      .execute()
  },
)
