/**
 * 0152 — Corrige o 404 na confirmação/apontamento de pagamento pelo colaborador
 * (tela de Ponto Eletrônico, faixa "Pagamento realizado pelo administrador!").
 *
 * CAUSA RAIZ: o update era feito em `funcionarios_folhas` pela tela do colaborador,
 * que roda no fluxo por `token_sessao` (sem usuário PocketBase autenticado). A regra
 * de update da coleção exigia `@request.auth.id != ''` e o PocketBase recusa um
 * PATCH sobre registro existente com 404 "The requested resource wasn't found."
 * (mesma convenção de `funcionarios_confirmacoes`, que já era pública no fluxo do
 * colaborador).
 *
 * REGRA NOVA (não muda o ciclo de folha — pagamento continua não bloqueado por
 * confirmação): o COLABORADOR (anônimo, fluxo por token_sessao) pode alterar em
 * `funcionarios_folhas` SOMENTE os três campos de conferência:
 *   - status_conferencia_colaborador (pendente | confirmado | divergente)
 *   - conferido_colaborador_em
 *   - motivo_divergencia_colaborador
 * Qualquer mudança em outro campo (quitada, a_receber, valores, datas, etc.) por
 * parte anônima segue recusada. Usuário autenticado (admin/gestor) mantém o acesso
 * total que já tinha.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('funcionarios_folhas')

    col.updateRule =
      "(@request.auth.id != '' && @request.auth.role != 'visualizador') || (" +
      "@request.auth.id = '' && " +
      '@request.body.status_conferencia_colaborador:changed = true && ' +
      '@request.body.conferido_colaborador_em:changed = true && ' +
      '@request.body.motivo_divergencia_colaborador:changed = true && ' +
      '@request.body.quitada:changed = false && ' +
      '@request.body.a_receber:changed = false && ' +
      '@request.body.ganho_total:changed = false && ' +
      '@request.body.descontos:changed = false && ' +
      '@request.body.divida_semanal:changed = false && ' +
      '@request.body.data_quitacao:changed = false && ' +
      '@request.body.lancamento_id:changed = false && ' +
      '@request.body.funcionario:changed = false && ' +
      '@request.body.periodo_inicio:changed = false && ' +
      '@request.body.periodo_fim:changed = false && ' +
      '@request.body.dias_pendentes_fechamento:changed = false && ' +
      '@request.body.notificacao_pagamento_enviada:changed = false && ' +
      '@request.body.notificacao_pagamento_em:changed = false && ' +
      '@request.body.observacoes:changed = false)'

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('funcionarios_folhas')
    col.updateRule = "@request.auth.id != '' && @request.auth.role != 'visualizador'"
    app.save(col)
  },
)
