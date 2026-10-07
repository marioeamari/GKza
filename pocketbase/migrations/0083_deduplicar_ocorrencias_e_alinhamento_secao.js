migrate(
  (app) => {
    // Migração 0083: Deduplicação de ocorrências gêmeas, alinhamento de seção/conta e backup
    // ERP GKza - Idempotente

    // =========================================================================
    // PARTE 1: Coleção de Backup dos registros removidos
    // =========================================================================
    const authenticated = "@request.auth.id != ''"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    if (!app.hasTable('backup_remocoes')) {
      const backupCol = new Collection({
        name: 'backup_remocoes',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: authenticated,
        updateRule: adminOrManager,
        deleteRule: adminOrManager,
        fields: [
          { name: 'origem_colecao', type: 'text', required: true, max: 100 },
          { name: 'registro_id', type: 'text', required: true, max: 50 },
          { name: 'motivo', type: 'text', required: true, max: 250 },
          { name: 'dados_json', type: 'text', required: false, max: 50000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_bkp_origem ON backup_remocoes (origem_colecao)',
          'CREATE INDEX idx_bkp_reg_id ON backup_remocoes (registro_id)',
          'CREATE INDEX idx_bkp_motivo ON backup_remocoes (motivo)',
        ],
      })
      app.save(backupCol)
    }

    const backupCollection = app.findCollectionByNameOrId('backup_remocoes')

    function salvarBackup(origemColecao, registroId, motivo, dadosObj) {
      try {
        // Idempotência: verificar se já existe backup gravado deste registro_id
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

    // Helper para extrair todos os campos de um Record em objeto plano
    function recordToPlain(rec) {
      if (!rec) return {}
      const res = { id: rec.id }
      // PocketBase record fields
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
        'descricao',
        'valor',
        'tipo',
        'data',
        'categoria',
        'pessoa',
        'fatura_paga',
        'fatura_pagamento_id',
        'is_pagamento_fatura',
        'cartao_fatura_conta',
        'comprovante',
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

    // =========================================================================
    // PARTE 2: Deduplicar Ballet Rafa pontual específico
    // =========================================================================
    // Manter: klnyf00s6j4yvlk (paga em 05/09, vencimento dia 5, lancamento fchuq3vro9sduri)
    // Excluir: de3x7f7jnz59thm + lançamento kyi2w1q30j6kt37 com backup
    console.log('[Migration 0083] Iniciando desduplicação do Ballet Rafa...')

    let balletExcluido = false
    try {
      const ocGemea = app.findFirstRecordByData('despesas_ocorrencias', 'id', 'de3x7f7jnz59thm')
      if (ocGemea) {
        salvarBackup(
          'despesas_ocorrencias',
          'de3x7f7jnz59thm',
          'Deduplicacao Ballet Rafa - gemea excluida',
          recordToPlain(ocGemea),
        )
        app.delete(ocGemea)
        balletExcluido = true
        console.log('  - Ocorrência gêmea de3x7f7jnz59thm removida com backup.')
      }
    } catch (e) {
      console.log('  - Ocorrência de3x7f7jnz59thm não encontrada ou já excluída:', e)
    }

    let lancBalletExcluido = false
    try {
      const lancGemeo = app.findFirstRecordByData('lancamentos', 'id', 'kyi2w1q30j6kt37')
      if (lancGemeo) {
        salvarBackup(
          'lancamentos',
          'kyi2w1q30j6kt37',
          'Deduplicacao Ballet Rafa - lancamento gemeo excluido',
          recordToPlain(lancGemeo),
        )
        app.delete(lancGemeo)
        lancBalletExcluido = true
        console.log('  - Lançamento kyi2w1q30j6kt37 removido com backup.')
      }
    } catch (e) {
      console.log('  - Lançamento kyi2w1q30j6kt37 não encontrado ou já excluído:', e)
    }

    // =========================================================================
    // PARTE 3: Varredura de ocorrências gêmeas em TODOS os meses
    // =========================================================================
    // Cobre /despesas e /dizimos.
    // Padrão A: Paga + Prevista para o mesmo (compromisso, competência, numero_parcela).
    //           Excluir a prevista excedente (sem pagamento/lançamento).
    // Padrão B: Paga + Paga com mesmo valor e timestamps de criação muito próximos
    //           (< 5 segundos - mesmo clique acidental).
    //           Manter a mais coerente com o vencimento/regra do compromisso e excluir a outra + seu lançamento.
    console.log('[Migration 0083] Iniciando varredura em todas as ocorrências...')

    const todasOcorrencias = app.findRecordsByFilter(
      'despesas_ocorrencias',
      'id != ""',
      'created',
      10000,
      0,
    )

    // Agrupar por: compromisso + '__' + competencia + '__' + (numero_parcela || 0)
    const gruposCompMes = {}
    for (let i = 0; i < todasOcorrencias.length; i++) {
      const oc = todasOcorrencias[i]
      const compId = oc.getString('compromisso')
      if (!compId) continue
      const comp = oc.getString('competencia') || ''
      const parc = oc.getInt('numero_parcela') || 0
      const chave = compId + '__' + comp + '__' + parc
      if (!gruposCompMes[chave]) {
        gruposCompMes[chave] = []
      }
      gruposCompMes[chave].push(oc)
    }

    let totalPadraoAExcluidas = 0 // Previstas excedentes removidas
    let totalPadraoBExcluidas = 0 // Pagas gêmeas do mesmo clique removidas
    let totalLancamentosPadraoBExcluidos = 0

    const chaves = Object.keys(gruposCompMes)
    for (let k = 0; k < chaves.length; k++) {
      const lista = gruposCompMes[chaves[k]]
      if (lista.length <= 1) continue

      // Separar pagas e previstas
      const pagas = []
      const previstas = []
      for (let j = 0; j < lista.length; j++) {
        const item = lista[j]
        const st = item.getString('status')
        const temLanc = !!item.getString('lancamento')
        const temDataPag = !!item.getString('data_pagamento')
        const vp = item.getFloat('valor_pago')
        if (st === 'paga' || temLanc || temDataPag || (vp && vp > 0)) {
          pagas.push(item)
        } else {
          previstas.push(item)
        }
      }

      // PADRÃO A: Se há pelo menos 1 ocorrência paga E pelo menos 1 ocorrência prevista
      // Excluir as ocorrências previstas excedentes
      if (pagas.length >= 1 && previstas.length >= 1) {
        for (let p = 0; p < previstas.length; p++) {
          const prev = previstas[p]
          // Confirmação estrita de segurança: sem pagamento e sem lançamento
          const st = prev.getString('status')
          const lanc = prev.getString('lancamento')
          const dp = prev.getString('data_pagamento')
          const vp = prev.getFloat('valor_pago')
          if (st === 'prevista' && !lanc && !dp && (!vp || vp === 0)) {
            salvarBackup(
              'despesas_ocorrencias',
              prev.id,
              'Varredura Padrao A - Prevista excedente em mes ja pago',
              recordToPlain(prev),
            )
            app.delete(prev)
            totalPadraoAExcluidas++
            console.log(
              '  - [Padrão A] Excluída ocorrência prevista excedente ' +
                prev.id +
                ' (compromisso: ' +
                prev.getString('compromisso') +
                ', comp: ' +
                prev.getString('competencia') +
                ')',
            )
          }
        }
      }

      // PADRÃO B: Se há múltiplas ocorrências pagas no mesmo ciclo
      // Verificar se foram criadas no mesmo clique acidental (mesmo valor e intervalo < 5000ms)
      if (pagas.length > 1) {
        // Ordenar por created crescente
        pagas.sort((a, b) => {
          const ta = a.getString('created') || ''
          const tb = b.getString('created') || ''
          return ta.localeCompare(tb)
        })

        // Percorrer pares
        for (let idxA = 0; idxA < pagas.length - 1; idxA++) {
          const ocA = pagas[idxA]
          if (!ocA) continue

          for (let idxB = idxA + 1; idxB < pagas.length; idxB++) {
            const ocB = pagas[idxB]
            if (!ocB) continue

            const valorA = Math.round(ocA.getFloat('valor_pago') * 100)
            const valorB = Math.round(ocB.getFloat('valor_pago') * 100)
            if (valorA !== valorB || valorA === 0) continue

            const timeA = new Date(ocA.getString('created')).getTime()
            const timeB = new Date(ocB.getString('created')).getTime()
            const diffMs = Math.abs(timeA - timeB)

            // Criadas em menos de 5 segundos (mesmo clique)
            if (!isNaN(diffMs) && diffMs < 5000) {
              // Decidir qual MANTER e qual EXCLUIR:
              // Se uma tem data_vencimento compatível com a data do compromisso ou é a mais coerente
              // Por padrão: manter ocA (primeira criada) ou ocB se ocB tiver data_pagamento alinhada ao vencimento
              let manter = ocA
              let excluir = ocB

              // Se ocB tem vencimento exato e ocA não, ou similar
              const vencA = (ocA.getString('data_vencimento') || '').slice(8, 10)
              const vencB = (ocB.getString('data_vencimento') || '').slice(8, 10)
              const pagA = (ocA.getString('data_pagamento') || '').slice(8, 10)
              const pagB = (ocB.getString('data_pagamento') || '').slice(8, 10)

              if (vencA === pagA && vencB !== pagB) {
                manter = ocA
                excluir = ocB
              } else if (vencB === pagB && vencA !== pagA) {
                manter = ocB
                excluir = ocA
              }

              const lancIdExcluir = excluir.getString('lancamento')
              salvarBackup(
                'despesas_ocorrencias',
                excluir.id,
                'Varredura Padrao B - Ocorrencia paga gemea mesmo clique (mantida ' +
                  manter.id +
                  ')',
                recordToPlain(excluir),
              )

              if (lancIdExcluir) {
                try {
                  const lancRec = app.findFirstRecordByData('lancamentos', 'id', lancIdExcluir)
                  if (lancRec) {
                    salvarBackup(
                      'lancamentos',
                      lancIdExcluir,
                      'Varredura Padrao B - Lancamento da ocorrencia paga gemea ' + excluir.id,
                      recordToPlain(lancRec),
                    )
                    app.delete(lancRec)
                    totalLancamentosPadraoBExcluidos++
                    console.log('  - [Padrão B] Lançamento ' + lancIdExcluir + ' excluído.')
                  }
                } catch (_) {}
              }

              app.delete(excluir)
              totalPadraoBExcluidas++
              console.log(
                '  - [Padrão B] Ocorrência paga gêmea ' +
                  excluir.id +
                  ' excluída (mantida: ' +
                  manter.id +
                  ')',
              )

              // Marcar para não reprocessar nesta iteração
              pagas[idxB] = null
            }
          }
        }
      }
    }

    // =========================================================================
    // PARTE 4: Alinhar seção das ocorrências à do compromisso e corrigir método boleto/não-cartão
    // =========================================================================
    // Compromisso pago por boleto não deve ter secao 'cartoes_credito' nem lançar em conta com tipo cartao como crédito.
    console.log('[Migration 0083] Alinhando seção das ocorrências à do compromisso...')

    // 1. Mapear métodos de crédito legítimos
    const todosMetodos = app.findRecordsByFilter('metodos_pagamento', 'id != ""', 'nome', 500, 0)
    const metodosCreditoSet = new Set()
    for (let m = 0; m < todosMetodos.length; m++) {
      const met = todosMetodos[m]
      const metTipo = (met.getString('tipo') || '').toLowerCase()
      const metNome = (met.getString('nome') || '').toLowerCase()
      const metCod = (met.getString('codigo') || '').toLowerCase()
      if (
        metTipo === 'cartao' ||
        metNome.includes('crédito') ||
        metNome.includes('credito') ||
        metCod.includes('credito')
      ) {
        metodosCreditoSet.add(met.id)
      }
    }

    // 2. Mapear todos os compromissos
    const compromissos = app.findRecordsByFilter(
      'despesas_compromisso',
      'id != ""',
      'created',
      2000,
      0,
    )
    const compMap = {}
    for (let c = 0; c < compromissos.length; c++) {
      compMap[compromissos[c].id] = compromissos[c]
    }

    // Corrigir seção dos compromissos não-crédito que estejam como 'cartoes_credito'
    let compSecaoAjustados = 0
    for (let c = 0; c < compromissos.length; c++) {
      const comp = compromissos[c]
      const mpId = comp.getString('metodo_pagamento')
      const ehCredito = mpId ? metodosCreditoSet.has(mpId) : false
      const secaoAtual = comp.getString('secao')
      if (!ehCredito && secaoAtual === 'cartoes_credito') {
        const regra = comp.getString('regra_repeticao')
        const novaSecao = regra === 'anual' ? 'assinaturas_anuais' : 'contas_mensais_pix_boleto'
        comp.set('secao', novaSecao)
        app.save(comp)
        compSecaoAjustados++
        console.log(
          '  - Compromisso ' +
            comp.id +
            ' ("' +
            comp.getString('descricao') +
            '") secao corrigida para ' +
            novaSecao,
        )
      }
    }

    // 3. Alinhar TODAS as ocorrências à seção do seu compromisso
    // Se o compromisso tem secao X, a ocorrência DEVE ter secao X
    const ocorrenciasRestantes = app.findRecordsByFilter(
      'despesas_ocorrencias',
      'id != ""',
      'created',
      10000,
      0,
    )

    let ocsSecaoAjustadas = 0
    for (let o = 0; o < ocorrenciasRestantes.length; o++) {
      const oc = ocorrenciasRestantes[o]
      const compId = oc.getString('compromisso')
      const comp = compId ? compMap[compId] : null
      if (!comp) continue

      const secaoComp = comp.getString('secao')
      const secaoOc = oc.getString('secao')

      let secaoDesejada = secaoComp
      if (!secaoDesejada || secaoDesejada === '') {
        const mpId = comp.getString('metodo_pagamento')
        const ehCredito = mpId ? metodosCreditoSet.has(mpId) : false
        if (ehCredito) {
          secaoDesejada = 'cartoes_credito'
        } else {
          secaoDesejada =
            comp.getString('regra_repeticao') === 'anual'
              ? 'assinaturas_anuais'
              : 'contas_mensais_pix_boleto'
        }
      }

      if (secaoOc !== secaoDesejada) {
        oc.set('secao', secaoDesejada)
        app.save(oc)
        ocsSecaoAjustadas++
      }
    }

    console.log(
      '[Migration 0083] Concluída! ' +
        'Previstas excedentes removidas: ' +
        totalPadraoAExcluidas +
        ', Pagas gêmeas removidas: ' +
        totalPadraoBExcluidas +
        ' (e ' +
        totalLancamentosPadraoBExcluidos +
        ' lançamentos), ' +
        'Compromissos alinhados: ' +
        compSecaoAjustados +
        ', Ocorrências alinhadas: ' +
        ocsSecaoAjustadas,
    )
  },
  (app) => {
    // Rollback idempotente vazio
  },
)
