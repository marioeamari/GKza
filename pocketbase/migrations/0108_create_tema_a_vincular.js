migrate(
  (app) => {
    // Garantir que existe o tema padrão 'A Vincular' em kit_temas
    // para pedidos importados cujo SKU não casou com nenhum tema ou modelo.
    const kitTemasCol = app.findCollectionByNameOrId('kit_temas')
    let temaVincular
    try {
      temaVincular = app.findFirstRecordByData('kit_temas', 'nome', 'A Vincular')
    } catch (_) {
      temaVincular = null
    }

    if (!temaVincular) {
      temaVincular = new Record(kitTemasCol)
      temaVincular.set('nome', 'A Vincular')
      temaVincular.set(
        'descricao',
        'Tema pendente de vinculação automática ou manual para itens sem match de SKU',
      )
      temaVincular.set('ativo', true)
      temaVincular.set('ordem', 999)
      app.save(temaVincular)
    }
  },
  (app) => {
    try {
      const temaVincular = app.findFirstRecordByData('kit_temas', 'nome', 'A Vincular')
      if (temaVincular) {
        app.delete(temaVincular)
      }
    } catch (_) {}
  },
)
