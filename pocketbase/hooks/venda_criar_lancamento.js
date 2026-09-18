onRecordCreate((e) => {
  if (e.record.getString('status') !== 'paga') {
    e.next()
    return
  }

  e.next()

  if (e.record.getString('lancamento')) return

  const marketplaceConta = $app.findRecordById(
    'marketplace_contas',
    e.record.getString('marketplace_conta'),
  )
  const marketplace = $app.findRecordById('marketplaces', marketplaceConta.getString('marketplace'))
  const categoria = $app.findFirstRecordByData('categorias', 'nome', 'Vendas Marketplace')
  const lancamento = new Record($app.findCollectionByNameOrId('lancamentos'))
  lancamento.set(
    'descricao',
    'Venda ' + e.record.getString('pedido_id') + ' — ' + marketplace.getString('nome'),
  )
  lancamento.set('valor', e.record.getFloat('valor_liquido'))
  lancamento.set('tipo', 'receita')
  lancamento.set('data', e.record.getString('data'))
  lancamento.set('status', 'pago')
  lancamento.set('conta', marketplaceConta.getString('conta'))
  lancamento.set('categoria', categoria.id)
  lancamento.set(
    'observacoes',
    'Gerado automaticamente pela venda ' + e.record.getString('pedido_id'),
  )
  $app.save(lancamento)

  e.record.set('lancamento', lancamento.id)
  $app.save(e.record)
}, 'vendas')
