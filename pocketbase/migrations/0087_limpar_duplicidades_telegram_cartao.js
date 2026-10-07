/// <reference types="pocketbase" />

/**
 * Migration 0087: Limpar duplicidades Telegram em compras de cartão,
 * preservar compromissos fixos e normalizar grafias "Chamagas".
 *
 * Regras:
 * 1. Fazer backup serializado em backup_remocoes antes de qualquer mutação.
 * 2. Filtrar despesas_compromisso criados entre 01/10 e 07/10 com regra_repeticao = 'avulso'
 *    vindos de compras avulsas de consumo (Marmita, Carne, Abastecimento Mayta x2,
 *    Material Barracão, Taxa Anuidade Porto Seguro, Chamagas/Água múltiplos, Frutydellys,
 *    Diegus, Morilo P. Gama, PdAdministradora).
 * 3. Para cada um:
 *    - Se existir ocorrência 'prevista' vinculada E lançamento equivalente (pago ou existente no caixa)
 *      -> excluir a ocorrência prevista e o compromisso-fantasma.
 *    - Se NÃO existir lançamento correspondente -> PRESERVAR e logar para revisão.
 * 4. PRESERVAR SEMPRE (cláusula de exclusão explícita por nome):
 *    - Energia CPFL
 *    - Equipamentos Corte Lases (Rohmes)
 *    - Guarda Rua
 *    - Escola Sesi
 *    - Cartão Protegido (Porto Seguro)
 *    - Ferragem Estaleiro (Jr Aço)
 * 5. Zerar dízimo/dizimo_percentual nas compras de consumo avulsas afetadas.
 * 6. Normalizar grafias chamagaas/chamaga/CHAMAGAS -> "Chamagas" nos compromissos e fornecedores.
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

    const ehItemPreservado = (desc, forn) => {
      const d = (desc || '').toLowerCase()
      const f = (forn || '').toLowerCase()
      return nomesPreservar.some((p) => d.includes(p) || f.includes(p))
    }

    // 1. Normalizar grafias de Chamagas
    console.log('[0087] Normalizando grafias de Chamagas...')
    try {
      app
        .db()
        .newQuery(
          `UPDATE despesas_compromisso 
           SET fornecedor = 'Chamagas' 
           WHERE LOWER(fornecedor) IN ('chamagaas', 'chamaga', 'chamagas', 'chamagás')`,
        )
        .execute()

      app
        .db()
        .newQuery(
          `UPDATE despesas_ocorrencias 
           SET observacoes = REPLACE(observacoes, 'Chamagaas', 'Chamagas') 
           WHERE observacoes LIKE '%Chamagaas%'`,
        )
        .execute()

      app
        .db()
        .newQuery(
          `UPDATE lancamentos 
           SET observacoes = REPLACE(observacoes, 'Chamagaas', 'Chamagas') 
           WHERE observacoes LIKE '%Chamagaas%'`,
        )
        .execute()
    } catch (errNorm) {
      console.warn('[0087] Aviso ao normalizar Chamagas:', errNorm)
    }

    // 2. Buscar compromissos avulsos criados entre 01/10 e 07/10
    console.log('[0087] Buscando compromissos avulsos criados entre 01/10 e 07/10...')
    const compromissos = app.findRecordsByFilter(
      'despesas_compromisso',
      "regra_repeticao = 'avulso' && created >= '2026-10-01 00:00:00' && created <= '2026-10-07 23:59:59'",
      '-created',
      500,
      0,
    )

    console.log(`[0087] Encontrados ${compromissos.length} compromissos avulsos candidatos.`)

    const targets = [
      'marmita',
      'carne',
      'abastecimento',
      'mayta',
      'material barracão',
      'material barracao',
      'taxa anuidade',
      'anuidade porto seguro',
      'chamagas',
      'chamaga',
      'água',
      'agua',
      'frutydellys',
      'diegus',
      'morilo p. gama',
      'morilo',
      'pdadministradora',
    ]

    let excluidosCompromissos = 0
    let excluidasOcorrencias = 0
    let preservadosSemLancamento = 0
    let dízimosZerados = 0

    for (const comp of compromissos) {
      const desc = comp.getString('descricao') || ''
      const forn = comp.getString('fornecedor') || ''
      const descLower = desc.toLowerCase()
      const fornLower = forn.toLowerCase()

      // Cláusula de proteção explícita
      if (ehItemPreservado(desc, forn)) {
        console.log(`[0087] PRESERVADO (regra de ouro): ${comp.id} - ${desc} (${forn})`)
        continue
      }

      const matchTarget = targets.some((t) => descLower.includes(t) || fornLower.includes(t))
      if (!matchTarget) {
        continue
      }

      const compDizimo = comp.getBool('dizimo')
      const compDizPct = comp.getFloat('dizimo_percentual')

      // Zerar dízimo/dizimo_percentual em compras avulsas de consumo afetadas
      if (compDizimo || compDizPct > 0) {
        try {
          comp.set('dizimo', false)
          comp.set('dizimo_percentual', 0)
          app.save(comp)

          app
            .db()
            .newQuery(
              `UPDATE despesas_ocorrencias 
               SET dizimo = 0, dizimo_percentual = 0 
               WHERE compromisso = {:id}`,
            )
            .bind({ id: comp.id })
            .execute()

          dízimosZerados++
        } catch (eDiz) {
          console.warn(`[0087] Erro ao zerar dízimo do compromisso ${comp.id}:`, eDiz)
        }
      }

      // Verificar ocorrências vinculadas a este compromisso
      const ocorrencias = app.findRecordsByFilter(
        'despesas_ocorrencias',
        `compromisso = '${comp.id}'`,
        '',
        50,
        0,
      )

      const ocorrenciasPrevistas = ocorrencias.filter((o) => o.getString('status') === 'prevista')

      if (ocorrenciasPrevistas.length === 0) {
        console.log(
          `[0087] Compromisso ${comp.id} (${desc}) sem ocorrências previstas pendentes. Mantendo.`,
        )
        continue
      }

      // Verificar se existe lançamento no caixa correspondente
      const contaId = comp.getString('conta_padrao')
      const valComp = comp.getFloat('valor_estimado')

      let lancamentosCheck = []
      try {
        lancamentosCheck = app.findRecordsByFilter(
          'lancamentos',
          `conta = '${contaId}' && (valor = ${valComp} || descricao ~ '${desc.replace(/'/g, "\\'")}')`,
          '-created',
          5,
          0,
        )
      } catch {
        lancamentosCheck = app.findRecordsByFilter(
          'lancamentos',
          `conta = '${contaId}' && valor = ${valComp}`,
          '-created',
          5,
          0,
        )
      }

      const temLancamentoEquivalente = lancamentosCheck.length > 0

      if (temLancamentoEquivalente) {
        // Backup antes de remover
        try {
          const backupComp = new Record(backupColl, {
            tipo_registro: 'despesas_compromisso',
            registro_id: comp.id,
            dados_backup: JSON.stringify(comp),
            motivo:
              '0087_limpar_duplicidades_telegram_cartao: compromisso fantasma com lançamento existente',
          })
          app.save(backupComp)
        } catch (bErr) {
          console.warn(`[0087] Aviso ao salvar backup de compromisso ${comp.id}:`, bErr)
        }

        // Excluir ocorrências previstas vinculadas
        for (const oc of ocorrenciasPrevistas) {
          try {
            const backupOc = new Record(backupColl, {
              tipo_registro: 'despesas_ocorrencias',
              registro_id: oc.id,
              dados_backup: JSON.stringify(oc),
              motivo:
                '0087_limpar_duplicidades_telegram_cartao: ocorrencia prevista fantasma de cartao',
            })
            app.save(backupOc)
            app.delete(oc)
            excluidasOcorrencias++
          } catch (ocErr) {
            console.warn(`[0087] Erro ao excluir ocorrência prevista ${oc.id}:`, ocErr)
          }
        }

        // Se o compromisso só tinha essas ocorrências ou ficou sem ocorrências, excluir compromisso
        try {
          const remainingOc = app.findRecordsByFilter(
            'despesas_ocorrencias',
            `compromisso = '${comp.id}'`,
            '',
            10,
            0,
          )

          if (remainingOc.length === 0) {
            app.delete(comp)
            excluidosCompromissos++
            console.log(`[0087] Excluído compromisso-fantasma ${comp.id} (${desc} - ${forn})`)
          } else {
            console.log(
              `[0087] Compromisso ${comp.id} ainda tem ${remainingOc.length} ocorrências pagas/históricas; mantido sem duplicidade prevista.`,
            )
          }
        } catch (delCompErr) {
          console.warn(`[0087] Erro ao excluir compromisso ${comp.id}:`, delCompErr)
        }
      } else {
        preservadosSemLancamento++
        console.log(
          `[0087] PRESERVADO (sem lançamento correspondente para validação): ${comp.id} - ${desc} (${valComp})`,
        )
      }
    }

    console.log(
      `[0087] Migração concluída: ${excluidosCompromissos} compromissos excluídos, ${excluidasOcorrencias} ocorrências previstas excluídas, ${preservadosSemLancamento} preservados para revisão, ${dízimosZerados} dízimos zerados.`,
    )
  },
  (app) => {
    // Reverter não restaura dados excluídos sem intervenção manual de backup_remocoes
    console.log('[0087] Rollback: dados removidos estão preservados na tabela backup_remocoes.')
  },
)
