/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Verificar se a coleção já existe
    try {
      app.findCollectionByNameOrId('telegram_registros_pendentes')
      return
    } catch (_) {}

    const contasCol = app.findCollectionByNameOrId('contas')
    const categoriasCol = app.findCollectionByNameOrId('categorias')
    const empresasCol = app.findCollectionByNameOrId('empresas')
    const pessoasCol = app.findCollectionByNameOrId('pessoas')
    const lancamentosCol = app.findCollectionByNameOrId('lancamentos')

    const collection = new Collection({
      name: 'telegram_registros_pendentes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: '', // Público/webhook pode criar via SDK ou superuser/hook
      updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
      deleteRule: "@request.auth.role = 'admin' || @request.auth.role = 'gestor'",
      fields: [
        {
          name: 'descricao',
          type: 'text',
          required: true,
        },
        {
          name: 'valor',
          type: 'number',
          required: true,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['receita', 'despesa'],
          maxSelect: 1,
        },
        {
          name: 'data',
          type: 'date',
          required: true,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pendente', 'aprovado', 'descartado'],
          maxSelect: 1,
        },
        {
          name: 'conta',
          type: 'relation',
          collectionId: contasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'categoria',
          type: 'relation',
          collectionId: categoriasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'empresa',
          type: 'relation',
          collectionId: empresasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'pessoa',
          type: 'relation',
          collectionId: pessoasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'contexto_nome',
          type: 'text',
          required: false,
        },
        {
          name: 'telegram_chat_id',
          type: 'text',
          required: false,
        },
        {
          name: 'telegram_message_id',
          type: 'text',
          required: false,
        },
        {
          name: 'telegram_origem',
          type: 'text',
          required: false,
        },
        {
          name: 'comprovante_texto',
          type: 'text',
          required: false,
        },
        {
          name: 'observacoes',
          type: 'text',
          required: false,
        },
        {
          name: 'lancamento_gerado',
          type: 'relation',
          collectionId: lancamentosCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE INDEX idx_tel_reg_pend_status ON telegram_registros_pendentes (status)',
        'CREATE INDEX idx_tel_reg_pend_data ON telegram_registros_pendentes (data)',
        'CREATE INDEX idx_tel_reg_pend_chat ON telegram_registros_pendentes (telegram_chat_id)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('telegram_registros_pendentes')
      app.delete(col)
    } catch (_) {}
  },
)
