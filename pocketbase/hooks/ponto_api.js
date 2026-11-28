// ponto_api.js — API de ponto SEM LOGIN (ETAPA 1 — segurança).
//
// CRÍTICO (JSVM PocketBase): callbacks de rota rodam em pool separado —
// declarações de topo e require de módulos de hook NÃO são visíveis lá
// ("Invalid module"; e uma string de require com caminho interno quebra o
// bundling do deploy — o empacotador tenta instalá-la como dependência pnpm).
// TODA a lógica fica INLINE dentro de cada callback (padrão de
// google_calendar_sync.js, v0.0.298). NADA no escopo do arquivo além das
// chamadas routerAdd(...).
//
// Rotas (todas POST, sob /backend/v1/ponto/):
//  - POST /estacao             { token } → [{id, nome}] dos ativos (NADA além disso)
//  - POST /login               { token, funcionario_id, pin } → { token }
//  - POST /ponto/entrada       X-Ponto-Token + { token, observacao? }
//  - POST /ponto/saida         X-Ponto-Token + { token, observacao? }
//  - POST /ponto/pausa         X-Ponto-Token + { token }
//  - POST /ponto/retomar       X-Ponto-Token + { token }
//  - POST /pontos-dia          X-Ponto-Token + { data? }
//  - POST /pontos-historico    X-Ponto-Token + { page?, per_page? }
//  - POST /confirmacoes-listar X-Ponto-Token
//  - POST /confirmacao-salvar  X-Ponto-Token + { data, divergencia?, motivo? }
//  - POST /dividas             X-Ponto-Token
//  - POST /folha               X-Ponto-Token
//  - POST /folha-conferir      X-Ponto-Token + { folha_id, status, motivo? } (só os 3 campos da mig 0152)
//  - POST /checklists          X-Ponto-Token + { data? }
//  - POST /checklist-execucoes X-Ponto-Token + { data? }
//  - POST /checklist-marcar    X-Ponto-Token + { checklist_id, index, marcado, data? }
//
// SEGURANÇA: nenhuma resposta devolve pin, salario_base, valor_hora, pix,
// telefone ou token_sessao (exceto o token de SESSÃO no /login, que é o próprio
// objeto do login). Erros para o cliente são genéricos; nada de dados pessoais
// ou financeiros em console.log. Bloqueio por PIN: 5 erros seguidos = 15 min
// (pin_tentativas / pin_bloqueio_ate, migração 0155).
//
// Regras de ponto replicadas inline (src/lib/funcionarios.ts + src/services/funcionarios.ts):
//  - origem só 'estacao_qr' nestas rotas ('fora_do_local' é recusada; 'admin' é do painel);
//  - sem entrada duplicada: entrada aberta bloqueia nova entrada; dia fechado bloqueia nova batida;
//  - horas: diferença saida-entrada menos pausas fechadas quando hora_almoco_conta = false;
//    valor do dia = round(horasDecimais * valor_hora, 2); minutes em HH:mm com 2 dígitos.

'use strict'

routerAdd('POST', '/backend/v1/ponto/estacao', (e) => {
  // ---------- helpers inline ----------
  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
  }
  function hojeSP() {
    // Data de hoje no fuso America/Sao_Paulo (UTC-3 o ano todo)
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  }
  // Valida o token da estação (mesma regra de validarTokenDiarioEstacao):
  // token_diario vigente (confere E validade = hoje) OU token fixo legado
  // apenas quando a estação nunca teve token_diario. Estação precisa estar ativa.
  function validarEstacaoPorToken(token) {
    if (!token) return null
    const hoje = hojeSP()
    // 1. token_diario
    try {
      const est = $app.findFirstRecordByFilter(
        'funcionarios_estacoes',
        'token_diario = {:t} && ativa = true',
        { t: token },
      )
      if (est) {
        const validade = normalizarDataPonto(est.getString('token_diario_validade'))
        if (validade === hoje) return est
        return null // token diário expirado
      }
    } catch (_) {}
    // 2. token fixo legado — só se a estação nunca teve token_diario
    try {
      const est2 = $app.findFirstRecordByFilter('funcionarios_estacoes', 'token = {:t}', {
        t: token,
      })
      if (est2 && est2.getBool('ativa') && !est2.getString('token_diario')) return est2
    } catch (_) {}
    return null
  }
  // ---------- fim helpers ----------

  let body = {}
  try {
    body = e.readBody() || {}
  } catch (_) {
    body = {}
  }
  const token = (body && body.token) || ''
  const estacao = validarEstacaoPorToken(token)
  if (!estacao) {
    return e.json(401, { error: 'Estação não autorizada.' })
  }

  let funcs = []
  try {
    funcs = $app.findRecordsByFilter('funcionarios', 'ativo = true', 'nome', 500, 0)
  } catch (err) {
    funcs = []
  }

  const lista = []
  for (let i = 0; i < funcs.length; i++) {
    lista.push({
      id: funcs[i].getString('id'),
      nome: funcs[i].getString('nome'),
    })
  }

  return e.json(200, lista)
})

