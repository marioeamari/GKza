migrate(
  (app) => {
    // Corrige inconsistência em parcelas marcadas como pagas com valor_pago = 0 ou nulo
    // Uma parcela com status 'paga' e valor_pago zerado/nulo deve ter valor_pago = valor previsto.
    try {
      const records = app.findRecordsByFilter(
        'dividas_parcelas',
        "status = 'paga' && (valor_pago = 0 || valor_pago = null)",
        '-created',
        500,
      )

      for (const record of records) {
        const valorPrevisto = record.getFloat('valor')
        if (valorPrevisto > 0) {
          record.set('valor_pago', valorPrevisto)
          // Se data_pagamento estiver vazia, usa a data de vencimento
          const dataPag = record.getString('data_pagamento')
          if (!dataPag) {
            record.set('data_pagamento', record.getString('data_vencimento'))
          }
          app.save(record)
        }
      }
    } catch (err) {
      console.warn('Migração 0138 - aviso na correção de parcelas pagas:', err)
    }
  },
  (app) => {
    // Reversão não aplicável pois restauração de dado zerado inconsistente não é desejada
  },
)
