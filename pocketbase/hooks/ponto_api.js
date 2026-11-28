// ponto_api.js — API de ponto SEM LOGIN (ETAPA 1 — segurança).
//
// CRÍTICO (JSVM PocketBase): callbacks de rota rodam em pool separado —
// declarações de topo e require('__hooks/…') NÃO são visíveis lá ("Invalid
// module", e o require com "__hooks" quebra o bundling do deploy). TODA a
// lógica fica INLINE dentro de cada callback (padrão de google_calendar_sync.js,
// v0.0.298). NADA no escopo do arquivo além dos routerAdd(...).
//
// Rotas (sob /backend/v1/ponto/):
//  - POST /estacao            { token } → { estacao, funcionarios:[{id,nome}] }
//  - POST /login              { token_estacao, funcionario_id, pin } → { token_sessao, funcionario:{id,nome,cargo} }
//  - POST /ponto/entrada      X-Ponto-Token + { token_estacao, obs? }
//  - POST /ponto/saida        X-Ponto-Token + { token_estacao, ponto_id, obs? }
//  - POST /ponto/pausa        X-Ponto-Token + { token_estacao, ponto_id }
//  - POST /ponto/retomar      X-Ponto-Token + { token_estacao, ponto_id }
//  - POST /pontos-dia         X-Ponto-Token + { data }
//  - POST /pontos-historico   X-Ponto-Token + { de, ate }
//  - POST /confirmacoes-listar X-Ponto-Token
//  - POST /confirmacao-salvar X-Ponto-Token + { data, status, motivo?, divergencia? }
//  - POST /dividas            X-Ponto-Token
//  - POST /folha              X-Ponto-Token → { folha, valor_hora, salario_base } (mín. p/ conferência)
//  - POST /folha-conferir     X-Ponto-Token + { folha_id, status, motivo? } (só 3 campos da mig 0152)
//  - POST /checklists         X-Ponto-Token + { data }
//  - POST /checklist-execucoes X-Ponto-Token + { data }
//  - POST /checklist-marcar   X-Ponto-Token + { token_estacao, checklist_id, index, marcado }
//
// Respostas NUNCA incluem: pin, salario_base (exceto /folha, que o COLABORADOR
// autorizado confere — sem pin), pix, telefone, token/token_diario da estação.
// Bloqueio por PIN: 5 erros seguidos = 15 min (pin_tentativas / pin_bloqueio_ate).
// Cada rota autenticada exige X-Ponto-Token; o funcionário é descoberto por
// token_sessao e as leituras/gravções valem SÓ para registros dele.
