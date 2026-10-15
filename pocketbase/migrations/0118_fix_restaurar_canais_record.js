migrate(
  (app) => {
    // Atualizar ku62nblv0yg1bvi e 4qgwnkfbuasncvh com os canais extraídos de seus totais_por_canal
    const targetIds = ['ku62nblv0yg1bvi', '4qgwnkfbuasncvh']
    for (let i = 0; i < targetIds.length; i++) {
      const orcId = targetIds[i]
      try {
        const orc = app.findRecordById('orcamentos', orcId)
        const totais = orc.get('totais_por_canal')
        console.log('ORC ' + orcId + ' totais: ' + JSON.stringify(totais))
        let chaves = []
        if (typeof totais === 'object' && totais !== null) {
          chaves = Object.keys(totais)
        } else if (typeof totais === 'string') {
          chaves = Object.keys(JSON.parse(totais))
        }
        console.log('ORC ' + orcId + ' chaves: ' + JSON.stringify(chaves))
        if (chaves.length > 0) {
          orc.set('canais_comparados', chaves)
          app.save(orc)
          console.log(
            'ORC ' + orcId + ' salvo com: ' + JSON.stringify(orc.get('canais_comparados')),
          )
        }
      } catch (err) {
        console.log('Erro no orc ' + orcId + ': ' + err)
      }
    }
  },
  (app) => {},
)
