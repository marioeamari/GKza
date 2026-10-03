/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const canWrite = "@request.auth.id != '' && @request.auth.role != 'visualizador'"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    const empresas = app.findCollectionByNameOrId('empresas')
    const pessoas = app.findCollectionByNameOrId('pessoas')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    try {
      app.findCollectionByNameOrId('lembretes_rapidos')
    } catch (_) {
      const lembretes = new Collection({
        name: 'lembretes_rapidos',
        type: 'base',
        listRule: authenticated,
        viewRule: authenticated,
        createRule: canWrite,
        updateRule: canWrite,
        deleteRule: adminOrManager,
        fields: [
          { name: 'titulo', type: 'text', required: true, max: 250 },
          { name: 'detalhe', type: 'text', required: false, max: 2000 },
          {
            name: 'contexto_tipo',
            type: 'select',
            required: false,
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
          { name: 'contexto_nome', type: 'text', required: false, max: 150 },
          { name: 'data_limite', type: 'date', required: true },
          { name: 'hora_limite', type: 'text', required: false, max: 10 },
          {
            name: 'prioridade',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['normal', 'urgente'],
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pendente', 'concluido'],
          },
          { name: 'repetir_ate_concluir', type: 'bool', required: false },
          { name: 'concluido_em', type: 'date', required: false },
          { name: 'origem', type: 'text', required: false, max: 50 },
          {
            name: 'usuario',
            type: 'relation',
            required: false,
            collectionId: users.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_lemb_rap_status ON lembretes_rapidos (status)',
          'CREATE INDEX idx_lemb_rap_data ON lembretes_rapidos (data_limite)',
          'CREATE INDEX idx_lemb_rap_prioridade ON lembretes_rapidos (prioridade)',
          'CREATE INDEX idx_lemb_rap_ctx ON lembretes_rapidos (contexto_tipo)',
          'CREATE INDEX idx_lemb_rap_pessoa ON lembretes_rapidos (pessoa)',
          'CREATE INDEX idx_lemb_rap_empresa ON lembretes_rapidos (empresa)',
          'CREATE INDEX idx_lemb_rap_user ON lembretes_rapidos (usuario)',
        ],
      })
      app.save(lembretes)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('lembretes_rapidos')
      app.delete(col)
    } catch (_) {}
  },
)
