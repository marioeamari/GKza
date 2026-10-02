migrate(
  (app) => {
    const contas = app.findCollectionByNameOrId('contas')

    // 1. Campo natureza (fisica | juridica)
    if (!contas.fields.getByName('natureza')) {
      contas.fields.add(
        new SelectField({
          name: 'natureza',
          required: false,
          maxSelect: 1,
          values: ['fisica', 'juridica'],
        }),
      )
    }

    // 2. Campo tipos_pagamento (credito, debito, transferencia, boletos, pix)
    if (!contas.fields.getByName('tipos_pagamento')) {
      contas.fields.add(
        new SelectField({
          name: 'tipos_pagamento',
          required: false,
          maxSelect: 5,
          values: ['credito', 'debito', 'transferencia', 'boletos', 'pix'],
        }),
      )
    }

    app.save(contas)

    // 3. Preencher valores padrão coerentes para contas existentes
    const allContas = app.findRecordsByFilter('contas', '', 'created', 100, 0)
    for (let i = 0; i < allContas.length; i++) {
      const conta = allContas[i]
      const nomeLower = conta.getString('nome').toLowerCase()
      const tipo = conta.getString('tipo')

      // Determinar natureza: se tem '[cnpj]' ou 'pj' no nome -> juridica; se tem '[cpf]' -> fisica; caso contrário:
      let natureza = 'juridica'
      if (
        nomeLower.includes('[cpf]') ||
        nomeLower.includes('pf') ||
        nomeLower.includes('pessoal')
      ) {
        natureza = 'fisica'
      } else if (
        nomeLower.includes('[cnpj]') ||
        nomeLower.includes('pj') ||
        nomeLower.includes('empresa') ||
        nomeLower.includes('gkza') ||
        nomeLower.includes('wee')
      ) {
        natureza = 'juridica'
      } else {
        natureza = 'fisica'
      }
      conta.set('natureza', natureza)

      // Determinar tipos_pagamento
      let tipos = []
      if (tipo === 'cartao') {
        tipos = ['credito']
      } else if (tipo === 'bancaria') {
        tipos = ['debito', 'transferencia', 'boletos', 'pix']
      } else if (tipo === 'caixa') {
        // Para caixa, pode aceitar movimentações de pix, transferencia, debito e boletos
        tipos = ['pix', 'debito', 'transferencia', 'boletos']
      } else {
        tipos = ['transferencia', 'pix']
      }

      conta.set('tipos_pagamento', tipos)
      app.save(conta)
    }

    // 4. Migração de despesas existentes da seção 'contas_mensais_pix_boleto':
    // Se a despesa tiver conta_padrao do tipo cartao, atualiza secao para 'cartoes_credito'
    // Se a despesa tiver conta_padrao mas não for cartão, as telas agora agrupam por conta.
    // Para garantir consistência dos dados, compromissos que têm conta_padrao de cartão passam para 'cartoes_credito'
    const compsContas = app.findRecordsByFilter(
      'despesas_compromisso',
      "secao = 'contas_mensais_pix_boleto'",
      'created',
      500,
      0,
    )
    for (let i = 0; i < compsContas.length; i++) {
      const comp = compsContas[i]
      const contaPadraoId = comp.getString('conta_padrao')
      if (contaPadraoId) {
        try {
          const c = app.findFirstRecordByData('contas', 'id', contaPadraoId)
          if (c && c.getString('tipo') === 'cartao') {
            comp.set('secao', 'cartoes_credito')
            app.save(comp)
          }
        } catch (_) {}
      }
    }

    const ocorrsContas = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "secao = 'contas_mensais_pix_boleto'",
      'created',
      500,
      0,
    )
    for (let i = 0; i < ocorrsContas.length; i++) {
      const oc = ocorrsContas[i]
      const contaId = oc.getString('conta')
      if (contaId) {
        try {
          const c = app.findFirstRecordByData('contas', 'id', contaId)
          if (c && c.getString('tipo') === 'cartao') {
            oc.set('secao', 'cartoes_credito')
            app.save(oc)
          }
        } catch (_) {}
      }
    }
  },
  (app) => {
    const contas = app.findCollectionByNameOrId('contas')
    try {
      contas.fields.removeByName('natureza')
      contas.fields.removeByName('tipos_pagamento')
      app.save(contas)
    } catch (_) {}
  },
)
