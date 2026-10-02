migrate(
  (app) => {
    // 0060: Aplicar a regra "só o método Crédito entra no ciclo da fatura"
    // e migrar todas as despesas existentes para essa regra.

    // 1. Mapear métodos de pagamento que são crédito
    const todosMetodos = app.findRecordsByFilter('metodos_pagamento', 'id != ""', 'nome', 200, 0)
    const metodosCreditoSet = new Set()

    for (let i = 0; i < todosMetodos.length; i++) {
      const m = todosMetodos[i]
      const codigo = String(m.getString('codigo') || '')
        .toLowerCase()
        .trim()
      const nome = String(m.getString('nome') || '')
        .toLowerCase()
        .trim()
      const tipo = String(m.getString('tipo') || '')
        .toLowerCase()
        .trim()

      const ehDebito =
        nome.includes('débito') || nome.includes('debito') || codigo.includes('debito')
      if (ehDebito) {
        continue
      }

      if (
        codigo === 'credito' ||
        codigo === 'cartao_credito' ||
        codigo === 'cartao-credito' ||
        codigo === 'cartaocredito' ||
        nome.includes('crédito') ||
        nome.includes('credito') ||
        tipo === 'cartao' ||
        tipo === 'credito'
      ) {
        metodosCreditoSet.add(m.id)
      }
    }

    // 2. Buscar compromissos que estão com secao = 'cartoes_credito'
    const compromissos = app.findRecordsByFilter(
      'despesas_compromisso',
      "secao = 'cartoes_credito'",
      'created',
      500,
      0,
    )

    for (let i = 0; i < compromissos.length; i++) {
      const comp = compromissos[i]
      const mpId = comp.getString('metodo_pagamento')
      const ehCredito = mpId && metodosCreditoSet.has(mpId)

      // Se o método NÃO for crédito
      if (!ehCredito) {
        const regraRep = comp.getString('regra_repeticao')
        const novaSecao = regraRep === 'anual' ? 'assinaturas_anuais' : 'contas_mensais_pix_boleto'

        comp.set('secao', novaSecao)
        app.save(comp)

        // 3. Corrigir todas as ocorrências vinculadas a este compromisso
        const ocorrencias = app.findRecordsByFilter(
          'despesas_ocorrencias',
          `compromisso = "${comp.id}"`,
          'created',
          200,
          0,
        )

        for (let j = 0; j < ocorrencias.length; j++) {
          const oc = ocorrencias[j]

          // Preserva valores pagos, comprovantes, lançamentos etc.
          // Atualiza apenas secao, competencia e data_vencimento
          oc.set('secao', novaSecao)

          // Data de referência da despesa
          const dataDespRaw = String(
            oc.getString('data_vencimento') || comp.getString('data_inicio') || '',
          )
          const dataCompRaw = String(
            comp.getString('data_inicio') || oc.getString('data_vencimento') || '',
          )

          let dataRef = ''
          if (regraRep === 'avulso') {
            dataRef = dataCompRaw.slice(0, 10) || dataDespRaw.slice(0, 10)
          } else {
            dataRef = dataDespRaw.slice(0, 10) || dataCompRaw.slice(0, 10)
          }

          if (dataRef && dataRef.length >= 7) {
            const competenciaCorreta = dataRef.slice(0, 7)
            oc.set('competencia', competenciaCorreta)

            if (regraRep === 'avulso') {
              const hora = dataCompRaw.length >= 19 ? dataCompRaw.slice(11, 19) : '12:00:00'
              oc.set('data_vencimento', `${dataRef} ${hora}`)
            } else {
              const diaVenc = comp.getInt('dia_vencimento') || 10
              const parts = competenciaCorreta.split('-')
              const anoStr = parts[0]
              const mesStr = parts[1]
              const ano = parseInt(anoStr, 10)
              const mes = parseInt(mesStr, 10)
              const maxDia = new Date(ano, mes, 0).getDate()
              const diaReal = Math.min(diaVenc, maxDia)
              const diaFmt = String(diaReal).padStart(2, '0')
              oc.set('data_vencimento', `${anoStr}-${mesStr}-${diaFmt} 12:00:00`)
            }
          }

          app.save(oc)
        }
      }
    }
  },
  (app) => {
    // Reversão não necessária
  },
)
