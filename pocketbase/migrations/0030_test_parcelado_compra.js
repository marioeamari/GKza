migrate(
  (app) => {
    // Teste de validação para BUG 2: criação de compra parcelada no cartão
    // Verifica se a collection aceita compromisso com modalidade_parcelamento = 'parcelado'
    // e regra_repeticao = 'mensal'
    const colComp = app.findCollectionByNameOrId('despesas_compromisso')
    const colOcorr = app.findCollectionByNameOrId('despesas_ocorrencias')
    const contaNuBank = app.findFirstRecordByData('contas', 'nome', 'NuBank')

    // Criar compromisso de teste de 3 parcelas
    const comp = new Record(colComp)
    comp.set('descricao', 'Teste Compra Parcelada 3x')
    comp.set('regra_repeticao', 'mensal')
    comp.set('modalidade_parcelamento', 'parcelado')
    comp.set('total_parcelas', 3)
    comp.set('parcela_inicial', 1)
    comp.set('valor_estimado', 30)
    comp.set('valor_parcela', 10)
    comp.set('dia_vencimento', 20)
    comp.set('data_inicio', '2026-09-25 00:00:00.000Z')
    comp.set('conta_padrao', contaNuBank.id)
    comp.set('secao', 'cartoes_credito')
    comp.set('contexto_tipo', 'pessoal')
    comp.set('ativo', true)
    app.save(comp)

    // Simular a geração das 3 ocorrências nos ciclos de fatura correspondentes
    // Compra em 2026-09-25: NuBank fecha dia 13.
    // Parcela 1: ciclo 2026-09 (fechamento 2026-10-13, vencimento 2026-10-20)
    // Parcela 2: ciclo 2026-10 (fechamento 2026-11-13, vencimento 2026-11-20)
    // Parcela 3: ciclo 2026-11 (fechamento 2026-12-13, vencimento 2026-12-20)
    const ciclos = [
      { num: 1, comp: '2026-09', due: '2026-10-20T12:00:00.000Z' },
      { num: 2, comp: '2026-10', due: '2026-11-20T12:00:00.000Z' },
      { num: 3, comp: '2026-11', due: '2026-12-20T12:00:00.000Z' },
    ]

    for (const c of ciclos) {
      const oc = new Record(colOcorr)
      oc.set('compromisso', comp.id)
      oc.set('conta', contaNuBank.id)
      oc.set('secao', 'cartoes_credito')
      oc.set('contexto_tipo', 'pessoal')
      oc.set('competencia', c.comp)
      oc.set('numero_parcela', c.num)
      oc.set('total_parcelas', 3)
      oc.set('data_vencimento', c.due)
      oc.set('valor_previsto', 10)
      oc.set('valor_estimado_original', 10)
      oc.set('valor_ajustado_manualmente', false)
      oc.set('status', 'prevista')
      oc.set('observacoes', 'Parcela ' + c.num + '/3')
      app.save(oc)
    }
  },
  (app) => {
    try {
      const comp = app.findFirstRecordByData(
        'despesas_compromisso',
        'descricao',
        'Teste Compra Parcelada 3x',
      )
      const ocorrs = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = '" + comp.id + "'",
        '',
        10,
        0,
      )
      for (const oc of ocorrs) {
        app.delete(oc)
      }
      app.delete(comp)
    } catch (_) {}
  },
)
