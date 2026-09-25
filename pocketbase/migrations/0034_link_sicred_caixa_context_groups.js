migrate(
  (app) => {
    function findRecord(collection, filter) {
      try {
        const records = app.findRecordsByFilter(collection, filter, '', 1, 0)
        return records.length > 0 ? records[0] : null
      } catch (err) {
        console.log(`Erro ao buscar ${collection} com filter [${filter}]:`, err)
        return null
      }
    }

    function addMembroConta(grupoId, contaId) {
      if (!grupoId || !contaId) return
      const filter = `grupo = '${grupoId}' && tipo = 'conta' && conta = '${contaId}'`
      const existing = app.findRecordsByFilter('contexto_grupo_membros', filter, '', 1, 0)
      if (existing.length === 0) {
        const m = new Record(app.findCollectionByNameOrId('contexto_grupo_membros'))
        m.set('grupo', grupoId)
        m.set('tipo', 'conta')
        m.set('conta', contaId)
        app.save(m)
        console.log(`Membro conta vinculado: grupo=${grupoId}, conta=${contaId}`)
      } else {
        console.log(`Membro conta já existe: grupo=${grupoId}, conta=${contaId}`)
      }
    }

    // 1. Localizar conta Sicred Caixa (por id qgdga7rawa3p00a ou por nome)
    const contaSicredCaixa =
      findRecord('contas', "id = 'qgdga7rawa3p00a'") ||
      findRecord('contas', "nome = 'Sicred Caixa'") ||
      findRecord('contas', "nome ~ 'Sicred Caixa'")

    if (!contaSicredCaixa) {
      console.log('Aviso: Conta Sicred Caixa não encontrada na coleção contas.')
      return
    }

    // 2. Localizar grupos de contexto "Casa" e "Pessoal (CPF)"
    const grupoCasa =
      findRecord('contexto_grupos', "id = 'kfe3wz2yjrluuwp'") ||
      findRecord('contexto_grupos', "nome = 'Casa'")

    const grupoPessoal =
      findRecord('contexto_grupos', "id = '6zehb7d4lafm3gj'") ||
      findRecord('contexto_grupos', "nome = 'Pessoal (CPF)'")

    if (grupoCasa) {
      addMembroConta(grupoCasa.id, contaSicredCaixa.id)
    } else {
      console.log('Aviso: Grupo "Casa" não encontrado.')
    }

    if (grupoPessoal) {
      addMembroConta(grupoPessoal.id, contaSicredCaixa.id)
    } else {
      console.log('Aviso: Grupo "Pessoal (CPF)" não encontrado.')
    }
  },
  (app) => {
    // Reversão
    try {
      const contaSicredCaixa = app.findRecordsByFilter(
        'contas',
        "id = 'qgdga7rawa3p00a' || nome = 'Sicred Caixa'",
        '',
        1,
        0,
      )[0]
      const grupoCasa = app.findRecordsByFilter(
        'contexto_grupos',
        "id = 'kfe3wz2yjrluuwp' || nome = 'Casa'",
        '',
        1,
        0,
      )[0]
      const grupoPessoal = app.findRecordsByFilter(
        'contexto_grupos',
        "id = '6zehb7d4lafm3gj' || nome = 'Pessoal (CPF)'",
        '',
        1,
        0,
      )[0]

      if (contaSicredCaixa) {
        if (grupoCasa) {
          const membrosCasa = app.findRecordsByFilter(
            'contexto_grupo_membros',
            `grupo = '${grupoCasa.id}' && conta = '${contaSicredCaixa.id}'`,
            '',
            10,
            0,
          )
          for (let i = 0; i < membrosCasa.length; i++) {
            app.delete(membrosCasa[i])
          }
        }
        if (grupoPessoal) {
          const membrosPessoal = app.findRecordsByFilter(
            'contexto_grupo_membros',
            `grupo = '${grupoPessoal.id}' && conta = '${contaSicredCaixa.id}'`,
            '',
            10,
            0,
          )
          for (let i = 0; i < membrosPessoal.length; i++) {
            app.delete(membrosPessoal[i])
          }
        }
      }
    } catch (_) {}
  },
)
