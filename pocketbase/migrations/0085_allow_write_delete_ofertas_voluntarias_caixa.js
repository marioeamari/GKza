migrate(
  (app) => {
    const canDelete = "@request.auth.id != '' && @request.auth.role != 'visualizador'"

    try {
      const ofertasCol = app.findCollectionByNameOrId('ofertas_voluntarias')
      ofertasCol.deleteRule = canDelete
      app.save(ofertasCol)
    } catch (err) {
      console.warn('Erro ao atualizar deleteRule para ofertas_voluntarias:', err)
    }

    try {
      const caixaCol = app.findCollectionByNameOrId('caixa_ofertas')
      caixaCol.deleteRule = canDelete
      app.save(caixaCol)
    } catch (err) {
      console.warn('Erro ao atualizar deleteRule para caixa_ofertas:', err)
    }
  },
  (app) => {
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    try {
      const ofertasCol = app.findCollectionByNameOrId('ofertas_voluntarias')
      ofertasCol.deleteRule = adminOrManager
      app.save(ofertasCol)
    } catch (err) {
      console.warn('Erro ao reverter deleteRule para ofertas_voluntarias:', err)
    }

    try {
      const caixaCol = app.findCollectionByNameOrId('caixa_ofertas')
      caixaCol.deleteRule = adminOrManager
      app.save(caixaCol)
    } catch (err) {
      console.warn('Erro ao reverter deleteRule para caixa_ofertas:', err)
    }
  },
)