routerAdd('POST', '/backend/v1/ponto/login', (e) => {
  // ---------- helpers inline ----------
  const LIMITE_TENTATIVAS = 5
  const BLOQUEIO_MINUTOS = 15

  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
  }
  function hojeSP() {
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  }
  function validarEstacaoPorToken(token) {
    if (!token) return null
    const hoje = hojeSP()
    try {
      const est = $app.findFirstRecordByFilter(
        'funcionarios_estacoes',
        'token_diario = {:t} && ativa = true',
        { t: token },
      )
      if (est) {
        const validade = normalizarDataPonto(est.getString('token_diario_validade'))
        if (validade === hoje) return est
        return null
      }
    } catch (_) {}
    try {
      const est2 = $app.findFirstRecordByFilter('funcionarios_estacoes', 'token = {:t}', {
        t: token,
      })
      if (est2 && est2.getBool('ativa') && !est2.getString('token_diario')) return est2
    } catch (_) {}
    return null
  }
  // ---------- fim helpers ----------

  let body = {}
  try {
    body = e.readBody() || {}
  } catch (_) {
    body = {}
  }
  const token = (body && body.token) || ''
  const funcionarioId = (body && body.funcionario_id) || ''
  const pin = (body && body.pin) || ''

  const estacao = validarEstacaoPorToken(token)
  if (!estacao) {
    return e.json(401, { error: 'Estação não autorizada.' })
  }
  if (!funcionarioId || !pin) {
    return e.json(400, { error: 'Dados incompletos.' })
  }

  let func = null
  try {
    func = $app.findRecordById('funcionarios', funcionarioId)
  } catch (_) {
    return e.json(401, { error: 'Credenciais inválidas.' })
  }
  if (!func.getBool('ativo')) {
    return e.json(401, { error: 'Credenciais inválidas.' })
  }

  // Verificação de bloqueio vigente
  const bloqueioAte = func.getString('pin_bloqueio_ate')
  if (bloqueioAte) {
    const restaMs = new Date(bloqueioAte).getTime() - Date.now()
    if (restaMs > 0) {
      const restaMin = Math.max(1, Math.ceil(restaMs / 60000))
      return e.json(423, {
        error:
          'Muitas tentativas incorretas. Tente novamente em aproximadamente ' +
          restaMin +
          ' minuto(s).',
        bloqueado_ate: bloqueioAte,
        minutos_restantes: restaMin,
      })
    }
  }

  const pinSalvo = func.getString('pin')
  if (pin !== pinSalvo) {
    const tentativas = (func.getInt('pin_tentativas') || 0) + 1
    if (tentativas >= LIMITE_TENTATIVAS) {
      func.set('pin_tentativas', 0)
      func.set('pin_bloqueio_ate', new Date(Date.now() + BLOQUEIO_MINUTOS * 60000).toISOString())
      try {
        $app.save(func)
      } catch (_) {}
      return e.json(423, {
        error: 'Muitas tentativas incorretas. Tente novamente em ' + BLOQUEIO_MINUTOS + ' minutos.',
        minutos_restantes: BLOQUEIO_MINUTOS,
      })
    }
    func.set('pin_tentativas', tentativas)
    try {
      $app.save(func)
    } catch (_) {}
    const resta = LIMITE_TENTATIVAS - tentativas
    return e.json(401, {
      error: 'PIN incorreto. Tentativas restantes: ' + resta + '.',
      tentativas_restantes: resta,
    })
  }

  // PIN correto: zera tentativas, limpa bloqueio, gera token de sessão
  func.set('pin_tentativas', 0)
  func.set('pin_bloqueio_ate', null)
  const tokenSessao = $security.randomString(40)
  func.set('token_sessao', tokenSessao)
  try {
    $app.save(func)
  } catch (err) {
    return e.json(500, { error: 'Não foi possível iniciar a sessão. Tente novamente.' })
  }

  return e.json(200, { token: tokenSessao })
})
