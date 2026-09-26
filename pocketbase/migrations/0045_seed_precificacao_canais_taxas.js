migrate(
  (app) => {
    const canaisCol = app.findCollectionByNameOrId('prec_canais')
    const modalidadesCol = app.findCollectionByNameOrId('prec_canal_modalidades')
    const taxasCol = app.findCollectionByNameOrId('prec_taxas')

    // Helper idempotente para canal
    function getOrCreateCanal(nome, tipo, cor, ordem, vigencia) {
      try {
        return app.findFirstRecordByData('prec_canais', 'nome', nome)
      } catch (_) {
        const r = new Record(canaisCol)
        r.set('nome', nome)
        r.set('tipo', tipo)
        r.set('ativo', true)
        r.set('cor', cor)
        r.set('ordem', ordem)
        r.set('vigencia', vigencia || 'Valores da planilha (pendente de conferência)')
        app.save(r)
        return r
      }
    }

    function getOrCreateModalidade(canalId, nome, prazoDias) {
      const existing = app.findRecordsByFilter(
        'prec_canal_modalidades',
        `canal = '${canalId}' && nome = '${nome}'`,
        '',
        1,
        0,
      )
      if (existing.length > 0) return existing[0]

      const r = new Record(modalidadesCol)
      r.set('canal', canalId)
      r.set('nome', nome)
      r.set('prazo_recebimento_dias', prazoDias)
      r.set('ativo', true)
      app.save(r)
      return r
    }

    function addTaxa({
      canalId,
      modalidadeId,
      nome,
      baseCalculo,
      tipoValor,
      valor,
      tipoRegra,
      responsavel,
      financiadoPor,
      condicao,
    }) {
      const modFilter = modalidadeId ? `modalidade = '${modalidadeId}'` : `modalidade = ''`
      const existing = app.findRecordsByFilter(
        'prec_taxas',
        `canal = '${canalId}' && ${modFilter} && nome = '${nome}'`,
        '',
        1,
        0,
      )
      if (existing.length > 0) return existing[0]

      const r = new Record(taxasCol)
      r.set('canal', canalId)
      if (modalidadeId) r.set('modalidade', modalidadeId)
      r.set('nome', nome)
      r.set('base_calculo', baseCalculo)
      r.set('tipo_valor', tipoValor)
      r.set('valor', valor)
      r.set('responsavel', responsavel || 'marketplace')
      r.set('tipo_regra', tipoRegra)
      r.set('financiado_por', financiadoPor || 'marketplace')
      if (condicao) r.set('condicao', condicao)
      r.set('status_conferencia', 'pendente_conferencia')
      app.save(r)
      return r
    }

    // 1. Site Próprio (www)
    const siteProprio = getOrCreateCanal('Site Próprio (www)', 'site_proprio', '#0ea5e9', 1)
    const modCartaoVista = getOrCreateModalidade(siteProprio.id, 'Cartão à Vista (2 dias)', 2)
    const modCartao15d = getOrCreateModalidade(siteProprio.id, 'Cartão 15 Dias', 15)
    const modCartao30d = getOrCreateModalidade(siteProprio.id, 'Cartão 30 Dias', 30)
    const modPix = getOrCreateModalidade(siteProprio.id, 'Pix (Imediato)', 0)
    const modBoleto = getOrCreateModalidade(siteProprio.id, 'Boleto Bancário (3 dias)', 3)

    // Taxas Site Próprio
    addTaxa({
      canalId: siteProprio.id,
      modalidadeId: modCartaoVista.id,
      nome: 'Taxa Cartão à Vista (4,99%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 4.99,
      tipoRegra: 'transacao',
    })
    addTaxa({
      canalId: siteProprio.id,
      modalidadeId: modCartaoVista.id,
      nome: 'Tarifa Fixa Cartão',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 0.5,
      tipoRegra: 'tarifa_fixa',
    })

    addTaxa({
      canalId: siteProprio.id,
      modalidadeId: modCartao15d.id,
      nome: 'Taxa Cartão 15 Dias (4,79%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 4.79,
      tipoRegra: 'transacao',
    })
    addTaxa({
      canalId: siteProprio.id,
      modalidadeId: modCartao15d.id,
      nome: 'Tarifa Fixa Cartão',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 0.5,
      tipoRegra: 'tarifa_fixa',
    })

    addTaxa({
      canalId: siteProprio.id,
      modalidadeId: modCartao30d.id,
      nome: 'Taxa Cartão 30 Dias (4,59%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 4.59,
      tipoRegra: 'transacao',
    })
    addTaxa({
      canalId: siteProprio.id,
      modalidadeId: modCartao30d.id,
      nome: 'Tarifa Fixa Cartão',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 0.5,
      tipoRegra: 'tarifa_fixa',
    })

    addTaxa({
      canalId: siteProprio.id,
      modalidadeId: modPix.id,
      nome: 'Taxa Gateway Pix (1%)',
      baseCalculo: 'preco_pago_cliente',
      tipoValor: 'percentual',
      valor: 1.0,
      tipoRegra: 'pagamento',
    })

    addTaxa({
      canalId: siteProprio.id,
      modalidadeId: modBoleto.id,
      nome: 'Tarifa Emissão Boleto (R$ 2,39)',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 2.39,
      tipoRegra: 'pagamento',
    })

    // 2. Shopee
    const shopee = getOrCreateCanal('Shopee', 'marketplace', '#f97316', 2)
    const shopeeFull = getOrCreateModalidade(shopee.id, 'Shopee FULL', 7)
    const shopeeHalf = getOrCreateModalidade(shopee.id, 'Shopee Half / Padrão', 10)

    addTaxa({
      canalId: shopee.id,
      modalidadeId: shopeeFull.id,
      nome: 'Comissão Shopee FULL (18%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 18.0,
      tipoRegra: 'comissao',
    })
    addTaxa({
      canalId: shopee.id,
      modalidadeId: shopeeFull.id,
      nome: 'Taxa de Transação Shopee (2%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 2.0,
      tipoRegra: 'transacao',
    })
    addTaxa({
      canalId: shopee.id,
      modalidadeId: shopeeFull.id,
      nome: 'Taxa Fixa Transação Item (R$ 4,00)',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 4.0,
      tipoRegra: 'tarifa_fixa',
    })

    addTaxa({
      canalId: shopee.id,
      modalidadeId: shopeeHalf.id,
      nome: 'Comissão Shopee Half (16%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 16.0,
      tipoRegra: 'comissao',
    })
    addTaxa({
      canalId: shopee.id,
      modalidadeId: shopeeHalf.id,
      nome: 'Taxa de Transação Shopee (2%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 2.0,
      tipoRegra: 'transacao',
    })
    addTaxa({
      canalId: shopee.id,
      modalidadeId: shopeeHalf.id,
      nome: 'Taxa Fixa Item (R$ 4,00)',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 4.0,
      tipoRegra: 'tarifa_fixa',
    })

    // 3. SHEIN
    const shein = getOrCreateCanal('SHEIN', 'marketplace', '#111827', 3)
    const sheinFull = getOrCreateModalidade(shein.id, 'SHEIN FULL', 15)
    addTaxa({
      canalId: shein.id,
      modalidadeId: sheinFull.id,
      nome: 'Comissão SHEIN (16%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 16.0,
      tipoRegra: 'comissao',
    })
    addTaxa({
      canalId: shein.id,
      modalidadeId: sheinFull.id,
      nome: 'Taxa Operacional SHEIN (R$ 4,00)',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 4.0,
      tipoRegra: 'operacao',
    })
    addTaxa({
      canalId: shein.id,
      modalidadeId: sheinFull.id,
      nome: 'Intermediação de Frete (R$ 4,00)',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 4.0,
      tipoRegra: 'frete',
      responsavel: 'vendedor',
    })

    // 4. Kwai
    const kwai = getOrCreateCanal('Kwai', 'marketplace', '#ea580c', 4)
    const kwaiPadrao = getOrCreateModalidade(kwai.id, 'Kwai Padrão', 10)
    addTaxa({
      canalId: kwai.id,
      modalidadeId: kwaiPadrao.id,
      nome: 'Comissão Kwai (20%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 20.0,
      tipoRegra: 'comissao',
    })
    addTaxa({
      canalId: kwai.id,
      modalidadeId: kwaiPadrao.id,
      nome: 'Taxa Operacional Kwai (R$ 4,00)',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 4.0,
      tipoRegra: 'operacao',
    })

    // 5. TikTok Shop
    const tiktok = getOrCreateCanal('TikTok Shop', 'marketplace', '#000000', 5)
    const tiktokPadrao = getOrCreateModalidade(tiktok.id, 'TikTok Shop Padrão', 7)
    addTaxa({
      canalId: tiktok.id,
      modalidadeId: tiktokPadrao.id,
      nome: 'Taxa de Serviço SFP (6%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 6.0,
      tipoRegra: 'servico',
    })
    addTaxa({
      canalId: tiktok.id,
      modalidadeId: tiktokPadrao.id,
      nome: 'Comissão TikTok (10%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 10.0,
      tipoRegra: 'comissao',
    })
    addTaxa({
      canalId: tiktok.id,
      modalidadeId: tiktokPadrao.id,
      nome: 'Taxa de Transação Item (R$ 4,00)',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 4.0,
      tipoRegra: 'transacao',
    })
    addTaxa({
      canalId: tiktok.id,
      modalidadeId: tiktokPadrao.id,
      nome: 'Comissão Afiliados (R$ 3,99)',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 3.99,
      tipoRegra: 'afiliado',
      responsavel: 'vendedor',
    })

    // 6. Mercado Livre
    const ml = getOrCreateCanal('Mercado Livre', 'marketplace', '#eab308', 6)
    const mlClassico = getOrCreateModalidade(ml.id, 'Clássico', 2)
    const mlPremium = getOrCreateModalidade(ml.id, 'Premium', 2)
    addTaxa({
      canalId: ml.id,
      modalidadeId: mlClassico.id,
      nome: 'Comissão Mercado Livre Clássico (14%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 14.0,
      tipoRegra: 'comissao',
    })
    addTaxa({
      canalId: ml.id,
      modalidadeId: mlClassico.id,
      nome: 'Tarifa Fixa de Venda (produtos < R$ 79)',
      baseCalculo: 'faixa_preco',
      tipoValor: 'fixo',
      valor: 6.0,
      tipoRegra: 'tarifa_fixa',
      condicao: { faixa_preco_max: 79 },
    })
    addTaxa({
      canalId: ml.id,
      modalidadeId: mlPremium.id,
      nome: 'Comissão Mercado Livre Premium (19%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 19.0,
      tipoRegra: 'comissao',
    })
    addTaxa({
      canalId: ml.id,
      modalidadeId: mlPremium.id,
      nome: 'Tarifa Fixa de Venda (produtos < R$ 79)',
      baseCalculo: 'faixa_preco',
      tipoValor: 'fixo',
      valor: 6.0,
      tipoRegra: 'tarifa_fixa',
      condicao: { faixa_preco_max: 79 },
    })

    // 7. Magalu
    const magalu = getOrCreateCanal('Magalu', 'marketplace', '#2563eb', 7)
    const magaluPadrao = getOrCreateModalidade(magalu.id, 'Magalu Padrão', 15)
    addTaxa({
      canalId: magalu.id,
      modalidadeId: magaluPadrao.id,
      nome: 'Comissão Magalu (16%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 16.0,
      tipoRegra: 'comissao',
    })
    addTaxa({
      canalId: magalu.id,
      modalidadeId: magaluPadrao.id,
      nome: 'Tarifa Fixa Magalu (R$ 3,00)',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 3.0,
      tipoRegra: 'tarifa_fixa',
    })

    // 8. TEMU
    const temu = getOrCreateCanal('TEMU', 'marketplace', '#f59e0b', 8)
    const temuPadrao = getOrCreateModalidade(temu.id, 'TEMU Padrão', 14)
    addTaxa({
      canalId: temu.id,
      modalidadeId: temuPadrao.id,
      nome: 'Comissão TEMU (15%)',
      baseCalculo: 'preco_anunciado',
      tipoValor: 'percentual',
      valor: 15.0,
      tipoRegra: 'comissao',
    })
    addTaxa({
      canalId: temu.id,
      modalidadeId: temuPadrao.id,
      nome: 'Tarifa Operacional TEMU (R$ 3,50)',
      baseCalculo: 'prestacao_fixa',
      tipoValor: 'fixo',
      valor: 3.5,
      tipoRegra: 'operacao',
    })
  },
  (app) => {
    // Reversão limpa taxas e canais criados pelo seed
    const canaisNomes = [
      'Site Próprio (www)',
      'Shopee',
      'SHEIN',
      'Kwai',
      'TikTok Shop',
      'Mercado Livre',
      'Magalu',
      'TEMU',
    ]
    for (let i = 0; i < canaisNomes.length; i++) {
      try {
        const c = app.findFirstRecordByData('prec_canais', 'nome', canaisNomes[i])
        app.delete(c)
      } catch (_) {}
    }
  },
)
