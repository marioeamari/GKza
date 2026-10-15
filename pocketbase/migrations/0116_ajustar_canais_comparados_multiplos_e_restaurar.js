migrate(
  (app) => {
    // 1. Atualizar a coleção orcamentos para garantir que canais_comparados aceite múltiplos canais
    const orcamentosCol = app.findCollectionByNameOrId('orcamentos')
    const canaisField = orcamentosCol.fields.getByName('canais_comparados')
    if (canaisField) {
      // PocketBase RelationField: maxSelect define se é relação única (1) ou múltipla (>1 ou sem limite)
      // Se maxSelect for 1 ou nulo, ajusta para múltiplos (ex: 50 ou 0/indefinido)
      canaisField.maxSelect = 50
      app.save(orcamentosCol)
    }

    // 2. Restaurar canais_comparados dos orçamentos existentes a partir das chaves de totais_por_canal
    const orcamentos = app.findRecordsByFilter('orcamentos', '1=1', '', 500, 0)
    for (let i = 0; i < orcamentos.length; i++) {
      const orc = orcamentos[i]
      const totaisRaw = orc.get('totais_por_canal')
      let canaisIds = []

      if (totaisRaw) {
        if (typeof totaisRaw === 'object' && !Array.isArray(totaisRaw)) {
          canaisIds = Object.keys(totaisRaw)
        } else if (typeof totaisRaw === 'string') {
          try {
            const parsed = JSON.parse(totaisRaw)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              canaisIds = Object.keys(parsed)
            }
          } catch (_) {}
        }
      }

      // Se encontramos IDs de canais em totais_por_canal
      if (canaisIds.length > 0) {
        // Valida se os IDs existem em prec_canais para não gerar falha de chave estrangeira
        const canaisValidos = []
        for (let j = 0; j < canaisIds.length; j++) {
          const cId = canaisIds[j]
          try {
            const canalRec = app.findRecordById('prec_canais', cId)
            if (canalRec) {
              canaisValidos.push(cId)
            }
          } catch (_) {
            // Canal pode não existir ou ID inválido
          }
        }

        if (canaisValidos.length > 0) {
          orc.set('canais_comparados', canaisValidos)
          app.save(orc)
        }
      }
    }
  },
  (app) => {
    // Rollback não precisa desfazer restauração de dados
  },
)
