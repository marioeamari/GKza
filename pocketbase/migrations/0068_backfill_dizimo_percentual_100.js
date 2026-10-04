migrate(
  (app) => {
    // Backfill: setar 100 em todos os registros existentes onde dizimo_percentual for 0 ou nulo
    // Como a regra de negócio diz que todas as despesas anteriores tinham 100% de dízimo se dizimo=true ou default 100%,
    // atualizamos para 100.
    app
      .db()
      .newQuery(`
      UPDATE despesas_compromisso
      SET dizimo_percentual = 100
      WHERE dizimo_percentual IS NULL OR dizimo_percentual = 0
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE despesas_ocorrencias
      SET dizimo_percentual = 100
      WHERE dizimo_percentual IS NULL OR dizimo_percentual = 0
    `)
      .execute()
  },
  (app) => {
    // noop
  },
)
