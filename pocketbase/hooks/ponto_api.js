/**
 * ponto_api.js — API de ponto SEM LOGIN (ETAPA 1 — segurança).
 *
 * CRÍTICO (JSVM PocketBase): callbacks de rota rodam em pool separado —
 * declarações de topo e require('__hooks/…') NÃO são visíveis lá ("Invalid
 * module"). TODA a lógica fica INLINE dentro de cada callback (padrão de
 * google_calendar_sync.js, v0.0.298). NADA no escopo do arquivo além de
 * routerAdd(...).
 *
 * Rotas (todas POST, sob /backend/v1/ponto/):
 *  - /estacao            { token } → { estacao, funcionarios:[{id,nome,cargo,tem_pin}] }
 *  - /login              { token_estacao, funcionario_id, pin } → { token_sessao, funcionario }
 *  - /estado             X-Ponto-Token → estado completo do dia do colaborador
 *  - /bater-entrada      X-Ponto-Token + { token_estacao } → registra entrada (origem estacao_qr)
 *  - /bater-saida        X-Ponto-Token + { token_estacao, ponto_id }
 *  - /pausa              X-Ponto-Token + { token_estacao, ponto_id }
 *  - /retomar            X-Ponto-Token + { token_estacao, ponto_id }
 *  - /confirmar-dia      X-Ponto-Token + { data, divergencia?, motivo? }
 *  - /conferir-folha     X-Ponto-Token + { folha_id, status, motivo? } (só 3 campos da mig 0152)
 *  - /checklist-marcar   X-Ponto-Token + { token_estacao, checklist_id, index }
 *
 * Respostas NUNCA incluem: pin, salario_base, valor_hora, pix, telefone,
 * token_sessao, token/token_diario da estação.
 * Bloqueio por PIN: 5 erros = 15 min (pin_tentativas / pin_bloqueio_ate).
 */
