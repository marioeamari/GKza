migrate(
  (app) => {
    // Sincronizar ocorrências pendentes (status 'prevista') de compromissos existentes
    // cujo valor_previsto difere do valor_estimado / valor_parcela do compromisso,
    // desde que não tenham sido ajustadas manualmente (valor_ajustado_manualmente != true).
    // Caso em foco: Compromisso Ballet Rafa (id jban1r7bqdg8v5q) e outras despesas editadas.
    app
      .db()
      .newQuery(`
      UPDATE despesas_ocorrencias
      SET
        valor_previsto = (
          SELECT CASE
            WHEN (c.modalidade_parcelamento = 'parcelado' OR c.regra_repeticao = 'parcelado') AND c.valor_parcela > 0
            THEN c.valor_parcela
            ELSE c.valor_estimado
          END
          FROM despesas_compromisso c
          WHERE c.id = despesas_ocorrencias.compromisso
        ),
        valor_estimado_original = (
          SELECT CASE
            WHEN (c.modalidade_parcelamento = 'parcelado' OR c.regra_repeticao = 'parcelado') AND c.valor_parcela > 0
            THEN c.valor_parcela
            ELSE c.valor_estimado
          END
          FROM despesas_compromisso c
          WHERE c.id = despesas_ocorrencias.compromisso
        )
      WHERE
        status = 'prevista'
        AND (valor_ajustado_manualmente IS NULL OR valor_ajustado_manualmente = FALSE)
        AND compromisso IN (
          SELECT id FROM despesas_compromisso
        )
        AND valor_previsto != (
          SELECT CASE
            WHEN (c.modalidade_parcelamento = 'parcelado' OR c.regra_repeticao = 'parcelado') AND c.valor_parcela > 0
            THEN c.valor_parcela
            ELSE c.valor_estimado
          END
          FROM despesas_compromisso c
          WHERE c.id = despesas_ocorrencias.compromisso
        )
    `)
      .execute()
  },
  (app) => {
    // Reversão no-op pois restauração de valores incorretos pré-edição não é desejável
  },
)
