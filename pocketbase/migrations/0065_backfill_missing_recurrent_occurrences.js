/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // TAREFA 1: Migração para recriar ocorrências faltantes em compromissos recorrentes
    // e garantir o reparo pontual de Energia Elétrica (CPFL - h3g4fjsx0yjxdge) na competência 2026-10.
    //
    // Regras:
    // 1. Reparo pontual garantido da Energia Elétrica (CPFL):
    //    Se não existir ocorrência do compromisso h3g4fjsx0yjxdge na competência 2026-10,
    //    cria registro em despesas_ocorrencias com:
    //    compromisso = h3g4fjsx0yjxdge, competencia = '2026-10', data_vencimento = '2026-10-01 12:00:00.000Z',
    //    valor_previsto = 93.09, valor_estimado_original = 93.09, status = 'prevista',
    //    conta = comp.conta_padrao, secao/contexto_tipo/empresa copiados do compromisso,
    //    numero_parcela = 0, total_parcelas = 0, valor_ajustado_manualmente = false.
    //
    // 2. Varredura de TODOS os compromissos ativos (ativo=true, regra_repeticao='mensal', não parcelados, não-cartão)
    //    preenchendo TODO buraco de competência entre o mês da data_inicio (ou created, fallback)
    //    e a competência atual (2026-10) INCLUSIVE:
    //    Para cada mês sem ocorrência do compromisso, cria ocorrência prevista com data_vencimento
    //    calculada pelo dia_vencimento (clamp ao último dia do mês), valores e campos copiados do compromisso.
    //    Nunca duplicar competência existente; nunca mexer em ocorrências pagas.

    function diasNoMes(ano, mesZero) {
      return new Date(Date.UTC(ano, mesZero + 1, 0)).getUTCDate()
    }

    function calcularDataVencimentoNoMes(ano, mesZero, diaDesejado) {
      var maxDia = diasNoMes(ano, mesZero)
      var diaFinal = Math.min(Math.max(diaDesejado || 10, 1), maxDia)
      var mm = String(mesZero + 1).padStart(2, '0')
      var dd = String(diaFinal).padStart(2, '0')
      return ano + '-' + mm + '-' + dd + ' 12:00:00.000Z'
    }

    function extrairAnoMes(dataIsoStr) {
      if (!dataIsoStr) return ''
      var str = String(dataIsoStr).trim()
      if (str.length >= 7 && str.charAt(4) === '-') {
        return str.slice(0, 7)
      }
      return ''
    }

    function gerarMesesContinuos(compInicioStr, compFimStr) {
      var lista = []
      if (!compInicioStr || !compFimStr || compInicioStr > compFimStr) {
        return lista
      }
      var pStart = compInicioStr.split('-')
      var startAno = parseInt(pStart[0], 10)
      var startMes = parseInt(pStart[1], 10) - 1

      var pEnd = compFimStr.split('-')
      var endAno = parseInt(pEnd[0], 10)
      var endMes = parseInt(pEnd[1], 10) - 1

      var cursor = new Date(Date.UTC(startAno, startMes, 1))
      var targetEnd = new Date(Date.UTC(endAno, endMes, 1))

      while (cursor.getTime() <= targetEnd.getTime()) {
        var cY = cursor.getUTCFullYear()
        var cM = cursor.getUTCMonth()
        var compFormatted = cY + '-' + String(cM + 1).padStart(2, '0')
        lista.push(compFormatted)
        cursor = new Date(Date.UTC(cY, cM + 1, 1))
      }
      return lista
    }

    var colOcorr = app.findCollectionByNameOrId('despesas_ocorrencias')

    // Competência de referência atual do sistema
    var competenciaAtual = '2026-10'

    // =========================================================================
    // ETAPA 1: Reparo pontual garantido da Energia Elétrica (CPFL - h3g4fjsx0yjxdge)
    // =========================================================================
    var idEnergiaEletrica = 'h3g4fjsx0yjxdge'
    try {
      var compEnergia = app.findRecordById('despesas_compromisso', idEnergiaEletrica)
      if (compEnergia) {
        var existingEnergia10 = app.findRecordsByFilter(
          'despesas_ocorrencias',
          "compromisso = '" + idEnergiaEletrica + "' && competencia = '2026-10'",
          '',
          1,
          0,
        )

        if (existingEnergia10.length === 0) {
          var valorEnergia = compEnergia.getFloat('valor_estimado') || 93.09
          var novaEnergia = new Record(colOcorr)
          novaEnergia.set('compromisso', idEnergiaEletrica)
          novaEnergia.set('competencia', '2026-10')
          novaEnergia.set('data_vencimento', '2026-10-01 12:00:00.000Z')
          novaEnergia.set('valor_previsto', valorEnergia)
          novaEnergia.set('valor_estimado_original', valorEnergia)
          novaEnergia.set('status', 'prevista')
          if (compEnergia.getString('conta_padrao')) {
            novaEnergia.set('conta', compEnergia.getString('conta_padrao'))
          }
          novaEnergia.set('secao', compEnergia.getString('secao'))
          novaEnergia.set('contexto_tipo', compEnergia.getString('contexto_tipo') || 'empresa')
          if (compEnergia.getString('empresa')) {
            novaEnergia.set('empresa', compEnergia.getString('empresa'))
          }
          if (compEnergia.getString('tipo_dizimo')) {
            novaEnergia.set('tipo_dizimo', compEnergia.getString('tipo_dizimo'))
          }
          novaEnergia.set('dizimo', compEnergia.getBool('dizimo'))
          novaEnergia.set('numero_parcela', 0)
          novaEnergia.set('total_parcelas', 0)
          novaEnergia.set('valor_ajustado_manualmente', false)
          if (compEnergia.getString('observacoes')) {
            novaEnergia.set('observacoes', compEnergia.getString('observacoes'))
          }
          app.save(novaEnergia)
          console.log(
            '[0065_backfill] Ocorrência 2026-10 criada com sucesso para Energia Elétrica.',
          )
        } else {
          console.log('[0065_backfill] Ocorrência 2026-10 de Energia Elétrica já existia.')
        }
      }
    } catch (errEnergia) {
      console.warn('[0065_backfill] Aviso ao processar Energia Elétrica pontual:', errEnergia)
    }

    // =========================================================================
    // ETAPA 2: Varredura de TODOS os compromissos ativos mensais não-parcelados e não-cartão
    // =========================================================================
    // Cache de contas e métodos para checar método de pagamento crédito
    var metodoCreditoCache = {}
    function isMetodoCreditoPB(metodoId) {
      if (!metodoId) return false
      if (metodoCreditoCache[metodoId] !== undefined) return metodoCreditoCache[metodoId]
      try {
        var mp = app.findFirstRecordByData('metodos_pagamento', 'id', metodoId)
        var cod = (mp.getString('codigo') || '').toLowerCase()
        var nome = (mp.getString('nome') || '').toLowerCase()
        var tipo = (mp.getString('tipo') || '').toLowerCase()
        var ehCredito =
          cod === 'credito' ||
          nome.indexOf('crédito') !== -1 ||
          nome.indexOf('credito') !== -1 ||
          tipo === 'cartao'
        metodoCreditoCache[metodoId] = ehCredito
        return ehCredito
      } catch (_) {
        metodoCreditoCache[metodoId] = false
        return false
      }
    }

    var compromissosAtivos = app.findRecordsByFilter(
      'despesas_compromisso',
      "ativo = true && regra_repeticao = 'mensal'",
      'created',
      500,
      0,
    )

    var totalCriadasVarredura = 0

    for (var i = 0; i < compromissosAtivos.length; i++) {
      var comp = compromissosAtivos[i]
      var compId = comp.id
      var secao = comp.getString('secao')
      var modalidade = comp.getString('modalidade_parcelamento')
      var metodoId = comp.getString('metodo_pagamento')

      // Ignora parcelados
      if (modalidade === 'parcelado') continue

      // Ignora cartão de crédito
      if (secao === 'cartoes_credito') continue
      if (isMetodoCreditoPB(metodoId)) continue

      var dataInicioRaw = comp.getString('data_inicio') || comp.getString('created') || ''
      var compInicio = extrairAnoMes(dataInicioRaw)
      if (!compInicio) {
        compInicio = competenciaAtual
      }

      // Se data_inicio for futura em relação à competência atual, não há retroativo
      if (compInicio > competenciaAtual) {
        continue
      }

      // Gera todos os meses entre compInicio e competenciaAtual inclusive
      var mesesIntervalo = gerarMesesContinuos(compInicio, competenciaAtual)
      var diaVenc = comp.getInt('dia_vencimento') || 10
      var valorUnitario =
        comp.getFloat('valor_parcela') > 0
          ? comp.getFloat('valor_parcela')
          : comp.getFloat('valor_estimado')

      for (var m = 0; m < mesesIntervalo.length; m++) {
        var compMes = mesesIntervalo[m]

        var ocorrenciasMes = app.findRecordsByFilter(
          'despesas_ocorrencias',
          "compromisso = '" + compId + "' && competencia = '" + compMes + "'",
          '',
          1,
          0,
        )

        // Se já existe ocorrência (seja prevista ou paga), NUNCA duplicar nem tocar
        if (ocorrenciasMes.length > 0) {
          continue
        }

        // Criar ocorrência prevista para o mês faltante
        var partes = compMes.split('-')
        var anoMes = parseInt(partes[0], 10)
        var mesZero = parseInt(partes[1], 10) - 1
        var dueIso = calcularDataVencimentoNoMes(anoMes, mesZero, diaVenc)

        var novaOcorr = new Record(colOcorr)
        novaOcorr.set('compromisso', compId)
        novaOcorr.set('competencia', compMes)
        novaOcorr.set('data_vencimento', dueIso)
        novaOcorr.set('valor_previsto', valorUnitario)
        novaOcorr.set('valor_estimado_original', valorUnitario)
        novaOcorr.set('status', 'prevista')
        if (comp.getString('conta_padrao')) {
          novaOcorr.set('conta', comp.getString('conta_padrao'))
        }
        novaOcorr.set('secao', comp.getString('secao'))
        novaOcorr.set('contexto_tipo', comp.getString('contexto_tipo') || 'pessoal')
        if (comp.getString('empresa')) {
          novaOcorr.set('empresa', comp.getString('empresa'))
        }
        if (comp.getString('tipo_dizimo')) {
          novaOcorr.set('tipo_dizimo', comp.getString('tipo_dizimo'))
        }
        novaOcorr.set('dizimo', comp.getBool('dizimo'))
        novaOcorr.set('numero_parcela', 0)
        novaOcorr.set('total_parcelas', 0)
        novaOcorr.set('valor_ajustado_manualmente', false)
        if (comp.getString('observacoes')) {
          novaOcorr.set('observacoes', comp.getString('observacoes'))
        }
        app.save(novaOcorr)
        totalCriadasVarredura++
      }
    }

    console.log(
      '[0065_backfill_missing_recurrent_occurrences] Varredura finalizada. Ocorrências criadas: ' +
        totalCriadasVarredura,
    )
  },
  (app) => {
    // Rollback não-destrutivo vazio: ocorrências criadas para preenchimento de buracos
    // são preservadas para não apagar lançamentos que eventualmente possam ter sido baixados.
  },
)
