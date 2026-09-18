onRecordUpdate((e) => {
  const previousStatus = e.record.original().getString('status')
  const currentStatus = e.record.getString('status')
  const previousLaunch = e.record.original().getString('lancamento')
  const shouldCreate =
    previousStatus !== 'realizado' &&
    currentStatus === 'realizado' &&
    !e.record.getString('lancamento')
  const shouldReverse =
    previousStatus === 'realizado' && currentStatus === 'previsto' && previousLaunch !== ''

  e.next()

  if (shouldCreate) {
    const marketplaceConta = $app.findRecordById(
      'marketplace_contas',
      e.record.getString('marketplace_conta'),
    )
    const marketplace = $app.findRecordById(
      'marketplaces',
      marketplaceConta.getString('marketplace'),
    )
    const categoria = $app.findFirstRecordByData('categorias', 'nome', 'Vendas Marketplace')
    const start = e.record.getString('periodo_inicio').slice(0, 10).split('-')
    const end = e.record.getString('periodo_fim').slice(0, 10).split('-')
    const period =
      start[2] + '/' + start[1] + '/' + start[0] + ' a ' + end[2] + '/' + end[1] + '/' + end[0]
    const lancamento = new Record($app.findCollectionByNameOrId('lancamentos'))
    lancamento.set('descricao', 'Repasse ' + marketplace.getString('nome') + ' ' + period)
    lancamento.set('valor', e.record.getFloat('valor'))
    lancamento.set('tipo', 'receita')
    lancamento.set(
      'data',
      e.record.getString('data_realizada') || e.record.getString('data_prevista'),
    )
    lancamento.set('status', 'pago')
    lancamento.set('conta', marketplaceConta.getString('conta'))
    lancamento.set('categoria', categoria.id)
    lancamento.set('observacoes', 'Gerado automaticamente pela confirmação do repasse')
    $app.save(lancamento)
    e.record.set('lancamento', lancamento.id)
    $app.save(e.record)
    return
  }

  if (shouldReverse) {
    try {
      const lancamento = $app.findRecordById('lancamentos', previousLaunch)
      $app.delete(lancamento)
    } catch (_) {}
    e.record.set('lancamento', '')
    e.record.set('data_realizada', '')
    $app.save(e.record)
  }
}, 'repasses')
