/// <reference types="pocketbase" />

/**
 * Migration 0089: Limpeza de compromissos avulsos e ocorrências Telegram remanescentes em cartão (01-02/10).
 *
 * Contexto:
 * A migração 0088 fez a limpeza focada em padrões específicos de texto/origem Telegram de 06-07/10
 * e compromissos avulsos de consumo, mas ~10 compromissos avulsos criados entre 01/10 e 02/10
 * com fornecedores específicos e sem texto explícito de comprovante nas observações continuaram
 * vivos gerando ocorrências previstas para 2026-10-23 em /despesas:
 * - pvmdz9pvc6yfmkt (Giuliano, R$ 28,00)
 * - ar8mpytjz01swrz (Bebidas / Carvoaria Sogra, R$ 96,20)
 * - amslbuapf2mt8n2 (Bernaske, R$ 8,90)
 * - i5sbb6a6yov8pp9 (Bebida / Maytá, R$ 21,97)
 * - p7y7d5p2o0abxtb (Almoço / Macauba, R$ 137,82)
 * - 54lqbeo0sey4k4n (??? / Murillo Pereira, R$ 6,00)
 * - t61xjf3ua7i8ije (Dentista / Clina Jardins, R$ 120,00)
 * - j7fqsoqn1f736ma (Bebidas / Carvoaria Sogra, R$ 39,20)
 * - 1el5zxfcnz65mhy (Cabelo e Barba / Barão, R$ 70,00)
 * - gram8o3namz538y (Giuliano, R$ 73,50)
 *
 * Regras da migração:
 * 1. BACKUP OBRIGATÓRIO: Antes de qualquer delete/mutação, salvar em backup_remocoes com:
 *    - motivo: '0089_limpeza_avulsos_telegram_outubro'
 *    - origem_colecao: 'despesas_compromisso' | 'despesas_ocorrencias'
 *    - registro_id: id do registro
 *    - dados_json: serialização completa do registro
 * 2. EXCLUIR ocorrências previstas abertas desses compromissos e dos demais avulsos de cartão
 *    originados de triagem do Telegram.
 *    - Se uma ocorrência tiver um lançamento vinculado:
 *      * Se for duplicata de lançamento pago: preservar lançamento e excluir ocorrência + compromisso.
 *      * Se não tiver equivalente pago: desvincular o lançamento da ocorrência antes de excluí-la,
 *        preservando o lançamento para conferência pelo usuário.
 * 3. EXCLUIR os compromissos avulsos que ficarem sem ocorrências (com backup prévio).
 * 4. WHITELIST RÍGIDA:
 *    - Energia CPFL
 *    - Equipamentos Rohmes (ou Corte Lases)
 *    - Guarda Rua
 *    - Escola Sesi
 *    - Cartão Protegido (ex: compromisso vyb899t7y98gqxx)
 *    - Ferragem Estaleiro (Jr Aço) - parcela 2/2
 *    - Parcela 2/4 da empresa (compromisso zwoubwlzs3xy9p9)
 *    - Assinatura anual (compromisso bacts5yc21lnqt8, IPTU Botânico / assinaturas_anuais)
 *    - TODOS os compromissos recorrentes (mensal, anual)
 *    - TODOS os parcelados (total_parcelas > 1 ou modalidade parcelado)
 * 5. ZERAR DÍZIMO:
 *    - No compromisso de assinatura bacts5yc21lnqt8 e suas ocorrências: zerar dízimo/percentual/tipo_dizimo.
 *    - Nos compromissos avulsos preservados criados via Telegram (compras de consumo) que ainda tenham
 *      dizimo=true com percentual=100: zerar dizimo/dizimo_percentual/tipo_dizimo.
 */

