/// <reference types="pocketbase" />

/**
 * Migration 0090: Ajustar data_pagamento de compras no cartão de crédito para a data de vencimento da fatura.
 *
 * Regra:
 * Para todo lançamento / ocorrência de compra no crédito com data_pagamento != vencimento da fatura da sua competência,
 * atualiza data_pagamento = vencimento da fatura (e na tabela lancamentos vinculada, data = data de vencimento da fatura).
 *
 * Backup obrigatório em backup_remocoes com motivo: '0090_ajuste_data_pagamento_credito_vencimento'.
 */

migrate(
  (app) => {
    const backupColl = app.findCollectionByNameOrId('backup_remocoes')
    const MOTIVO_BKP = '0090_ajuste_data_pagamento_credito_vencimento'

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
        console.warn(`[0090] Falha ao gravar backup de ${origemColecao} (${registroId}):`, err)
        return null
      }
    }

    // Carregar mapa de contas de cartão
    const contasCartao = app.findRecordsByFilter('contas', "tipo = 'cartao'", '', 100, 0)
    const contasMap = new Map()
    for (const c of contasCartao) {
      contasMap.set(c.id, {
        id: c.id,
        diaVencimento: c.getInt('dia_vencimento') || 10,
        diaFechamento: c.getInt('dia_fechamento') || 3,
      })
    }

    // Helper para calcular vencimento 'YYYY-MM-DD 12:00:00.000Z' a partir de competencia 'YYYY-MM' e diaVencimento
    function calcularVencimentoIso(competenciaStr, diaVenc) {
      if (!competenciaStr || !competenciaStr.includes('-')) return null
      const parts = competenciaStr.split('-')
      const ano = parseInt(parts[0], 10)
      const mes = parseInt(parts[1], 10) // 1-12
      const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
      const diaEfetivo = Math.min(Math.max(diaVenc || 10, 1), ultimoDia)
      const diaPad = String(diaEfetivo).padStart(2, '0')
      const mesPad = String(mes).padStart(2, '0')
      return `${ano}-${mesPad}-${diaPad} 12:00:00.000Z`
    }

    // 1. Processar despesas_ocorrencias de cartão de crédito pagas
    const ocorrenciasCartao = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "secao = 'cartoes_credito' && status = 'paga'",
      'created',
      2000,
      0,
    )

    console.log(`[0090] Ocorrências de cartão pagas encontradas: ${ocorrenciasCartao.length}`)

    let ocorrenciasAjustadas = 0
    let lancamentosAjustados = 0

    for (const oc of ocorrenciasCartao) {
      const dataPagamentoAtual = oc.getString('data_pagamento') || ''
      const dataVencimentoAtual = oc.getString('data_vencimento') || ''
      const competencia = oc.getString('competencia') || ''
      const contaId = oc.getString('conta') || ''
      const contaInfo = contasMap.get(contaId)

      let vencimentoAlvo = dataVencimentoAtual
      if (!vencimentoAlvo && contaInfo && competencia) {
        vencimentoAlvo = calcularVencimentoIso(competencia, contaInfo.diaVencimento)
      }

      if (!vencimentoAlvo) {
        continue
      }

      // Normalizar para comparar apenas os primeiros 10 caracteres (YYYY-MM-DD)
      const dataPagamentoDia = dataPagamentoAtual.slice(0, 10)
      const vencimentoDia = vencimentoAlvo.slice(0, 10)

      if (dataPagamentoDia !== vencimentoDia) {
        salvarBackup('despesas_ocorrencias', oc.id, oc)

        const novoVencIso = `${vencimentoDia} 12:00:00.000Z`
        oc.set('data_pagamento', novoVencIso)
        if (!dataVencimentoAtual) {
          oc.set('data_vencimento', novoVencIso)
        }
        app.save(oc)
        ocorrenciasAjustadas++

        // Ajustar lançamento vinculado se existir
        const lancId = oc.getString('lancamento')
        if (lancId) {
          try {
            const lanc = app.findRecordById('lancamentos', lancId)
            if (lanc) {
              const dataLancAtual = (lanc.getString('data') || '').slice(0, 10)
              if (dataLancAtual !== vencimentoDia) {
                salvarBackup('lancamentos', lanc.id, lanc)
                lanc.set('data', novoVencIso)
                app.save(lanc)
                lancamentosAjustados++
              }
            }
          } catch (eLanc) {
            console.warn(`[0090] Erro ao carregar lançamento vinculado ${lancId}:`, eLanc)
          }
        }
      } else {
        // Se a data_pagamento já está igual, checar se o lançamento vinculado precisa de ajuste na data
        const lancId = oc.getString('lancamento')
        if (lancId) {
          try {
            const lanc = app.findRecordById('lancamentos', lancId)
            if (lanc) {
              const dataLancAtual = (lanc.getString('data') || '').slice(0, 10)
              if (dataLancAtual !== vencimentoDia) {
                salvarBackup('lancamentos', lanc.id, lanc)
                lanc.set('data', `${vencimentoDia} 12:00:00.000Z`)
                app.save(lanc)
                lancamentosAjustados++
              }
            }
          } catch (eLanc) {
            console.warn(`[0090] Erro ao carregar lançamento vinculado ${lancId}:`, eLanc)
          }
        }
      }
    }

    // 2. Garantir casos reais confirmados explicitamente pelo usuário
    const casosConfirmados = [
      { id: 'vlrw6md2c4oo8pa', vencDia: '2026-10-23' }, // Mercado
      { id: 'hx9iv8ghdc7txrl', vencDia: '2026-10-23' }, // Água
      { id: '75v3ri6sbrfj0mb', vencDia: '2026-10-23' }, // Amendoim
      { id: 'cq0ojjpmk63npkg', vencDia: '2026-10-23' }, // Água/Chama Gás
    ]

    for (const caso of casosConfirmados) {
      try {
        const oc = app.findRecordById('despesas_ocorrencias', caso.id)
        if (oc) {
          const diaAtual = (oc.getString('data_pagamento') || '').slice(0, 10)
          if (diaAtual !== caso.vencDia) {
            salvarBackup('despesas_ocorrencias', oc.id, oc)
            oc.set('data_pagamento', `${caso.vencDia} 12:00:00.000Z`)
            oc.set('data_vencimento', `${caso.vencDia} 12:00:00.000Z`)
            app.save(oc)
            ocorrenciasAjustadas++
          }

          const lancId = oc.getString('lancamento')
          if (lancId) {
            const lanc = app.findRecordById('lancamentos', lancId)
            if (lanc) {
              const dataLanc = (lanc.getString('data') || '').slice(0, 10)
              if (dataLanc !== caso.vencDia) {
                salvarBackup('lancamentos', lanc.id, lanc)
                lanc.set('data', `${caso.vencDia} 12:00:00.000Z`)
                app.save(lanc)
                lancamentosAjustados++
              }
            }
          }
        }
      } catch (eCaso) {
        console.warn(`[0090] Caso confirmado ${caso.id} não pôde ser atualizado:`, eCaso)
      }
    }

    console.log(
      `[0090] Migração concluída com sucesso. Ocorrências ajustadas: ${ocorrenciasAjustadas}, Lançamentos ajustados: ${lancamentosAjustados}.`,
    )
  },
  (app) => {
    // Reversão via backup_remocoes se necessário
    console.log('[0090] Down migration executada.')
  },
)
