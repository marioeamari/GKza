migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const canWriteFinance = "@request.auth.id != '' && @request.auth.role != 'visualizador'"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    // 1. Criar collection config_calculos se não existir
    if (!app.hasTable('config_calculos')) {
      const configCalculos = new Collection({
        name: 'config_calculos',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: canWriteFinance,
        updateRule: canWriteFinance,
        deleteRule: adminOrManager,
        fields: [
          {
            name: 'tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['dizimo', 'oferta', 'primicias'],
          },
          { name: 'percentual', type: 'number', required: false, min: 0, max: 100 },
          { name: 'descricao', type: 'text', required: false, max: 300 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_config_calculos_tipo ON config_calculos (tipo)'],
      })
      app.save(configCalculos)
    }

    // 2. Adicionar campo 'direcionamento' nas collections despesas_compromisso e despesas_ocorrencias se não existirem
    const despesasCompromissos = app.findCollectionByNameOrId('despesas_compromisso')
    if (!despesasCompromissos.fields.getByName('direcionamento')) {
      despesasCompromissos.fields.add(
        new TextField({
          name: 'direcionamento',
          required: false,
          max: 200,
        }),
      )
      app.save(despesasCompromissos)
    }

    const despesasOcorrencias = app.findCollectionByNameOrId('despesas_ocorrencias')
    if (!despesasOcorrencias.fields.getByName('direcionamento')) {
      despesasOcorrencias.fields.add(
        new TextField({
          name: 'direcionamento',
          required: false,
          max: 200,
        }),
      )
      app.save(despesasOcorrencias)
    }

    // 3. Garantir tipos de dízimo padrão em tipos_dizimo: 'Dízimo', 'Oferta' e 'Primícias'
    const tiposDizimoCol = app.findCollectionByNameOrId('tipos_dizimo')

    function ensureTipoDizimo(nome, descricao, cor) {
      try {
        const found = app.findRecordsByFilter(
          'tipos_dizimo',
          `nome = '${nome}' || nome ~ '${nome}'`,
          '',
          1,
          0,
        )
        if (found.length === 0) {
          const rec = new Record(tiposDizimoCol)
          rec.set('nome', nome)
          rec.set('descricao', descricao)
          rec.set('cor', cor)
          rec.set('soma_resumo', true)
          app.save(rec)
          console.log(`Tipo de dízimo criado: ${nome}`)
        }
      } catch (err) {
        console.log(`Erro ao verificar tipo de dízimo ${nome}:`, err)
      }
    }

    ensureTipoDizimo('Dízimo', 'Dízimo bíblico regular', '#DF5830')
    ensureTipoDizimo('Oferta', 'Ofertas voluntárias e direcionadas', '#B7791F')
    ensureTipoDizimo('Primícias', 'Primícias / primeiros frutos (1/qtd de dias do mês)', '#1E6F5C')

    // 4. Seed inicial para config_calculos (dizimo: 10%, oferta: 10%, primicias: 0% / fórmula 1/n)
    const configCol = app.findCollectionByNameOrId('config_calculos')

    function ensureConfig(tipo, percentual, descricao) {
      try {
        const found = app.findRecordsByFilter('config_calculos', `tipo = '${tipo}'`, '', 1, 0)
        if (found.length === 0) {
          const rec = new Record(configCol)
          rec.set('tipo', tipo)
          rec.set('percentual', percentual)
          rec.set('descricao', descricao)
          app.save(rec)
          console.log(`Configuração de cálculo criada: ${tipo}`)
        }
      } catch (err) {
        console.log(`Erro ao verificar config_calculos ${tipo}:`, err)
      }
    }

    ensureConfig('dizimo', 10, 'Percentual sobre despesas marcadas como dízimo')
    ensureConfig('oferta', 10, 'Percentual sobre despesas marcadas como oferta')
    ensureConfig(
      'primicias',
      0,
      'Cálculo proporcional a 1 dia do mês (1 / qtd de dias do mês de referência)',
    )
  },
  (app) => {
    // Reversão
    try {
      const configCalculos = app.findCollectionByNameOrId('config_calculos')
      app.delete(configCalculos)
    } catch (_) {}

    try {
      const despesasComp = app.findCollectionByNameOrId('despesas_compromisso')
      const f1 = despesasComp.fields.getByName('direcionamento')
      if (f1) {
        despesasComp.fields.removeByName('direcionamento')
        app.save(despesasComp)
      }
    } catch (_) {}

    try {
      const despesasOcorr = app.findCollectionByNameOrId('despesas_ocorrencias')
      const f2 = despesasOcorr.fields.getByName('direcionamento')
      if (f2) {
        despesasOcorr.fields.removeByName('direcionamento')
        app.save(despesasOcorr)
      }
    } catch (_) {}
  },
)
