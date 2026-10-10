migrate(
  (app) => {
    // 1. Limpar os pontos duplicados gerados durante o teste inicial (mantendo o mais recente por funcionário e data)
    // No SQLite / PocketBase:
    try {
      app
        .db()
        .newQuery(
          `DELETE FROM funcionarios_pontos
           WHERE id NOT IN (
             SELECT id FROM (
               SELECT id,
                      ROW_NUMBER() OVER (PARTITION BY funcionario, substr(data, 1, 10) ORDER BY created DESC) as rn
               FROM funcionarios_pontos
             ) WHERE rn = 1
           )`,
        )
        .execute()
    } catch (err) {
      console.warn('Erro ao deduplicar registros de teste em funcionarios_pontos:', err)
    }
  },
  (app) => {
    // Rollback não necessita restaurar registros de teste espúrios
  },
)
