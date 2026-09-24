/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const canWrite = "@request.auth.id != '' && @request.auth.role != 'visualizador'"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    const empresas = app.findCollectionByNameOrId('empresas')
    const pessoas = app.findCollectionByNameOrId('pessoas')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Coleção metas_habitos
    try {
      app.findCollectionByNameOrId('metas_habitos')
    } catch (_) {
      const habitos = new Collection({
        name: 'metas_habitos',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: canWrite,
        updateRule: canWrite,
        deleteRule: adminOrManager,
        fields: [
          { name: 'nome', type: 'text', required: true, max: 200 },
          { name: 'descricao', type: 'text', required: false, max: 2000 },
          {
            name: 'contexto_tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pessoal', 'empresa'],
          },
          {
            name: 'pessoa',
            type: 'relation',
            required: false,
            collectionId: pessoas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'empresa',
            type: 'relation',
            required: false,
            collectionId: empresas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          // Dias da semana: JSON array de números [0, 1, 2, 3, 4, 5, 6] (0 = Domingo)
          { name: 'dias_semana', type: 'json', required: false },
          // Horário opcional no formato "HH:mm"
          { name: 'horario', type: 'text', required: false, max: 10 },
          // Data de início do hábito YYYY-MM-DD
          { name: 'data_inicio', type: 'date', required: true },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'cor', type: 'text', required: false, max: 30 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_metas_habitos_ctx ON metas_habitos (contexto_tipo)',
          'CREATE INDEX idx_metas_habitos_pessoa ON metas_habitos (pessoa)',
          'CREATE INDEX idx_metas_habitos_empresa ON metas_habitos (empresa)',
          'CREATE INDEX idx_metas_habitos_ativo ON metas_habitos (ativo)',
        ],
      })
      app.save(habitos)
    }

    const habitosCol = app.findCollectionByNameOrId('metas_habitos')

    // 2. Coleção metas_habitos_registros (histórico imutável de cumprimento por data)
    try {
      app.findCollectionByNameOrId('metas_habitos_registros')
    } catch (_) {
      const registros = new Collection({
        name: 'metas_habitos_registros',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: canWrite,
        updateRule: canWrite,
        deleteRule: adminOrManager,
        fields: [
          {
            name: 'habito',
            type: 'relation',
            required: true,
            collectionId: habitosCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          // Data da execução: YYYY-MM-DD
          { name: 'data', type: 'text', required: true, max: 10 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['feito', 'nao_feito', 'dispensado'],
          },
          { name: 'observacao', type: 'text', required: false, max: 1000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_metas_hab_reg_hab_data ON metas_habitos_registros (habito, data)',
          'CREATE INDEX idx_metas_hab_reg_data ON metas_habitos_registros (data)',
          'CREATE INDEX idx_metas_hab_reg_status ON metas_habitos_registros (status)',
        ],
      })
      app.save(registros)
    }

    // 3. Coleção agenda_eventos
    try {
      app.findCollectionByNameOrId('agenda_eventos')
    } catch (_) {
      const agenda = new Collection({
        name: 'agenda_eventos',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: canWrite,
        updateRule: canWrite,
        deleteRule: adminOrManager,
        fields: [
          { name: 'titulo', type: 'text', required: true, max: 250 },
          { name: 'descricao', type: 'text', required: false, max: 3000 },
          {
            name: 'contexto_tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pessoal', 'empresa'],
          },
          {
            name: 'pessoa',
            type: 'relation',
            required: false,
            collectionId: pessoas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'empresa',
            type: 'relation',
            required: false,
            collectionId: empresas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'data_inicio', type: 'date', required: true },
          { name: 'data_fim', type: 'date', required: false },
          { name: 'dia_inteiro', type: 'bool', required: false },
          { name: 'local', type: 'text', required: false, max: 300 },
          {
            name: 'recorrencia',
            type: 'select',
            required: false,
            maxSelect: 1,
            values: ['nenhuma', 'diaria', 'semanal', 'mensal', 'anual'],
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['ativo', 'cancelado', 'concluido'],
          },
          {
            name: 'origem',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['sistema', 'google'],
          },
          { name: 'google_event_id', type: 'text', required: false, max: 255 },
          { name: 'cor', type: 'text', required: false, max: 30 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_agenda_eventos_inicio ON agenda_eventos (data_inicio)',
          'CREATE INDEX idx_agenda_eventos_ctx ON agenda_eventos (contexto_tipo)',
          'CREATE INDEX idx_agenda_eventos_pessoa ON agenda_eventos (pessoa)',
          'CREATE INDEX idx_agenda_eventos_empresa ON agenda_eventos (empresa)',
          'CREATE INDEX idx_agenda_eventos_google_id ON agenda_eventos (google_event_id)',
          'CREATE INDEX idx_agenda_eventos_status ON agenda_eventos (status)',
        ],
      })
      app.save(agenda)
    }

    // 4. Coleção projetos
    try {
      app.findCollectionByNameOrId('projetos')
    } catch (_) {
      const projetos = new Collection({
        name: 'projetos',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: canWrite,
        updateRule: canWrite,
        deleteRule: adminOrManager,
        fields: [
          { name: 'nome', type: 'text', required: true, max: 200 },
          { name: 'objetivo', type: 'text', required: false, max: 1000 },
          { name: 'descricao', type: 'text', required: false, max: 4000 },
          {
            name: 'contexto_tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pessoal', 'empresa'],
          },
          {
            name: 'pessoa',
            type: 'relation',
            required: false,
            collectionId: pessoas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'empresa',
            type: 'relation',
            required: false,
            collectionId: empresas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'prazo', type: 'date', required: false },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['planejamento', 'em_andamento', 'concluido', 'pausado', 'cancelado'],
          },
          { name: 'cor', type: 'text', required: false, max: 30 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_projetos_ctx ON projetos (contexto_tipo)',
          'CREATE INDEX idx_projetos_status ON projetos (status)',
          'CREATE INDEX idx_projetos_prazo ON projetos (prazo)',
        ],
      })
      app.save(projetos)
    }

    const projetosCol = app.findCollectionByNameOrId('projetos')

    // 5. Coleção tarefas
    try {
      app.findCollectionByNameOrId('tarefas')
    } catch (_) {
      const tarefas = new Collection({
        name: 'tarefas',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: canWrite,
        updateRule: canWrite,
        deleteRule: adminOrManager,
        fields: [
          { name: 'titulo', type: 'text', required: true, max: 250 },
          { name: 'descricao', type: 'text', required: false, max: 3000 },
          {
            name: 'projeto',
            type: 'relation',
            required: false,
            collectionId: projetosCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'responsavel',
            type: 'relation',
            required: false,
            collectionId: users.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'etapa',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['a_fazer', 'em_progresso', 'concluida'],
          },
          {
            name: 'prioridade',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['baixa', 'media', 'alta', 'urgente'],
          },
          {
            name: 'contexto_tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pessoal', 'empresa'],
          },
          {
            name: 'pessoa',
            type: 'relation',
            required: false,
            collectionId: pessoas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'empresa',
            type: 'relation',
            required: false,
            collectionId: empresas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'prazo', type: 'date', required: false },
          // Checklist: array JSON [{ id: string, texto: string, feito: boolean }]
          { name: 'checklist', type: 'json', required: false },
          { name: 'ordem', type: 'number', required: false, onlyInt: true },
          // Vínculo opcional caso o usuário tenha agendado na agenda
          {
            name: 'evento_agenda',
            type: 'relation',
            required: false,
            collectionId: app.findCollectionByNameOrId('agenda_eventos').id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_tarefas_projeto ON tarefas (projeto)',
          'CREATE INDEX idx_tarefas_etapa ON tarefas (etapa)',
          'CREATE INDEX idx_tarefas_prioridade ON tarefas (prioridade)',
          'CREATE INDEX idx_tarefas_responsavel ON tarefas (responsavel)',
          'CREATE INDEX idx_tarefas_prazo ON tarefas (prazo)',
          'CREATE INDEX idx_tarefas_ctx ON tarefas (contexto_tipo)',
        ],
      })
      app.save(tarefas)
    }

    // 6. Coleção metas_metas
    try {
      app.findCollectionByNameOrId('metas_metas')
    } catch (_) {
      const metas = new Collection({
        name: 'metas_metas',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: canWrite,
        updateRule: canWrite,
        deleteRule: adminOrManager,
        fields: [
          { name: 'titulo', type: 'text', required: true, max: 250 },
          { name: 'descricao', type: 'text', required: false, max: 2000 },
          {
            name: 'contexto_tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pessoal', 'empresa'],
          },
          {
            name: 'pessoa',
            type: 'relation',
            required: false,
            collectionId: pessoas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'empresa',
            type: 'relation',
            required: false,
            collectionId: empresas.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'prazo', type: 'date', required: false },
          {
            name: 'tipo_progresso',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['manual', 'tarefas'],
          },
          // Se manual: 0 a 100 (%) ou valor atual
          { name: 'progresso_manual', type: 'number', required: false, min: 0, max: 100 },
          { name: 'alvo_descricao', type: 'text', required: false, max: 200 },
          // Vínculo opcional com projeto
          {
            name: 'projeto',
            type: 'relation',
            required: false,
            collectionId: projetosCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          // Lista de tarefas vinculadas (se aplicável para cálculo)
          {
            name: 'tarefas',
            type: 'relation',
            required: false,
            collectionId: app.findCollectionByNameOrId('tarefas').id,
            cascadeDelete: false,
            maxSelect: 50,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['em_andamento', 'atingida', 'cancelada'],
          },
          { name: 'cor', type: 'text', required: false, max: 30 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_metas_metas_ctx ON metas_metas (contexto_tipo)',
          'CREATE INDEX idx_metas_metas_status ON metas_metas (status)',
          'CREATE INDEX idx_metas_metas_tipo_progresso ON metas_metas (tipo_progresso)',
          'CREATE INDEX idx_metas_metas_prazo ON metas_metas (prazo)',
        ],
      })
      app.save(metas)
    }

    // 7. Coleção google_calendar_config (armazena tokens de sincronização do usuário de forma segura)
    try {
      app.findCollectionByNameOrId('google_calendar_config')
    } catch (_) {
      const gcal = new Collection({
        name: 'google_calendar_config',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: canWrite,
        updateRule: canWrite,
        deleteRule: adminOrManager,
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            collectionId: users.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'email_conectado', type: 'text', required: false, max: 255 },
          { name: 'access_token', type: 'text', required: false, max: 2000 },
          { name: 'refresh_token', type: 'text', required: false, max: 2000 },
          { name: 'token_expiry', type: 'date', required: false },
          { name: 'calendar_id', type: 'text', required: false, max: 255 },
          { name: 'sync_ativo', type: 'bool', required: false },
          { name: 'last_sync_at', type: 'date', required: false },
          { name: 'last_error', type: 'text', required: false, max: 1000 },
          { name: 'sync_token', type: 'text', required: false, max: 500 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_google_cal_user ON google_calendar_config (user)',
          'CREATE INDEX idx_google_cal_sync ON google_calendar_config (sync_ativo)',
        ],
      })
      app.save(gcal)
    }
  },
  (app) => {
    const collections = [
      'google_calendar_config',
      'metas_metas',
      'tarefas',
      'projetos',
      'agenda_eventos',
      'metas_habitos_registros',
      'metas_habitos',
    ]
    for (let i = 0; i < collections.length; i++) {
      try {
        app.delete(app.findCollectionByNameOrId(collections[i]))
      } catch (_) {}
    }
  },
)
