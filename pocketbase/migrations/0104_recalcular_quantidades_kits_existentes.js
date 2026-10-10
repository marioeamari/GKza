migrate(
  (app) => {
    // Corrige os pedidos existentes gravados com quantidade_total = 1 cujo SKU/produto indica kit de N peças
    // Caso real citado pelo usuário: SKU RMickeyMinnie-20 gravado com quantidade_total = 1 -> atualizar para 20
    try {
      app
        .db()
        .newQuery(`
        UPDATE kit_pedidos
        SET quantidade_total = 20
        WHERE quantidade_total = 1
          AND (sku LIKE '%RMickeyMinnie-20%' OR produto_nome LIKE '20 Toalhas%')
      `)
        .execute()

      // Padrões gerais para pedidos existentes no banco:
      // Sufixo -20
      app
        .db()
        .newQuery(`
        UPDATE kit_pedidos
        SET quantidade_total = 20
        WHERE quantidade_total = 1
          AND (sku LIKE '%-20' OR sku LIKE '%_20')
      `)
        .execute()

      // Sufixo -30
      app
        .db()
        .newQuery(`
        UPDATE kit_pedidos
        SET quantidade_total = 30
        WHERE quantidade_total = 1
          AND (sku LIKE '%-30' OR sku LIKE '%_30' OR produto_nome LIKE '30 Toalhas%' OR produto_nome LIKE '30 Rosto%')
      `)
        .execute()

      // Sufixo -31
      app
        .db()
        .newQuery(`
        UPDATE kit_pedidos
        SET quantidade_total = 31
        WHERE quantidade_total = 1
          AND (sku LIKE '%-31' OR sku LIKE '%_31' OR produto_nome LIKE '31 Rosto%')
      `)
        .execute()

      // Sufixo -40
      app
        .db()
        .newQuery(`
        UPDATE kit_pedidos
        SET quantidade_total = 40
        WHERE quantidade_total = 1
          AND (sku LIKE '%-40' OR sku LIKE '%_40' OR produto_nome LIKE '40 Toalhas%' OR produto_nome LIKE '40 Rosto%')
      `)
        .execute()

      // Sufixo -50
      app
        .db()
        .newQuery(`
        UPDATE kit_pedidos
        SET quantidade_total = 50
        WHERE quantidade_total = 1
          AND (sku LIKE '%-50' OR sku LIKE '%_50' OR produto_nome LIKE '50 Toalhas%')
      `)
        .execute()
    } catch (e) {
      console.log('Aviso na migração de recálculo de quantidades de kit_pedidos:', e)
    }
  },
  (app) => {
    // Reversão não necessária para correção de dados legados
  },
)
