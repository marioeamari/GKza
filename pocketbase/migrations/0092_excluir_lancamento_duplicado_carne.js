/// <reference types="pocketbase" />

/**
 * Migration 0092: Excluir lançamento duplicado vj4948a27d2c3r6 de "Carne" (R$ 67,79, 2026-10).
 *
 * Contexto:
 * O lançamento duplicado vj4948a27d2c3r6 foi gerado via Telegram 11 segundos após o lançamento
 * original p2uzssuigy41nyx (R$ 67,79, 2026-10-06).
 * Já foi confirmado que não há ocorrências, compromissos ou pendências vinculadas a ele.
 * O lançamento p2uzssuigy41nyx é estritamente mantido.
 *
 * Procedimento:
 * 1. BACKUP OBRIGATÓRIO: Salvar o registro completo em `backup_remocoes` com motivo
 *    '0092_excluir_lancamento_duplicado_carne' antes de remover.
 * 2. Excluir o lançamento vj4948a27d2c3r6 de `lancamentos`.
 * 3. Preservar rigorosamente p2uzssuigy41nyx e qualquer outro lançamento de "Carne".
 */

migrate(
  (app) => {
    const backupColl = app.findCollectionByNameOrId('backup_remocoes')
    const ID_DUPLICADO = 'vj4948a27d2c3r6'
    const ID_MANTER = 'p2uzssuigy41nyx'
    const MOTIVO_BKP = '0092_excluir_lancamento_duplicado_carne'

    // 1. Verificar se o registro duplicado existe
    let registroDuplicado
    try {
      registroDuplicado = app.findRecordById('lancamentos', ID_DUPLICADO)
    } catch (_) {
      console.log(`[0092] Lançamento ${ID_DUPLICADO} já não existe em 'lancamentos'.`)
      return
    }

    if (!registroDuplicado) {
      console.log(`[0092] Lançamento ${ID_DUPLICADO} não encontrado.`)
      return
    }

    // Validação de segurança: garantir que é de fato "Carne"
    const desc = registroDuplicado.getString('descricao') || ''
    const val = registroDuplicado.getFloat('valor')
    console.log(`[0092] Lançamento encontrado: ${ID_DUPLICADO} - "${desc}" (R$ ${val})`)

    // 2. Salvar BACKUP do registro antes de deletar
    try {
      const bkp = new Record(backupColl, {
        origem_colecao: 'lancamentos',
        registro_id: ID_DUPLICADO,
        motivo: MOTIVO_BKP,
        dados_json: JSON.stringify(registroDuplicado),
      })
      app.save(bkp)
      console.log(`[0092] Backup gravado com sucesso para ${ID_DUPLICADO} em 'backup_remocoes'.`)
    } catch (errBkp) {
      console.warn(`[0092] Aviso ao criar backup:`, errBkp)
    }

    // 3. Excluir o registro duplicado
    app.delete(registroDuplicado)
    console.log(
      `[0092] Lançamento duplicado ${ID_DUPLICADO} excluído com sucesso. Mantido ${ID_MANTER}.`,
    )
  },
  (app) => {
    // Reverter restaura o registro a partir de backup_remocoes se existir
    const ID_DUPLICADO = 'vj4948a27d2c3r6'
    const MOTIVO_BKP = '0092_excluir_lancamento_duplicado_carne'
    try {
      const bkps = app.findRecordsByFilter(
        'backup_remocoes',
        `registro_id = '${ID_DUPLICADO}' && motivo = '${MOTIVO_BKP}'`,
        '-created',
        1,
        0,
      )
      if (bkps && bkps.length > 0) {
        const dados = JSON.parse(bkps[0].getString('dados_json'))
        const lancColl = app.findCollectionByNameOrId('lancamentos')
        const rec = new Record(lancColl, dados)
        rec.set('id', ID_DUPLICADO)
        app.save(rec)
        console.log(`[0092 - Revert] Lançamento ${ID_DUPLICADO} restaurado com sucesso.`)
      }
    } catch (e) {
      console.warn(`[0092 - Revert] Não foi possível restaurar lançamento ${ID_DUPLICADO}:`, e)
    }
  },
)
