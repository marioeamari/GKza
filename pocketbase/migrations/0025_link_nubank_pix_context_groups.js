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

    // 1. Localizar conta NuBank Pix (por id fixo sglo7dfsqvgfsni ou por nome)
    const contaNuBank =
      findRecord('contas', "id = 'sglo7dfsqvgfsni'") ||
      findRecord('contas', "nome = 'NuBank Pix'") ||
      findRecord('contas', "nome ~ 'NuBank Pix'")

    if (!contaNuBank) {
      console.log('Aviso: Conta NuBank Pix não encontrada na coleção contas.')
      return
    }

    // 2. Localizar grupos de contexto "Casa" e "Pessoal (CPF)" (por id ou nome)
    const grupoCasa =
      findRecord('contexto_grupos', "id = 'kfe3wz2yjrluuwp'") ||
      findRecord('contexto_grupos', "nome = 'Casa'")

    const grupoPessoal =
      findRecord('contexto_grupos', "id = '6zehb7d4lafm3gj'") ||
      findRecord('contexto_grupos', "nome = 'Pessoal (CPF)'")

    if (grupoCasa) {
      addMembroConta(grupoCasa.id, contaNuBank.id)
    } else {
      console.log('Aviso: Grupo "Casa" não encontrado.')
    }

    if (grupoPessoal) {
      addMembroConta(grupoPessoal.id, contaNuBank.id)
    } else {
      console.log('Aviso: Grupo "Pessoal (CPF)" não encontrado.')
    }
  },
  (app) => {
    // Reversão opcional limpa apenas se necessário
    try {
      const contaNuBank = app.findRecordsByFilter(
        'contas',
        "id = 'sglo7dfsqvgfsni' || nome = 'NuBank Pix'",
        '',
        1,
        0,
      )[0]
      if (contaNuBank) {
        const membros = app.findRecordsByFilter(
          'contexto_grupo_membros',
          `conta = '${contaNuBank.id}'`,
          '',
          50,
          0,
        )
        for (let i = 0; i < membros.length; i++) {
          app.delete(membros[i])
        }
      }
    } catch (_) {}
  },
)
