migrate(
  (app) => {
    // Migração 0086: Excluir 9 ocorrências previstas atrasadas criadas indevidamente em 07/10
    // com salvamento prévio na coleção backup_remocoes (registro serializado).
    // Compromissos afetados: Água e Esgoto (set/out), Ballet Rafa (set/out),
    // Vivo/Brasil Paralelo (set), Guarda Rua (set), R$ 545,66 Sesi (set), Conserto Logan (set), CPFL (set).
    console.log(
      '[Migration 0086] Iniciando backup e exclusão das 9 ocorrências previstas atrasadas...',
    )

    const idsParaExcluir = [
      'xudyg8gtmsc8doi', // Água e Esgoto 2026-09
      '0m4jbyy91jzfqc5', // Água e Esgoto 2026-10
      'dkjlc6yg3b4tpmi', // Ballet Rafa 2026-09
      'u3jpp7gtgkald8b', // Ballet Rafa 2026-10
      '9yz9pdu1eqp1r0s', // Brasil Paralelo 2026-09 (parcela 1)
      '3byy6bfxlhwhepg', // Conserto Logan 2026-09 (parcela 1)
      'jn1i1w3ieq57i68', // Energia CPFL 2026-09
      '3fw2klgc5wb2zfg', // Escola Sesi R$ 545,66 2026-09
      '6lzbg40jv8nfyt0', // Guarda Rua 2026-09
    ]

    const backupCollection = app.findCollectionByNameOrId('backup_remocoes')

    function salvarBackup(origemColecao, registroId, motivo, dadosObj) {
      try {
        const existentes = app.findRecordsByFilter(
          'backup_remocoes',
          "origem_colecao = '" + origemColecao + "' && registro_id = '" + registroId + "'",
          '-created',
          1,
          0,
        )
        if (existentes && existentes.length > 0) {
          return existentes[0]
        }
      } catch (_) {}

      const rec = new Record(backupCollection)
      rec.set('origem_colecao', origemColecao)
      rec.set('registro_id', registroId)
      rec.set('motivo', motivo)
      rec.set('dados_json', JSON.stringify(dadosObj || {}))
      app.save(rec)
      return rec
    }

    function recordToPlain(rec) {
      if (!rec) return {}
      const res = { id: rec.id }
      const schemaFields = [
        'compromisso',
        'contexto_tipo',
        'empresa',
        'secao',
        'conta',
        'competencia',
        'numero_parcela',
        'total_parcelas',
        'data_vencimento',
        'valor_previsto',
        'status',
        'data_pagamento',
        'valor_pago',
        'lancamento',
        'dizimo',
        'tipo_dizimo',
        'link_pagamento',
        'observacoes',
        'valor_estimado_original',
        'valor_ajustado_manualmente',
        'direcionamento',
        'comprovante_pagamento',
        'dizimo_percentual',
        'created',
        'updated',
      ]
      for (let f = 0; f < schemaFields.length; f++) {
        const fn = schemaFields[f]
        try {
          const val = rec.get(fn)
          if (val !== undefined && val !== null && val !== '') {
            res[fn] = val
          }
        } catch (_) {}
      }
      return res
    }

    let excluidas = 0
    for (let i = 0; i < idsParaExcluir.length; i++) {
      const ocId = idsParaExcluir[i]
      try {
        const ocRec = app.findFirstRecordByData('despesas_ocorrencias', 'id', ocId)
        if (ocRec) {
          // Segurança: só exclui se for status 'prevista' e sem pagamento/lançamento
          const status = ocRec.getString('status')
          const lanc = ocRec.getString('lancamento')
          const dp = ocRec.getString('data_pagamento')
          if (status === 'prevista' && !lanc && !dp) {
            salvarBackup(
              'despesas_ocorrencias',
              ocId,
              'Remoção de ocorrência prevista atrasada fantasma recriada em 07/10',
              recordToPlain(ocRec),
            )
            app.delete(ocRec)
            excluidas++
            console.log('  - Ocorrência prevista fantasma ' + ocId + ' excluída com backup.')
          } else {
            console.warn(
              '  - Ocorrência ' +
                ocId +
                ' ignorada por segurança (status != prevista ou possui pagamento).',
            )
          }
        }
      } catch (err) {
        console.log('  - Ocorrência ' + ocId + ' já não existe ou erro ao buscar:', err)
      }
    }

    console.log(
      '[Migration 0086] Concluído: ' + excluidas + ' ocorrências fantasmas excluídas com backup.',
    )
  },
  (app) => {
    // Reversão defensiva (opcional): não restaura automaticamente para evitar ressurreição de dados incorretos
  },
)
