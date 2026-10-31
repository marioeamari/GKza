migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('funcionarios_folhas')

    if (!col.fields.getByName('notificacao_pagamento_enviada')) {
      col.fields.add(
        new BoolField({
          name: 'notificacao_pagamento_enviada',
        }),
      )
    }

    if (!col.fields.getByName('notificacao_pagamento_em')) {
      col.fields.add(
        new DateField({
          name: 'notificacao_pagamento_em',
        }),
      )
    }

    if (!col.fields.getByName('status_conferencia_colaborador')) {
      col.fields.add(
        new SelectField({
          name: 'status_conferencia_colaborador',
          values: ['pendente', 'confirmado', 'divergente'],
          maxSelect: 1,
        }),
      )
    }

    if (!col.fields.getByName('conferido_colaborador_em')) {
      col.fields.add(
        new DateField({
          name: 'conferido_colaborador_em',
        }),
      )
    }

    if (!col.fields.getByName('motivo_divergencia_colaborador')) {
      col.fields.add(
        new TextField({
          name: 'motivo_divergencia_colaborador',
        }),
      )
    }

    if (!col.fields.getByName('dias_pendentes_fechamento')) {
      col.fields.add(
        new JSONField({
          name: 'dias_pendentes_fechamento',
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('funcionarios_folhas')

    const f1 = col.fields.getByName('notificacao_pagamento_enviada')
    if (f1) col.fields.remove(f1)

    const f2 = col.fields.getByName('notificacao_pagamento_em')
    if (f2) col.fields.remove(f2)

    const f3 = col.fields.getByName('status_conferencia_colaborador')
    if (f3) col.fields.remove(f3)

    const f4 = col.fields.getByName('conferido_colaborador_em')
    if (f4) col.fields.remove(f4)

    const f5 = col.fields.getByName('motivo_divergencia_colaborador')
    if (f5) col.fields.remove(f5)

    const f6 = col.fields.getByName('dias_pendentes_fechamento')
    if (f6) col.fields.remove(f6)

    app.save(col)
  },
)
