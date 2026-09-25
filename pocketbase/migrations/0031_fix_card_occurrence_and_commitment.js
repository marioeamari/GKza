migrate(
  (app) => {
    // Corrigir ocorrência v36qi9nb8uf6qux (Mercado):
    // competencia -> '2026-09' (mês da compra)
    // data_vencimento -> '2026-09-25 12:00:00.000Z' (data da compra)
    try {
      const oc = app.findFirstRecordByData('despesas_ocorrencias', 'id', 'v36qi9nb8uf6qux')
      oc.set('competencia', '2026-09')
      oc.set('data_vencimento', '2026-09-25 12:00:00.000Z')
      app.save(oc)
    } catch (err) {
      console.log('Aviso ao atualizar ocorrencia v36qi9nb8uf6qux:', err)
    }

    // Corrigir compromisso yhkfjgm4547cg0q:
    // secao -> 'cartoes_credito'
    try {
      const comp = app.findFirstRecordByData('despesas_compromisso', 'id', 'yhkfjgm4547cg0q')
      comp.set('secao', 'cartoes_credito')
      app.save(comp)
    } catch (err) {
      console.log('Aviso ao atualizar compromisso yhkfjgm4547cg0q:', err)
    }
  },
  (app) => {
    // Revert
    try {
      const oc = app.findFirstRecordByData('despesas_ocorrencias', 'id', 'v36qi9nb8uf6qux')
      oc.set('competencia', '2026-10')
      oc.set('data_vencimento', '2026-10-20 12:00:00.000Z')
      app.save(oc)
    } catch (_) {}

    try {
      const comp = app.findFirstRecordByData('despesas_compromisso', 'id', 'yhkfjgm4547cg0q')
      comp.set('secao', 'cartoes_credito')
      app.save(comp)
    } catch (_) {}
  },
)
