// Migração 0146 — Checklists diários por função (Módulo de Funcionários)
//
// Cria:
//   - funcionarios_funcoes               (funções/cargos para atribuição de checklists)
//   - funcionarios_checklists            (checklist com itens JSON, período e vínculo a funções)
//   - funcionarios_checklist_execucoes   (execução por funcionário+checklist+data, itens com horário)
// E adiciona o campo relation multi 'funcoes' em funcionarios (vínculo funcionário → funções).
//
// IDEMPOTENTE: cada coleção só é criada se ainda não existir; o campo 'funcoes' só é
// adicionado se ausente. SEM SEED: em base vazia nada além do schema é criado.

const obterOuCriar = (app, nome, construir) => {
  try {
    return app.findCollectionByNameOrId(nome)
  } catch (_) {
    const col = construir()
    app.save(col)
    return app.findCollectionByNameOrId(nome)
  }
}

migrate(
  (app) => {
    // 1. Funções
    const funcoesCol = obterOuCriar(
      app,
      'funcionarios_funcoes',
      () =>
        new Collection({
          name: 'funcionarios_funcoes',
          type: 'base',
          listRule: '',
          viewRule: '',
          createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
          updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
          deleteRule:
            "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
          fields: [
            { name: 'nome', type: 'text', required: true },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [],
        }),
    )
    const funcoesId = funcoesCol.id

    // 2. Checklists (itens = JSON array de { texto }; vínculo multi a funções)
    const checklistsCol = obterOuCriar(
      app,
      'funcionarios_checklists',
      () =>
        new Collection({
          name: 'funcionarios_checklists',
          type: 'base',
          listRule: '',
          viewRule: '',
          createRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
          updateRule: "@request.auth.id != '' && @request.auth.role != 'visualizador'",
          deleteRule:
            "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'gestor')",
          fields: [
            { name: 'nome', type: 'text', required: true },
            {
              name: 'periodo',
              type: 'select',
              required: true,
              values: ['manha', 'tarde', 'diario', 'semanal', 'mensal'],
              maxSelect: 1,
            },
            { name: 'dia_semana', type: 'number', onlyInt: true, min: 0, max: 6 },
            { name: 'dia_mes', type: 'number', onlyInt: true, min: 1, max: 31 },
            { name: 'itens', type: 'json' },
            {
              name: 'funcoes',
              type: 'relation',
              required: true,
              collectionId: funcoesId,
              cascadeDelete: false,
              maxSelect: 99,
            },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [],
        }),
    )
    const checklistsId = checklistsCol.id

    // 3. Execuções (idempotentes: uma por funcionário + checklist + data)
    const funcCol = app.findCollectionByNameOrId('funcionarios')
    obterOuCriar(
      app,
      'funcionarios_checklist_execucoes',
      () =>
        new Collection({
          name: 'funcionarios_checklist_execucoes',
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
              collectionId: funcCol.id,
              cascadeDelete: true,
              maxSelect: 1,
            },
            {
              name: 'checklist',
              type: 'relation',
              required: true,
              collectionId: checklistsId,
              cascadeDelete: true,
              maxSelect: 1,
            },
            { name: 'data', type: 'date', required: true },
            { name: 'itens', type: 'json' },
            { name: 'observacao', type: 'text' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [],
        }),
    )

    // 4. Vínculo funcionário → funções (relation multi) em funcionarios
    if (!funcCol.fields.getByName('funcoes')) {
      funcCol.fields.add(
        new RelationField({
          name: 'funcoes',
          required: false,
          collectionId: funcoesId,
          cascadeDelete: false,
          maxSelect: 99,
        }),
      )
      app.save(funcCol)
    }
  },
  (app) => {
    try {
      const funcCol = app.findCollectionByNameOrId('funcionarios')
      const field = funcCol.fields.getByName('funcoes')
      if (field) {
        funcCol.fields.removeById(field.id)
        app.save(funcCol)
      }
    } catch (_) {}

    try {
      app.delete(app.findCollectionByNameOrId('funcionarios_checklist_execucoes'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('funcionarios_checklists'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('funcionarios_funcoes'))
    } catch (_) {}
  },
)
