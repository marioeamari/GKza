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

    // 1. Localizar conta Sicred (por id d0gz9tg9aw8s9u1 ou por nome)
    const contaSicred =
      findRecord('contas', "id = 'd0gz9tg9aw8s9u1'") ||
      findRecord('contas', "nome = 'Sicred'") ||
      findRecord('contas', "nome ~ 'Sicred'")

    if (!contaSicred) {
      console.log('Aviso: Conta Sicred não encontrada na coleção contas.')
      return
    }

    // Garantir que a conta Sicred esteja configurada corretamente como cartão ativa
    contaSicred.set('tipo', 'cartao')
    contaSicred.set('ativa', true)
    if (!contaSicred.get('dia_fechamento')) contaSicred.set('dia_fechamento', 10)
    if (!contaSicred.get('dia_vencimento')) contaSicred.set('dia_vencimento', 12)
    app.save(contaSicred)

    // 2. Localizar grupos de contexto "Casa" e "Pessoal (CPF)"
    const grupoCasa =
      findRecord('contexto_grupos', "id = 'kfe3wz2yjrluuwp'") ||
      findRecord('contexto_grupos', "nome = 'Casa'")

    const grupoPessoal =
      findRecord('contexto_grupos', "id = '6zehb7d4lafm3gj'") ||
      findRecord('contexto_grupos', "nome = 'Pessoal (CPF)'")

    if (grupoCasa) {
      addMembroConta(grupoCasa.id, contaSicred.id)
    } else {
      console.log('Aviso: Grupo "Casa" não encontrado.')
    }

    if (grupoPessoal) {
      addMembroConta(grupoPessoal.id, contaSicred.id)
    } else {
      console.log('Aviso: Grupo "Pessoal (CPF)" não encontrado.')
    }
  },
  (app) => {
    // Reversão
    try {
      const contaSicred = app.findRecordsByFilter(
        'contas',
        "id = 'd0gz9tg9aw8s9u1' || nome = 'Sicred'",
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

      if (contaSicred && grupoCasa) {
        const membros = app.findRecordsByFilter(
          'contexto_grupo_membros',
          `grupo = '${grupoCasa.id}' && conta = '${contaSicred.id}'`,
          '',
          10,
          0,
        )
        for (let i = 0; i < membros.length; i++) {
          app.delete(membros[i])
        }
      }
    } catch (_) {}
  },
)
