migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const canWriteFinance = "@request.auth.id != '' && @request.auth.role != 'visualizador'"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    // 1. Criar collection ofertas_voluntarias se não existir
    if (!app.hasTable('ofertas_voluntarias')) {
      const ofertasVoluntarias = new Collection({
        name: 'ofertas_voluntarias',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: canWriteFinance,
        updateRule: canWriteFinance,
        deleteRule: adminOrManager,
        fields: [
          { name: 'data', type: 'date', required: true },
          { name: 'valor', type: 'number', required: true, min: 0 },
          { name: 'direcionamento', type: 'text', required: false, max: 200 },
          { name: 'descricao', type: 'text', required: false, max: 500 },
          { name: 'recorrente', type: 'bool' },
          {
            name: 'dia_semana',
            type: 'select',
            required: false,
            maxSelect: 1,
            values: ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'],
          },
          { name: 'regra_id', type: 'text', required: false, max: 100 },
          {
            name: 'tipo',
            type: 'select',
            required: false,
            maxSelect: 1,
            values: ['voluntaria'],
          },
          { name: 'contexto_tipo', type: 'text', required: false, max: 50 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_ofertas_voluntarias_data ON ofertas_voluntarias (data)',
          'CREATE INDEX idx_ofertas_voluntarias_regra ON ofertas_voluntarias (regra_id)',
          'CREATE INDEX idx_ofertas_voluntarias_recorrente ON ofertas_voluntarias (recorrente)',
        ],
      })
      app.save(ofertasVoluntarias)
    }

    // 2. Criar collection caixa_ofertas se não existir
    if (!app.hasTable('caixa_ofertas')) {
      const ofertasCol = app.findCollectionByNameOrId('ofertas_voluntarias')
      const caixaOfertas = new Collection({
        name: 'caixa_ofertas',
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
            values: ['entrada', 'saida'],
          },
          { name: 'data', type: 'date', required: true },
          { name: 'valor', type: 'number', required: true, min: 0 },
          { name: 'descricao', type: 'text', required: false, max: 500 },
          { name: 'direcionamento', type: 'text', required: false, max: 200 },
          {
            name: 'referencia_oferta',
            type: 'relation',
            required: false,
            collectionId: ofertasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_caixa_ofertas_data ON caixa_ofertas (data)',
          'CREATE INDEX idx_caixa_ofertas_tipo ON caixa_ofertas (tipo)',
          'CREATE INDEX idx_caixa_ofertas_ref ON caixa_ofertas (referencia_oferta)',
        ],
      })
      app.save(caixaOfertas)
    }
  },
  (app) => {
    // Reversão
    try {
      const caixaOfertas = app.findCollectionByNameOrId('caixa_ofertas')
      app.delete(caixaOfertas)
    } catch (_) {}

    try {
      const ofertasVoluntarias = app.findCollectionByNameOrId('ofertas_voluntarias')
      app.delete(ofertasVoluntarias)
    } catch (_) {}
  },
)
