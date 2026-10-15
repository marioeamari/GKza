migrate(
  (app) => {
    // 1. Encontrar todos os orçamentos via SDK
    const orcamentos = app.findRecordsByFilter('orcamentos', '1=1', '', 500, 0)
    for (let i = 0; i < orcamentos.length; i++) {
      const orc = orcamentos[i]
      const totaisRaw = orc.get('totais_por_canal')
      if (!totaisRaw) continue

      let parsed = null
      if (typeof totaisRaw === 'object' && !Array.isArray(totaisRaw)) {
        parsed = totaisRaw
      } else if (typeof totaisRaw === 'string') {
        try {
          parsed = JSON.parse(totaisRaw)
        } catch (_) {}
      }

      if (parsed && typeof parsed === 'object') {
        const canais = Object.keys(parsed)
        if (canais.length > 0) {
          const jsonVal = JSON.stringify(canais)
          app
            .db()
            .newQuery('UPDATE orcamentos SET canais_comparados = {:canais} WHERE id = {:id}')
            .bind({
              canais: jsonVal,
              id: orc.id,
            })
            .execute()
        }
      }
    }
  },
  (app) => {},
)
