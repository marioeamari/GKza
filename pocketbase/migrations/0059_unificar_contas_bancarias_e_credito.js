migrate(
  (app) => {
    // 0059: Garantir que contas legadas tipo 'cartao' possuam 'credito' em tipos_pagamento
    // e preservar tipo, dia_fechamento, dia_vencimento e bandeira para compatibilidade.
    const cartaoContas = app.findRecordsByFilter('contas', "tipo = 'cartao'", 'created', 200, 0)
    for (let i = 0; i < cartaoContas.length; i++) {
      const conta = cartaoContas[i]
      let tipos = []
      try {
        tipos = conta.get('tipos_pagamento') || []
        if (typeof tipos === 'string') {
          tipos = JSON.parse(tipos)
        }
      } catch (_) {
        tipos = []
      }
      if (!Array.isArray(tipos)) {
        tipos = []
      }

      if (!tipos.includes('credito')) {
        tipos.push('credito')
        conta.set('tipos_pagamento', tipos)
        app.save(conta)
      }
    }
  },
  (app) => {
    // Reverter não é estritamente necessário ou destrutivo
  },
)
