migrate(
  (app) => {
    const compromissos = app.findCollectionByNameOrId('despesas_compromisso')
    const ocorrencias = app.findCollectionByNameOrId('despesas_ocorrencias')
    const pessoas = app.findCollectionByNameOrId('pessoas')
    const empresas = app.findCollectionByNameOrId('empresas')

    // 1. Campos em despesas_compromisso
    // titular_tipo: 'cpf' ou 'cnpj'
    if (!compromissos.fields.getByName('titular_tipo')) {
      compromissos.fields.add(
        new SelectField({
          name: 'titular_tipo',
          required: false,
          maxSelect: 1,
          values: ['cpf', 'cnpj'],
        }),
      )
    }

    // titular_pessoa: relation -> pessoas
    if (!compromissos.fields.getByName('titular_pessoa')) {
      compromissos.fields.add(
        new RelationField({
          name: 'titular_pessoa',
          required: false,
          collectionId: pessoas.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    // titular_empresa: relation -> empresas
    if (!compromissos.fields.getByName('titular_empresa')) {
      compromissos.fields.add(
        new RelationField({
          name: 'titular_empresa',
          required: false,
          collectionId: empresas.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    // tipo_valor: 'fixo' ou 'variavel'
    if (!compromissos.fields.getByName('tipo_valor')) {
      compromissos.fields.add(
        new SelectField({
          name: 'tipo_valor',
          required: false,
          maxSelect: 1,
          values: ['fixo', 'variavel'],
        }),
      )
    }

    // modalidade_parcelamento: 'a_vista' ou 'parcelado'
    if (!compromissos.fields.getByName('modalidade_parcelamento')) {
      compromissos.fields.add(
        new SelectField({
          name: 'modalidade_parcelamento',
          required: false,
          maxSelect: 1,
          values: ['a_vista', 'parcelado'],
        }),
      )
    }

    // valor_parcela: number (para parcelamentos claros)
    if (!compromissos.fields.getByName('valor_parcela')) {
      compromissos.fields.add(
        new NumberField({
          name: 'valor_parcela',
          required: false,
          min: 0,
        }),
      )
    }

    // data_fim_calculada: date
    if (!compromissos.fields.getByName('data_fim_calculada')) {
      compromissos.fields.add(
        new DateField({
          name: 'data_fim_calculada',
          required: false,
        }),
      )
    }

    // flag para sinalizar registros antigos que necessitam de revisão
    if (!compromissos.fields.getByName('precisa_revisao')) {
      compromissos.fields.add(
        new BoolField({
          name: 'precisa_revisao',
          required: false,
        }),
      )
    }

    // motivo da revisão / migração
    if (!compromissos.fields.getByName('motivo_revisao')) {
      compromissos.fields.add(
        new TextField({
          name: 'motivo_revisao',
          required: false,
          max: 500,
        }),
      )
    }

    app.save(compromissos)

    // 2. Campos em despesas_ocorrencias (para registrar se valor foi ajustado e titular da despesa na ocorrência)
    if (!ocorrencias.fields.getByName('valor_estimado_original')) {
      ocorrencias.fields.add(
        new NumberField({
          name: 'valor_estimado_original',
          required: false,
          min: 0,
        }),
      )
    }

    if (!ocorrencias.fields.getByName('valor_ajustado_manualmente')) {
      ocorrencias.fields.add(
        new BoolField({
          name: 'valor_ajustado_manualmente',
          required: false,
        }),
      )
    }

    app.save(ocorrencias)

    // 3. Migração dos dados existentes em despesas_compromisso:
    // Analisar os registros existentes e preencher titular_tipo, titular_pessoa, titular_empresa,
    // tipo_valor, modalidade_parcelamento com segurança e sem perda.
    const allCompromissos = app.findRecordsByFilter('despesas_compromisso', '', 'created', 200, 0)
    for (let i = 0; i < allCompromissos.length; i++) {
      const rec = allCompromissos[i]

      // Determinar titular:
      if (rec.getString('empresa')) {
        rec.set('titular_tipo', 'cnpj')
        rec.set('titular_empresa', rec.getString('empresa'))
      } else if (rec.getString('pessoa')) {
        rec.set('titular_tipo', 'cpf')
        rec.set('titular_pessoa', rec.getString('pessoa'))
      } else {
        // Se contexto_tipo for pessoal mas pessoa estiver vazia, tenta achar primeira pessoa ou deixa 'cpf'
        rec.set('titular_tipo', 'cpf')
      }

      // Analisar regra de repetição e parcelamento
      const rep = rec.getString('regra_repeticao')
      if (rep === 'parcelado') {
        rec.set('modalidade_parcelamento', 'parcelado')
        const total = rec.getInt('total_parcelas') || 1
        const valEst = rec.getFloat('valor_estimado') || 0
        rec.set('valor_parcela', valEst)
        rec.set('tipo_valor', 'fixo')

        // Calcular data fim aproximada se tiver data_inicio
        const dtInicioStr = rec.getString('data_inicio')
        if (dtInicioStr) {
          try {
            const dt = new Date(dtInicioStr)
            const dEnd = new Date(
              Date.UTC(
                dt.getUTCFullYear(),
                dt.getUTCMonth() + total - 1,
                dt.getUTCDate() || 10,
                12,
                0,
                0,
              ),
            )
            rec.set('data_fim_calculada', dEnd.toISOString())
          } catch (_) {}
        }
      } else if (rep === 'avulso') {
        rec.set('modalidade_parcelamento', 'a_vista')
        rec.set('tipo_valor', 'fixo')
      } else {
        // mensal ou anual
        rec.set('modalidade_parcelamento', 'a_vista')
        // Verificar se tipo_despesa aponta para 'fixa_variavel' ou 'variavel'
        const tipoDespId = rec.getString('tipo_despesa')
        let isVar = false
        if (tipoDespId) {
          try {
            const td = app.findFirstRecordByData('tipos_despesa', 'id', tipoDespId)
            const cod = td.getString('codigo')
            if (cod === 'fixa_variavel' || cod === 'variavel') {
              isVar = true
            }
          } catch (_) {}
        }
        rec.set('tipo_valor', isVar ? 'variavel' : 'fixo')
      }

      app.save(rec)
    }
  },
  (app) => {
    // Reverter campos se necessário
    const compromissos = app.findCollectionByNameOrId('despesas_compromisso')
    const fieldsToDrop = [
      'titular_tipo',
      'titular_pessoa',
      'titular_empresa',
      'tipo_valor',
      'modalidade_parcelamento',
      'valor_parcela',
      'data_fim_calculada',
      'precisa_revisao',
      'motivo_revisao',
    ]
    for (let i = 0; i < fieldsToDrop.length; i++) {
      try {
        compromissos.fields.removeByName(fieldsToDrop[i])
      } catch (_) {}
    }
    app.save(compromissos)

    const ocorrencias = app.findCollectionByNameOrId('despesas_ocorrencias')
    try {
      ocorrencias.fields.removeByName('valor_estimado_original')
      ocorrencias.fields.removeByName('valor_ajustado_manualmente')
      app.save(ocorrencias)
    } catch (_) {}
  },
)
