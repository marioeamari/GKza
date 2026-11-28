/**
 * 0154 — Fecha regras de acesso públicas (ETAPA 1 — segurança).
 *
 * REGRAS NOVAS:
 *  - funcionarios e funcionarios_*: list/view = usuário autenticado;
 *    create/update = autenticado e não visualizador; delete = admin ou gestor.
 *    A conferência anônima de funcionarios_folhas (mig 0152) foi removida: a conferência
 *    do colaborador passa pela rota /backend/v1/ponto/* (hook ponto_api.js).
 *  - telegram_sessions: todas as regras = null (só superusuário; hooks usam $app).
 *  - telegram_registros_pendentes: createRule = autenticado.
 *  - users: createRule = null (usuários criados só pelo admin em Configurações > Usuários).
 *  - prec_*: deleteRule = admin ou gestor (desfaz a abertura da mig 0048).
 *
 * Rollback NÃO reabre acesso público (decisão de segurança).
 */
const AUTH_LEITURA = "@request.auth.id != ''"
const AUTH_EDICAO = "@request.auth.id != '' && @request.auth.role != 'visualizador'"
const ADMIN_GESTOR = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

migrate(
  (app) => {
    const todas = app.findAllCollections()
    for (const col of todas) {
      const nome = col.name

      if (nome === 'funcionarios' || nome.indexOf('funcionarios_') === 0) {
        col.listRule = AUTH_LEITURA
        col.viewRule = AUTH_LEITURA
        col.createRule = AUTH_EDICAO
        col.updateRule = AUTH_EDICAO
        col.deleteRule = ADMIN_GESTOR
        app.save(col)
        continue
      }

      if (nome === 'telegram_sessions') {
        col.listRule = null
        col.viewRule = null
        col.createRule = null
        col.updateRule = null
        col.deleteRule = null
        app.save(col)
        continue
      }

      if (nome === 'telegram_registros_pendentes') {
        col.createRule = AUTH_LEITURA
        app.save(col)
        continue
      }

      if (nome === 'users') {
        col.createRule = null
        app.save(col)
        continue
      }

      if (nome.indexOf('prec_') === 0) {
        col.deleteRule = ADMIN_GESTOR
        app.save(col)
      }
    }
  },
  (app) => {
    // Rollback intencionalmente não reabre acesso público.
  },
)
