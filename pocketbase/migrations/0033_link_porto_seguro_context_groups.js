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

    // 1. Localizar conta Porto Seguro (por id i7awiahmjyczikk ou por nome)
    const contaPorto =
      findRecord('contas', "id = 'i7awiahmjyczikk'") ||
      findRecord('contas', "nome = 'Porto Seguro'") ||
      findRecord('contas', "nome ~ 'Porto Seguro'")

    if (!contaPorto) {
      console.log('Aviso: Conta Porto Seguro não encontrada na coleção contas.')
    } else {
      contaPorto.set('tipo', 'cartao')
      contaPorto.set('ativa', true)
      if (!contaPorto.get('dia_fechamento')) contaPorto.set('dia_fechamento', 16)
      if (!contaPorto.get('dia_vencimento')) contaPorto.set('dia_vencimento', 20)
      app.save(contaPorto)

      // 2. Vincular aos grupos de contexto "Casa" (kfe3wz2yjrluuwp) e "Pessoal (CPF)" (6zehb7d4lafm3gj)
      const grupoCasa =
        findRecord('contexto_grupos', "id = 'kfe3wz2yjrluuwp'") ||
        findRecord('contexto_grupos', "nome = 'Casa'")

      const grupoPessoal =
        findRecord('contexto_grupos', "id = '6zehb7d4lafm3gj'") ||
        findRecord('contexto_grupos', "nome = 'Pessoal (CPF)'")

      if (grupoCasa) {
        addMembroConta(grupoCasa.id, contaPorto.id)
      } else {
        console.log('Aviso: Grupo "Casa" não encontrado.')
      }

      if (grupoPessoal) {
        addMembroConta(grupoPessoal.id, contaPorto.id)
      } else {
        console.log('Aviso: Grupo "Pessoal (CPF)" não encontrado.')
      }
    }

    // 3. Verificação e preservação dos lançamentos do Seguro TORO:
    // Os dois lançamentos (y5l45yl7n0txer0 e 4wnkw1pbm0f3yls) representam um split 50/50
    // legítimo (um pessoal sem empresa, vinculado a compromisso s3hdt5j8u717vcw e outro empresarial KzaMari
    // c8v8eg0errmelt6, vinculado a compromisso nl2pkz38d56eaf5, conforme registrado na observação:
    // "O valor da parcela é 50% do valor, pois o veículo é para uso pessoal e empresarial").
    // Portanto, ambos são legítimos e NÃO devem ser deletados, preservando os vínculos com as ocorrências.
  },
  (app) => {
    // Reversão
    try {
      const contaPorto = app.findRecordsByFilter(
        'contas',
        "id = 'i7awiahmjyczikk' || nome = 'Porto Seguro'",
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

      if (contaPorto && grupoCasa) {
        const membros = app.findRecordsByFilter(
          'contexto_grupo_membros',
          `grupo = '${grupoCasa.id}' && conta = '${contaPorto.id}'`,
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
