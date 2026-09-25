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

    function addMembro(grupoId, tipo, refId) {
      if (!grupoId || !refId) return
      const filter = `grupo = '${grupoId}' && tipo = '${tipo}' && ${tipo} = '${refId}'`
      const existing = app.findRecordsByFilter('contexto_grupo_membros', filter, '', 1, 0)
      if (existing.length === 0) {
        const m = new Record(app.findCollectionByNameOrId('contexto_grupo_membros'))
        m.set('grupo', grupoId)
        m.set('tipo', tipo)
        m.set(tipo, refId)
        app.save(m)
        console.log(`Membro inserido: grupo=${grupoId}, tipo=${tipo}, ref=${refId}`)
      } else {
        console.log(`Membro já existe: grupo=${grupoId}, tipo=${tipo}, ref=${refId}`)
      }
    }

    // 1. Localizar a pessoa "Mario Eduardo Alves Mari"
    let pessoaMario = findRecord(
      'pessoas',
      "cpf = '304.506.388-80' || id = 'ym6k6cnv78hwjk1' || nome ~ 'Mario Eduardo'",
    )
    if (!pessoaMario) {
      console.log('Aviso: Pessoa Mario Eduardo Alves Mari não foi encontrada em pessoas.')
    }

    // 2. Localizar grupos de contexto
    const grupoCasa = findRecord('contexto_grupos', "nome = 'Casa'")
    const grupoFilhas = findRecord('contexto_grupos', "nome = 'Filhas'")
    const grupoPessoal = findRecord('contexto_grupos', "nome = 'Pessoal (CPF)'")
    const grupoEstrela = findRecord('contexto_grupos', "nome = 'Padaria Estrela Dourada'")
    const grupoBelaVista = findRecord('contexto_grupos', "nome = 'Bela Vista Suprimentos'")
    const grupoHolding = findRecord('contexto_grupos', "nome = 'Empresas Agrupadas (PJ)'")

    // Adicionar membro pessoa nos grupos "Casa", "Filhas" e "Pessoal (CPF)"
    if (pessoaMario) {
      if (grupoCasa) addMembro(grupoCasa.id, 'pessoa', pessoaMario.id)
      if (grupoFilhas) addMembro(grupoFilhas.id, 'pessoa', pessoaMario.id)
      if (grupoPessoal) addMembro(grupoPessoal.id, 'pessoa', pessoaMario.id)
    }

    // 3. Localizar empresas correspondentes
    // Para Padaria Estrela Dourada: procurar por nome fantasia ou razao social que contenha "Estrela" ou "Padaria"
    const empEstrela = findRecord(
      'empresas',
      "nome_fantasia ~ 'Estrela' || razao_social ~ 'Estrela' || nome_fantasia ~ 'Padaria'",
    )
    if (empEstrela) {
      if (grupoEstrela) addMembro(grupoEstrela.id, 'empresa', empEstrela.id)
      if (grupoHolding) addMembro(grupoHolding.id, 'empresa', empEstrela.id)
    } else {
      console.log(
        'Aviso: Empresa para "Padaria Estrela Dourada" não encontrada na coleção empresas.',
      )
    }

    // Para Bela Vista Suprimentos: procurar por "Bela Vista"
    const empBelaVista = findRecord(
      'empresas',
      "nome_fantasia ~ 'Bela Vista' || razao_social ~ 'Bela Vista'",
    )
    if (empBelaVista) {
      if (grupoBelaVista) addMembro(grupoBelaVista.id, 'empresa', empBelaVista.id)
      if (grupoHolding) addMembro(grupoHolding.id, 'empresa', empBelaVista.id)
    } else {
      console.log(
        'Aviso: Empresa para "Bela Vista Suprimentos" não encontrada na coleção empresas.',
      )
    }
  },
  (app) => {
    // Reversão opcional (não remove se não precisar desestruturar dados)
  },
)
