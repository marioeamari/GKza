/// <reference types="pocketbase" />

/**
 * Migration 0096: Unificação de entrada e backfill de despesas avulsas soltas.
 *
 * Objetivo:
 * Garantir a regra permanente: toda despesa (independente de ter sido gerada
 * no Telegram, na triagem PWA ou em /despesa) gera o modelo canônico:
 * despesas_compromisso + despesas_ocorrencias + lancamento vinculado à ocorrência.
 *
 * Backfill executado:
 * 1. fx93vzlsej3pifo ("Sorvete rafa", R$ 5,00, NuBank, comp 2026-10, pendente krob46fbgd2lfus)
 * 2. rvr7gkvwumyhimc ("Carne", R$ 53,23, NuBank, comp 2026-10, pendente ototgcsfffazcer)
 * 3. 25jik187wecwhiq ("Agua e Amendoim", R$ 17,75, NuBank, comp 2026-09)
 * 4. Varredura automática em outros lançamentos de tipo 'despesa' pagos que eventualmente
 *    tenham ficado sem despesas_ocorrencias correspondente (excluindo pagamentos de fatura).
 */

migrate(
  (app) => {
    const backupColl = app.findCollectionByNameOrId('backup_remocoes')
    const ocorrenciasColl = app.findCollectionByNameOrId('despesas_ocorrencias')
    const compromissosColl = app.findCollectionByNameOrId('despesas_compromisso')
    const pendentesColl = app.findCollectionByNameOrId('telegram_registros_pendentes')

    const MOTIVO_BKP = '0096_unificacao_entrada_backfill'

    function salvarBackup(origemColecao, registroId, registroObj) {
      try {
        const existentes = app.findRecordsByFilter(
          'backup_remocoes',
          "origem_colecao = '" +
            origemColecao +
            "' && registro_id = '" +
            registroId +
            "' && motivo = '" +
            MOTIVO_BKP +
            "'",
          '-created',
          1,
          0,
        )
        if (existentes && existentes.length > 0) {
          return existentes[0]
        }
      } catch (_) {}

      try {
        const bkp = new Record(backupColl, {
          origem_colecao: origemColecao,
          registro_id: registroId,
          motivo: MOTIVO_BKP,
          dados_json: JSON.stringify(registroObj),
        })
        app.save(bkp)
        return bkp
      } catch (err) {
        console.warn(`[0096] Falha ao gravar backup de ${origemColecao} (${registroId}):`, err)
        return null
      }
    }

    // Lista explícita de lançamentos avulsos soltos a garantir o backfill
    const lancamentosAlvoIds = ['fx93vzlsej3pifo', 'rvr7gkvwumyhimc', '25jik187wecwhiq']

    // Também varre lançamentos recentes pagos sem ocorrência
    const lancamentosPagos = app.findRecordsByFilter(
      'lancamentos',
      "tipo = 'despesa' && status = 'pago' && is_pagamento_fatura = false",
      '-created',
      200,
      0,
    )

    const todosLancamentosIds = new Set(lancamentosAlvoIds)
    for (const l of lancamentosPagos) {
      todosLancamentosIds.add(l.id)
    }

    let compromissosCriados = 0
    let ocorrenciasCriadas = 0
    let pendentesAtualizados = 0

    for (const lancId of todosLancamentosIds) {
      let lanc
      try {
        lanc = app.findRecordById('lancamentos', lancId)
      } catch (_) {
        continue
      }

      // Se já houver ocorrência apontando para este lançamento, pula
      try {
        const ocs = app.findRecordsByFilter(
          'despesas_ocorrencias',
          `lancamento = '${lancId}'`,
          '-created',
          1,
          0,
        )
        if (ocs && ocs.length > 0) {
          continue
        }
      } catch (_) {}

      const desc = lanc.getString('descricao') || 'Despesa avulsa'
      const valor = lanc.getFloat('valor') || 0
      const contaId = lanc.getString('conta') || 'sglo7dfsqvgfsni'
      let catId = lanc.getString('categoria') || ''
      if (!catId) {
        // Categoria padrão Alimentação se vazia
        catId = 'qvh2817a1z1j45j'
      }
      const empId = lanc.getString('empresa') || ''
      const pessId = lanc.getString('pessoa') || 'ym6k6cnv78hwjk1'
      const compStr = lanc.getString('competencia') || '2026-10'
      const dataStr = lanc.getString('data') || `${compStr}-23 12:00:00`
      const obsLanc = lanc.getString('observacoes') || ''

      // Verificar se a conta é cartão
      let ehCartao = false
      let contaDiaVenc = 23
      try {
        const cRec = app.findRecordById('contas', contaId)
        if (cRec) {
          if (cRec.getString('tipo') === 'cartao' || (cRec.getInt('dia_fechamento') || 0) > 0) {
            ehCartao = true
          }
          contaDiaVenc = cRec.getInt('dia_vencimento') || 23
        }
      } catch (_) {}

      const secaoEfetiva = ehCartao ? 'cartoes_credito' : 'contas_mensais_pix_boleto'

      // 1. Criar despesas_compromisso (regra_repeticao = 'avulso')
      const compRecord = new Record(compromissosColl, {
        descricao: desc,
        secao: secaoEfetiva,
        categoria: catId,
        regra_repeticao: 'avulso',
        tipo_valor: 'fixo',
        modalidade_parcelamento: 'a_vista',
        total_parcelas: 1,
        parcela_inicial: 1,
        valor_estimado: valor,
        dia_vencimento: contaDiaVenc,
        regra_vencimento_texto: 'Único',
        data_inicio: dataStr.slice(0, 10) + ' 00:00:00.000Z',
        conta_padrao: contaId,
        metodo_pagamento: 'r9qdfpwfe5143oe', // Crédito se cartão
        titular_tipo: empId ? 'cnpj' : 'cpf',
        titular_pessoa: empId ? '' : pessId,
        titular_empresa: empId ? empId : '',
        contexto_tipo: empId ? 'empresa' : 'pessoal',
        empresa: empId,
        pessoa: pessId,
        dizimo: false,
        dizimo_percentual: 0,
        ativo: true,
        precisa_revisao: false,
        observacoes: obsLanc || 'Backfill migração 0096 (unificação canônica de despesas)',
      })

      app.save(compRecord)
      salvarBackup('despesas_compromisso', compRecord.id, compRecord)
      compromissosCriados++

      // 2. Criar despesas_ocorrencias (paga, vinculada ao lançamento)
      const dataVencIso = `${dataStr.slice(0, 10)} 12:00:00.000Z`
      const dataPagtoStr = `${dataStr.slice(0, 10)} 12:00:00`

      const ocorrRecord = new Record(ocorrenciasColl, {
        compromisso: compRecord.id,
        contexto_tipo: empId ? 'empresa' : 'pessoal',
        empresa: empId || null,
        secao: secaoEfetiva,
        conta: contaId,
        competencia: compStr,
        numero_parcela: 0,
        total_parcelas: 0,
        data_vencimento: dataVencIso,
        data_pagamento: dataPagtoStr,
        valor_previsto: valor,
        valor_pago: valor,
        valor_estimado_original: valor,
        valor_ajustado_manualmente: false,
        status: 'paga',
        dizimo: false,
        dizimo_percentual: 0,
        lancamento: lancId,
        observacoes: obsLanc || 'Backfill migração 0096 (unificação canônica de despesas)',
      })

      app.save(ocorrRecord)
      salvarBackup('despesas_ocorrencias', ocorrRecord.id, ocorrRecord)
      ocorrenciasCriadas++

      // 3. Atualizar registros em telegram_registros_pendentes se houver pendente correspondente
      try {
        const pendentes = app.findRecordsByFilter(
          'telegram_registros_pendentes',
          `lancamento_gerado = '${lancId}'`,
          '-created',
          10,
          0,
        )
        for (const pend of pendentes) {
          if (!pend.getString('compromisso_gerado')) {
            pend.set('compromisso_gerado', compRecord.id)
            app.save(pend)
            salvarBackup('telegram_registros_pendentes', pend.id, pend)
            pendentesAtualizados++
          }
        }
      } catch (errPend) {
        console.warn(`[0096] Erro ao atualizar pendente para lançamento ${lancId}:`, errPend)
      }

      console.log(
        `[0096] Backfill concluído para lançamento ${lancId} (${desc}, R$ ${valor}): compromisso ${compRecord.id}, ocorrência ${ocorrRecord.id}`,
      )
    }

    console.log(
      `[0096] Resumo do backfill: ${compromissosCriados} compromissos criados, ${ocorrenciasCriadas} ocorrências criadas, ${pendentesAtualizados} pendentes atualizados.`,
    )
  },
  (app) => {
    // Reversão
    console.log('[0096] Reversão de backfill não destrutiva.')
  },
)
