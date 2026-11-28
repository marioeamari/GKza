/**
 * 0155 — Campos de segurança do PIN do colaborador (ETAPA 1 — segurança).
 *
 * Adiciona à coleção `funcionarios`:
 *  - pin_tentativas (number, default 0): erros de PIN seguidos (contador zerado a cada acerto);
 *  - pin_bloqueio_ate (date, opcional): quando no futuro, novas tentativas de login por PIN
 *    são recusadas pelo hook ponto_api.js até esse instante (5 erros seguidos = 15 min).
 *
 * Não altera nenhuma outra coleção nem regra de acesso.
 * Rollback: remove os dois campos (valores descartados — só estado transitório).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('funcionarios')

    if (!col.fields.getByName('pin_tentativas')) {
      col.fields.add(
        new NumberField({
          name: 'pin_tentativas',
          required: false,
          onlyInt: true,
          min: 0,
        }),
      )
      col.addIndex('idx_func_pin_tentativas', false, 'pin_tentativas', '')
    }

    if (!col.fields.getByName('pin_bloqueio_ate')) {
      col.fields.add(
        new DateField({
          name: 'pin_bloqueio_ate',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('funcionarios')
    try {
      col.removeIndex('idx_func_pin_tentativas')
    } catch (_) {}
    const t = col.fields.getByName('pin_tentativas')
    if (t) col.fields.removeById(t.id)
    const b = col.fields.getByName('pin_bloqueio_ate')
    if (b) col.fields.removeById(b.id)
    app.save(col)
  },
)
