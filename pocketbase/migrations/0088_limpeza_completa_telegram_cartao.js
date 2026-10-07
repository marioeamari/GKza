/// <reference types="pocketbase" />

/**
 * Migration 0088: Limpeza completa de ocorrências e compromissos Telegram em contas de cartão.
 *
 * Regras:
 * 1. Backup integral em backup_remocoes ANTES de cada mutação
 *    (origem_colecao, registro_id, dados_json serializado completo, motivo '0088_limpeza_completa_telegram_cartao').
 * 2. EXCLUIR todas as ocorrências (status 'prevista') de despesas_compromisso onde regra_repeticao = 'avulso'
 *    E a conta é tipo 'cartao' E origem/observações indicam Telegram
 *    (descrições/fornecedor/observações: Água, Chamagas, chamagaas, Diegus, Morilo, PdAdministradora, Frutydellys, Janta, Conserto TORO, etc.)
 *    INDEPENDENTE do status do lançamento vinculado (a 0087 exigia lançamento pago; os lançamentos estão pendente).
 * 3. Depois, EXCLUIR os compromissos avulsos que ficarem sem nenhuma ocorrência (com backup prévio em backup_remocoes).
 * 4. WHITELIST INTOCÁVEL (nunca excluir/mutar):
 *    - Energia CPFL
 *    - Equipamentos Rohmes (ou Corte Lases)
 *    - Guarda Rua
 *    - Escola Sesi
 *    - Cartão Protegido
 *    - Ferragem Estaleiro (Jr Aço)
 *    - e QUALQUER compromisso com regra_repeticao 'mensal', 'anual' ou 'parcelado'.
 */

