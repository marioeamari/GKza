migrate(
  (app) => {
    // Definir sku_por_canal do produto BLeve com B122 e B197 individualizados no canal nnnk28chx9llzmm
    const jsonStr = JSON.stringify([
      { canal: 'nnnk28chx9llzmm', sku_externo: 'B122' },
      { canal: 'nnnk28chx9llzmm', sku_externo: 'B197' },
    ])
    app
      .db()
      .newQuery('UPDATE prec_produtos SET sku_por_canal = {:val} WHERE id = {:id}')
      .bind({ val: jsonStr, id: 'lsilkiq8w2apfre' })
      .execute()
  },
  (app) => {
    // Reverter para array vazio se necessário
    app
      .db()
      .newQuery("UPDATE prec_produtos SET sku_por_canal = '[]' WHERE id = {:id}")
      .bind({ id: 'lsilkiq8w2apfre' })
      .execute()
  },
)
