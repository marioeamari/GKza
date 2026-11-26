// Migração 0153 — coleção prec_triagem_grupos (grupos manuais da Triagem de
// Produtos, /precificacao/triagem): um registro por grupo com `titulo`
// (opcional), `ordem` (posição na grade) e `membros` (JSON array de ids de
// prec_produtos NA ORDEM; o PRIMEIRO é o card da frente da pilha).
migrate(
  (app) => {
    // findCollectionByNameOrId LANÇA "sql: no rows in result set" quando a
    // coleção não existe (nunca devolve null) — a guarda tem de capturar.
    let existente = null
    try {
      existente = app.findCollectionByNameOrId('prec_triagem_grupos')
    } catch (_e) {
      existente = null
    }
    if (existente) return // idempotente: rodar duas vezes não quebra

    const auth = "@request.auth.id != ''"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    const col = new Collection({
      name: 'prec_triagem_grupos',
      type: 'base',
      listRule: auth,
      viewRule: auth,
      createRule: auth,
      updateRule: auth,
      deleteRule: adminOrManager,
      fields: [
        { name: 'titulo', type: 'text', required: false, max: 120 },
        { name: 'ordem', type: 'number', required: false },
        { name: 'membros', type: 'json', required: false, maxSize: 200000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_prec_triagem_grupos_ordem ON prec_triagem_grupos (ordem)'],
    })
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('prec_triagem_grupos')
      app.delete(col)
    } catch (_e) {
      // coleção já não existe — down idempotente
    }
  },
)