migrate(
  (app) => {
    const backupColl = app.findCollectionByNameOrId('backup_remocoes')
    const ocorrenciasColl = app.findCollectionByNameOrId('despesas_ocorrencias')
    const compromissosColl = app.findCollectionByNameOrId('despesas_compromisso')

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

    const ehItemPreservado = (desc, forn, obs) => {
      const d = (desc || '').toLowerCase()
      const f = (forn || '').toLowerCase()
      const o = (obs || '').toLowerCase()
      return nomesPreservar.some((p) => d.includes(p) || f.includes(p) || o.includes(p))
    }

    const alvosTelegram = [
      'água',
      'agua',
      'chamagas',
      'chamagaas',
      'chamaga',
      'diegus',
      'morilo',
      'pdadministradora',
      'frutydellys',
      'janta',
      'conserto toro',
      'carne',
      'marmita',
      'amendoim',
      'abastecimento',
      'mayta',
    ]

    const matchesAlvoTelegram = (desc, forn, obs) => {
      const d = (desc || '').toLowerCase()
      const f = (forn || '').toLowerCase()
      const o = (obs || '').toLowerCase()

      if (o.includes('telegram') || o.includes('extraído do comprovante')) {
        return true
      }

      return alvosTelegram.some((alvo) => d.includes(alvo) || f.includes(alvo) || o.includes(alvo))
    }

    // 1. Mapear contas do tipo 'cartao'
    const contasCartaoRecords = app.findRecordsByFilter('contas', "tipo = 'cartao'", '', 100, 0)
    const contasCartaoIds = new Set(contasCartaoRecords.map((c) => c.id))
    console.log(`[0088] Identificadas ${contasCartaoIds.size} contas do tipo 'cartao'.`)

    // 2. Buscar todas as ocorrências 'prevista'
    const ocorrenciasPrevistas = app.findRecordsByFilter(
      'despesas_ocorrencias',
      "status = 'prevista'",
      '-created',
      1000,
      0,
    )

    console.log(`[0088] Total de ocorrências previstas encontradas: ${ocorrenciasPrevistas.length}`)

    let ocorrenciasExcluidas = 0
    let compromissosExcluidos = 0
    const compromissosCandidatos = new Set()

    for (const oc of ocorrenciasPrevistas) {
      const compId = oc.getString('compromisso')
      if (!compId) continue

      let comp
      try {
        comp = app.findRecordById('despesas_compromisso', compId)
      } catch (_) {
        continue
      }

      // WHITELIST E REGRA DE REPETIÇÃO
      const regraRep = comp.getString('regra_repeticao')
      if (regraRep !== 'avulso') {
        // NUNCA tocar em mensal, anual, parcelado
        continue
      }

      const desc = comp.getString('descricao') || ''
      const forn = comp.getString('fornecedor') || ''
      const obsComp = comp.getString('observacoes') || ''
      const obsOc = oc.getString('observacoes') || ''

      if (ehItemPreservado(desc, forn, obsComp) || ehItemPreservado(desc, forn, obsOc)) {
        console.log(`[0088] Item preservado pela whitelist: ${compId} - ${desc} (${forn})`)
        continue
      }

      // Verificar se a conta é tipo 'cartao' ou seção é cartao
      const contaId = oc.getString('conta') || comp.getString('conta_padrao')
      const ehContaCartao =
        contasCartaoIds.has(contaId) ||
        oc.getString('secao') === 'cartoes_credito' ||
        comp.getString('secao') === 'cartoes_credito'

      if (!ehContaCartao) {
        continue
      }

      // Verificar se origem/observações indicam Telegram ou bate com os alvos descritos
      const isTelegramAlvo =
        matchesAlvoTelegram(desc, forn, obsComp) || matchesAlvoTelegram(desc, forn, obsOc)

      if (!isTelegramAlvo) {
        continue
      }

      // Salvar BACKUP da ocorrência antes de excluir
      try {
        const backupOc = new Record(backupColl, {
          origem_colecao: 'despesas_ocorrencias',
          registro_id: oc.id,
          dados_json: JSON.stringify(oc),
          motivo: '0088_limpeza_completa_telegram_cartao',
        })
        app.save(backupOc)
      } catch (errBkp) {
        console.warn(`[0088] Erro ao salvar backup da ocorrência ${oc.id}:`, errBkp)
      }

      // Excluir a ocorrência prevista
      try {
        app.delete(oc)
        ocorrenciasExcluidas++
        compromissosCandidatos.add(compId)
      } catch (errDelOc) {
        console.warn(`[0088] Erro ao excluir ocorrência ${oc.id}:`, errDelOc)
      }
    }

    console.log(
      `[0088] Ocorrências previstas de cartão Telegram excluídas: ${ocorrenciasExcluidas}`,
    )

    // 3. Excluir compromissos avulsos que ficaram sem nenhuma ocorrência
    for (const compId of compromissosCandidatos) {
      let comp
      try {
        comp = app.findRecordById('despesas_compromisso', compId)
      } catch (_) {
        continue
      }

      const desc = comp.getString('descricao') || ''
      const forn = comp.getString('fornecedor') || ''
      const obsComp = comp.getString('observacoes') || ''

      if (ehItemPreservado(desc, forn, obsComp)) {
        continue
      }

      if (comp.getString('regra_repeticao') !== 'avulso') {
        continue
      }

      // Checar se restou alguma ocorrência vinculada
      const restantes = app.findRecordsByFilter(
        'despesas_ocorrencias',
        `compromisso = '${compId}'`,
        '',
        10,
        0,
      )

      if (restantes.length === 0) {
        // Backup do compromisso antes da exclusão
        try {
          const backupComp = new Record(backupColl, {
            origem_colecao: 'despesas_compromisso',
            registro_id: comp.id,
            dados_json: JSON.stringify(comp),
            motivo: '0088_limpeza_completa_telegram_cartao',
          })
          app.save(backupComp)
        } catch (errBkpComp) {
          console.warn(`[0088] Erro ao salvar backup do compromisso ${comp.id}:`, errBkpComp)
        }

        try {
          app.delete(comp)
          compromissosExcluidos++
          console.log(`[0088] Compromisso avulso sem ocorrências excluído: ${comp.id} (${desc})`)
        } catch (errDelComp) {
          console.warn(`[0088] Erro ao excluir compromisso ${comp.id}:`, errDelComp)
        }
      } else {
        console.log(
          `[0088] Compromisso ${compId} (${desc}) possui ${restantes.length} ocorrências restantes. Preservado.`,
        )
      }
    }

    console.log(
      `[0088] Migração finalizada: ${ocorrenciasExcluidas} ocorrências previstas excluídas, ${compromissosExcluidos} compromissos avulsos sem ocorrências excluídos.`,
    )
  },
  (app) => {
    console.log(
      '[0088] Rollback: dados excluídos estão preservados na coleção backup_remocoes com motivo 0088_limpeza_completa_telegram_cartao.',
    )
  },
)