migrate(
  (app) => {
    const backupColl = app.findCollectionByNameOrId('backup_remocoes')
    const ocorrenciasColl = app.findCollectionByNameOrId('despesas_ocorrencias')
    const compromissosColl = app.findCollectionByNameOrId('despesas_compromisso')

    const MOTIVO_BKP = '0089_limpeza_avulsos_telegram_outubro'

    // Função de backup idempotente e segura
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
        console.warn(`[0089] Falha ao gravar backup de ${origemColecao} (${registroId}):`, err)
        return null
      }
    }

    // 1. Whitelist explícita
    const nomesPreservar = [
      'energia cpfl',
      'cpfl',
      'equipamentos corte lases',
      'equipamentos rohmes',
      'rohmes',
      'guarda rua',
      'escola sesi',
      'sesi',
      'cartão protegido',
      'cartao protegido',
      'ferragem estaleiro',
      'jr aço',
      'jr aco',
    ]

    const idsPreservarCompromissos = new Set([
      'zwoubwlzs3xy9p9', // Parcela 2/4 empresa
      'bacts5yc21lnqt8', // Assinatura anual IPTU Botânico
      'vyb899t7y98gqxx', // Cartão Protegido
    ])

    const ehItemPreservado = (compId, desc, forn, obs) => {
      if (compId && idsPreservarCompromissos.has(compId)) return true
      const d = (desc || '').toLowerCase()
      const f = (forn || '').toLowerCase()
      const o = (obs || '').toLowerCase()
      return nomesPreservar.some((p) => d.includes(p) || f.includes(p) || o.includes(p))
    }

    // 2. Zerar dízimo de assinaturas anuais / IPTU (bacts5yc21lnqt8)
    try {
      const bComp = app.findRecordById('despesas_compromisso', 'bacts5yc21lnqt8')
      if (bComp) {
        salvarBackup('despesas_compromisso', bComp.id, bComp)
        bComp.set('dizimo', false)
        bComp.set('dizimo_percentual', 0)
        bComp.set('tipo_dizimo', '')
        app.save(bComp)
        console.log('[0089] Dízimo zerado com sucesso no compromisso bacts5yc21lnqt8.')
      }
    } catch (e) {
      console.warn('[0089] Compromisso bacts5yc21lnqt8 não encontrado para zerar dízimo:', e)
    }

    try {
      const ocorrenciasBacts = app.findRecordsByFilter(
        'despesas_ocorrencias',
        "compromisso = 'bacts5yc21lnqt8'",
        '',
        100,
        0,
      )
      for (const oc of ocorrenciasBacts) {
        if (oc.getBool('dizimo') || oc.getFloat('dizimo_percentual') > 0) {
          salvarBackup('despesas_ocorrencias', oc.id, oc)
          oc.set('dizimo', false)
          oc.set('dizimo_percentual', 0)
          oc.set('tipo_dizimo', '')
          app.save(oc)
        }
      }
      console.log(
        `[0089] Dízimo zerado nas ocorrências do compromisso bacts5yc21lnqt8 (${ocorrenciasBacts.length} ocorrências).`,
      )
    } catch (e) {
      console.warn('[0089] Falha ao zerar dízimo nas ocorrências de bacts5yc21lnqt8:', e)
    }

    // 3. Mapear contas de cartão
    const contasCartaoRecords = app.findRecordsByFilter('contas', "tipo = 'cartao'", '', 100, 0)
    const contasCartaoIds = new Set(contasCartaoRecords.map((c) => c.id))
    contasCartaoIds.add('sglo7dfsqvgfsni') // NuBank

    // 4. Identificar os 10 compromissos-alvo explícitos da tarefa e candidatos correlatos
    const idsAlvoExplicitos = new Set([
      'pvmdz9pvc6yfmkt', // Giuliano R$ 28,00
      'ar8mpytjz01swrz', // Bebidas R$ 96,20
      'amslbuapf2mt8n2', // Bernaske R$ 8,90
      'i5sbb6a6yov8pp9', // Bebida Maytá R$ 21,97
      'p7y7d5p2o0abxtb', // Almoço Macauba R$ 137,82
      '54lqbeo0sey4k4n', // ??? Murillo Pereira R$ 6,00
      't61xjf3ua7i8ije', // Dentista R$ 120,00
      'j7fqsoqn1f736ma', // Bebidas Carvoaria R$ 39,20
      '1el5zxfcnz65mhy', // Cabelo e Barba R$ 70,00
      'gram8o3namz538y', // Giuliano R$ 73,50
    ])

    // Varredura de ocorrências previstas em aberto
    const ocorrenciasPrevistas = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "status = 'prevista'",
      '-created',
      2000,
      0,
    )

    console.log(`[0089] Total de ocorrências previstas analisadas: ${ocorrenciasPrevistas.length}`)

    let ocorrenciasExcluidas = 0
    let compromissosExcluidos = 0
    let lancamentosDesvinculados = 0
    let dizimosZeradosAvulsos = 0
    const compromissosCandidatosRemocao = new Set()

    for (const oc of ocorrenciasPrevistas) {
      const compId = oc.getString('compromisso')
      if (!compId) continue

      let comp
      try {
        comp = app.findRecordById('despesas_compromisso', compId)
      } catch (_) {
        continue
      }

      const desc = comp.getString('descricao') || ''
      const forn = comp.getString('fornecedor') || ''
      const obsComp = comp.getString('observacoes') || ''
      const obsOc = oc.getString('observacoes') || ''
      const regraRep = comp.getString('regra_repeticao')
      const totalParcelas = comp.getInt('total_parcelas')
      const modalidade = comp.getString('modalidade_parcelamento')

      // WHITELIST E PROTEÇÕES INVIOLÁVEIS:
      if (
        ehItemPreservado(compId, desc, forn, obsComp) ||
        ehItemPreservado(compId, desc, forn, obsOc)
      ) {
        continue
      }
      if (regraRep === 'mensal' || regraRep === 'anual') {
        continue
      }
      if (totalParcelas > 1 || modalidade === 'parcelado') {
        continue
      }
      if (regraRep !== 'avulso') {
        continue
      }

      // Conta ou seção de cartão
      const contaId = oc.getString('conta') || comp.getString('conta_padrao')
      const ehCartao =
        contasCartaoIds.has(contaId) ||
        oc.getString('secao') === 'cartoes_credito' ||
        comp.getString('secao') === 'cartoes_credito'

      if (!ehCartao) {
        continue
      }

      // Verificar se é um dos 10 alvos OU se foi criado entre 01/10 e 02/10 com perfil idêntico
      const compCreated = comp.getString('created') || ''
      const dataInicio = comp.getString('data_inicio') || ''
      const criadoOutubro = compCreated >= '2026-10-01' && compCreated <= '2026-10-03'
      const diaVenc = comp.getInt('dia_vencimento')
      const pess = comp.getString('pessoa')
      const compDiz = comp.getBool('dizimo')

      const ehAlvoExplicito = idsAlvoExplicitos.has(compId)
      const ehAlvoPerfilTelegram =
        criadoOutubro &&
        diaVenc === 23 &&
        pess === 'ym6k6cnv78hwjk1' &&
        comp.getString('conta_padrao') === 'sglo7dfsqvgfsni'

      if (!ehAlvoExplicito && !ehAlvoPerfilTelegram) {
        continue
      }

      // Se tiver lançamento vinculado à ocorrência prevista:
      const lancId = oc.getString('lancamento')
      if (lancId) {
        try {
          const lancRec = app.findRecordById('lancamentos', lancId)
          if (lancRec) {
            // Verificar se o lançamento tem equivalente pago
            const lancVal = lancRec.getFloat('valor')
            const lancDesc = lancRec.getString('descricao')
            const lancConta = lancRec.getString('conta')
            const pagouEquiv = app.findRecordsByFilter(
              'lancamentos',
              `id != '${lancId}' && conta = '${lancConta}' && valor = ${lancVal} && status = 'pago'`,
              '-created',
              1,
              0,
            )

            // Em ambos os casos, a instrução diz: preservar o lançamento e apenas desvinculá-lo da ocorrência
            // antes de excluir a ocorrência.
            salvarBackup('lancamentos', lancRec.id, lancRec)
            oc.set('lancamento', '')
            app.save(oc)
            lancamentosDesvinculados++
            console.log(
              `[0089] Lançamento ${lancId} desvinculado da ocorrência ${oc.id} (pagoEquiv: ${pagouEquiv.length > 0}).`,
            )
          }
        } catch (eLanc) {
          console.warn(`[0089] Lançamento ${lancId} não encontrado para desvinculo:`, eLanc)
        }
      }

      // Salvar BACKUP da ocorrência
      salvarBackup('despesas_ocorrencias', oc.id, oc)

      // Excluir a ocorrência
      try {
        app.delete(oc)
        ocorrenciasExcluidas++
        compromissosCandidatosRemocao.add(compId)
        console.log(
          `[0089] Ocorrência prevista excluída: ${oc.id} (Compromisso: ${compId} - ${desc})`,
        )
      } catch (errDelOc) {
        console.warn(`[0089] Erro ao excluir ocorrência ${oc.id}:`, errDelOc)
      }
    }

    // 5. Excluir compromissos avulsos que ficaram sem ocorrências
    for (const compId of compromissosCandidatosRemocao) {
      let comp
      try {
        comp = app.findRecordById('despesas_compromisso', compId)
      } catch (_) {
        continue
      }

      const desc = comp.getString('descricao') || ''
      const forn = comp.getString('fornecedor') || ''
      const obs = comp.getString('observacoes') || ''

      if (ehItemPreservado(compId, desc, forn, obs)) {
        continue
      }

      const restantes = app.findRecordsByFilter(
        'despesas_ocorrencias',
        `compromisso = '${compId}'`,
        '',
        10,
        0,
      )

      if (restantes.length === 0) {
        salvarBackup('despesas_compromisso', comp.id, comp)
        try {
          app.delete(comp)
          compromissosExcluidos++
          console.log(
            `[0089] Compromisso avulso sem ocorrências excluído: ${comp.id} (${desc} - ${forn})`,
          )
        } catch (errDelComp) {
          console.warn(`[0089] Erro ao excluir compromisso ${comp.id}:`, errDelComp)
        }
      } else {
        console.log(
          `[0089] Compromisso ${compId} ainda possui ${restantes.length} ocorrências. Preservado.`,
        )
      }
    }

    // 6. Também garantir que os compromissos nos idsAlvoExplicitos que não tinham ocorrências ou restaram sejam avaliados
    for (const compId of idsAlvoExplicitos) {
      let comp
      try {
        comp = app.findRecordById('despesas_compromisso', compId)
      } catch (_) {
        continue
      }

      const restantes = app.findRecordsByFilter(
        'despesas_ocorrencias',
        `compromisso = '${compId}'`,
        '',
        10,
        0,
      )

      if (restantes.length === 0) {
        salvarBackup('despesas_compromisso', comp.id, comp)
        try {
          app.delete(comp)
          compromissosExcluidos++
          console.log(`[0089] Compromisso alvo explícito sem ocorrências excluído: ${comp.id}`)
        } catch (errDel) {
          console.warn(`[0089] Erro ao excluir compromisso explícito ${compId}:`, errDel)
        }
      }
    }

    // 7. Zerar dízimo em compromissos avulsos preservados de consumo criados via Telegram
    // onde dizimo=true e percentual=100
    const avulsosComDizimo100 = app.findRecordsByFilter(
      'despesas_compromisso',
      "regra_repeticao = 'avulso' && dizimo = true && dizimo_percentual = 100",
      '',
      500,
      0,
    )

    for (const comp of avulsosComDizimo100) {
      const desc = (comp.getString('descricao') || '').toLowerCase()
      const forn = (comp.getString('fornecedor') || '').toLowerCase()
      const obs = (comp.getString('observacoes') || '').toLowerCase()

      // Se for item pessoal/consumo (alimentação, amendoim, perícia, consulta, etc.)
      // compras de consumo nunca são dízimo
      const ehConsumo =
        desc.includes('amendoim') ||
        desc.includes('janta') ||
        desc.includes('carne') ||
        desc.includes('bebida') ||
        desc.includes('almoço') ||
        desc.includes('almoco') ||
        desc.includes('marmita') ||
        desc.includes('perícia') ||
        desc.includes('pericia') ||
        desc.includes('academia') ||
        desc.includes('inscrição') ||
        desc.includes('inscricao') ||
        desc.includes('cabelo') ||
        desc.includes('dentista') ||
        desc.includes('testosterona') ||
        obs.includes('telegram') ||
        obs.includes('comprovante')

      if (ehConsumo) {
        salvarBackup('despesas_compromisso', comp.id, comp)
        comp.set('dizimo', false)
        comp.set('dizimo_percentual', 0)
        comp.set('tipo_dizimo', '')
        app.save(comp)

        // Zerar também nas ocorrências vinculadas
        try {
          const ocs = app.findRecordsByFilter(
            'despesas_ocorrencias',
            `compromisso = '${comp.id}'`,
            '',
            100,
            0,
          )
          for (const oc of ocs) {
            if (oc.getBool('dizimo') || oc.getFloat('dizimo_percentual') > 0) {
              salvarBackup('despesas_ocorrencias', oc.id, oc)
              oc.set('dizimo', false)
              oc.set('dizimo_percentual', 0)
              oc.set('tipo_dizimo', '')
              app.save(oc)
            }
          }
        } catch (_) {}

        dizimosZeradosAvulsos++
      }
    }

    console.log(
      `[0089] Migração 0089 concluída com sucesso: ${ocorrenciasExcluidas} ocorrências excluídas, ${compromissosExcluidos} compromissos excluídos, ${lancamentosDesvinculados} lançamentos desvinculados, ${dizimosZeradosAvulsos} compromissos de consumo com dízimo zerado.`,
    )
  },
  (app) => {
    console.log(
      '[0089] Rollback: dados excluídos estão salvos na coleção backup_remocoes com o motivo 0089_limpeza_avulsos_telegram_outubro.',
    )
  },
)
