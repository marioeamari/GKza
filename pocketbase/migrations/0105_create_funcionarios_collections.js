migrate(
  (app) => {
    // 1. Coleção 'funcionarios'
    const funcionariosCol = new Collection({
      name: 'funcionarios',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: '',
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'cargo', type: 'text' },
        { name: 'valor_hora', type: 'number', required: true, min: 0 },
        { name: 'salario_base', type: 'number', min: 0 },
        { name: 'dias_mes', type: 'number', min: 1 },
        { name: 'horas_dia', type: 'number', min: 1 },
        { name: 'hora_almoco_conta', type: 'bool' },
        {
          name: 'ciclo_pagamento',
          type: 'select',
          required: true,
          values: ['semanal', 'quinzenal', 'mensal', 'personalizado'],
          maxSelect: 1,
        },
        { name: 'pix', type: 'text' },
        { name: 'telefone', type: 'text' },
        { name: 'ativo', type: 'bool' },
        { name: 'token_sessao', type: 'text' },
        { name: 'pin', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_func_nome ON funcionarios (nome)',
        'CREATE INDEX idx_func_ativo ON funcionarios (ativo)',
        'CREATE INDEX idx_func_token_sessao ON funcionarios (token_sessao)',
      ],
    })
    app.save(funcionariosCol)

    const funcId = app.findCollectionByNameOrId('funcionarios').id

    // 2. Coleção 'funcionarios_dividas'
    const dividasCol = new Collection({
      name: 'funcionarios_dividas',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        {
          name: 'funcionario',
          type: 'relation',
          required: true,
          collectionId: funcId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'descricao', type: 'text', required: true },
        { name: 'valor_total', type: 'number', required: true, min: 0 },
        { name: 'saldo_atual', type: 'number', required: true, min: 0 },
        { name: 'percentual_abatimento', type: 'number', required: true, min: 0, max: 100 },
        { name: 'ativa', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_fdiv_func ON funcionarios_dividas (funcionario)',
        'CREATE INDEX idx_fdiv_ativa ON funcionarios_dividas (ativa)',
      ],
    })
    app.save(dividasCol)

    // 3. Coleção 'funcionarios_estacoes'
    const estacoesCol = new Collection({
      name: 'funcionarios_estacoes',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'token', type: 'text', required: true },
        { name: 'ativa', type: 'bool' },
        { name: 'local_descricao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_fest_token ON funcionarios_estacoes (token)',
        'CREATE INDEX idx_fest_ativa ON funcionarios_estacoes (ativa)',
      ],
    })
    app.save(estacoesCol)

    // 4. Coleção 'funcionarios_pontos'
    const pontosCol = new Collection({
      name: 'funcionarios_pontos',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        {
          name: 'funcionario',
          type: 'relation',
          required: true,
          collectionId: funcId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'data', type: 'date', required: true },
        { name: 'entrada', type: 'text', required: true },
        { name: 'saida', type: 'text' },
        { name: 'pausas', type: 'json' },
        {
          name: 'origem',
          type: 'select',
          required: true,
          values: ['estacao_qr', 'fora_do_local', 'manual', 'admin'],
          maxSelect: 1,
        },
        { name: 'estacao', type: 'text' },
        { name: 'local_aproximado', type: 'text' },
        { name: 'editado_por', type: 'text' },
        { name: 'observacao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_fponto_func ON funcionarios_pontos (funcionario)',
        'CREATE INDEX idx_fponto_data ON funcionarios_pontos (data)',
        'CREATE INDEX idx_fponto_origem ON funcionarios_pontos (origem)',
      ],
    })
    app.save(pontosCol)

    // 5. Coleção 'funcionarios_folhas'
    const folhasCol = new Collection({
      name: 'funcionarios_folhas',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
      fields: [
        {
          name: 'funcionario',
          type: 'relation',
          required: true,
          collectionId: funcId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'periodo_inicio', type: 'date', required: true },
        { name: 'periodo_fim', type: 'date', required: true },
        { name: 'ganho_total', type: 'number', required: true },
        { name: 'descontos', type: 'json' },
        { name: 'divida_semanal', type: 'number', required: true },
        { name: 'a_receber', type: 'number', required: true },
        { name: 'quitada', type: 'bool' },
        { name: 'data_quitacao', type: 'date' },
        { name: 'lancamento_id', type: 'text' },
        { name: 'observacoes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_ffolha_func ON funcionarios_folhas (funcionario)',
        'CREATE INDEX idx_ffolha_periodo ON funcionarios_folhas (periodo_inicio, periodo_fim)',
        'CREATE INDEX idx_ffolha_quitada ON funcionarios_folhas (quitada)',
      ],
    })
    app.save(folhasCol)

    // Criar uma estação inicial padrão caso ainda não exista nenhuma
    try {
      const estacaoPadrao = new Record(estacoesCol)
      estacaoPadrao.set('nome', 'Sede GKza - Entrada')
      estacaoPadrao.set('token', 'gkza-estacao-principal')
      estacaoPadrao.set('ativa', true)
      estacaoPadrao.set('local_descricao', 'Painel na recepção / entrada')
      app.save(estacaoPadrao)
    } catch (_) {}
  },
  (app) => {
    try {
      const folhasCol = app.findCollectionByNameOrId('funcionarios_folhas')
      app.delete(folhasCol)
    } catch (_) {}

    try {
      const pontosCol = app.findCollectionByNameOrId('funcionarios_pontos')
      app.delete(pontosCol)
    } catch (_) {}

    try {
      const estacoesCol = app.findCollectionByNameOrId('funcionarios_estacoes')
      app.delete(estacoesCol)
    } catch (_) {}

    try {
      const dividasCol = app.findCollectionByNameOrId('funcionarios_dividas')
      app.delete(dividasCol)
    } catch (_) {}

    try {
      const funcCol = app.findCollectionByNameOrId('funcionarios')
      app.delete(funcCol)
    } catch (_) {}
  },
)
