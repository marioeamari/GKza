/**
 * ponto_api.js — API de ponto SEM LOGIN (ETAPA 1 — segurança).
 *
 * Todas as rotas /backend/v1/ponto/* ficam AQUI, no servidor. O navegador
 * NUNCA lê coleções de funcionários diretamente e NUNCA vê o PIN:
 *  - POST /backend/v1/ponto/estacao    → valida token da estação, devolve {estacao:{id,nome,local_descricao}, funcionarios:[{id,nome,cargo}]}
 *  - POST /backend/v1/ponto/login      → confere PIN NO SERVIDOR; devolve token_sessao
 *  - POST /backend/v1/ponto/<acao>     → exige X-Ponto-Token (token_sessao do funcionário)
 *
 * Bloqueio por PIN errado: 5 erros seguidos do mesmo funcionário = 15 min de
 * bloqueio (campos pin_tentativas / pin_bloqueio_ate no próprio funcionário).
 *
 * REGRA (JSVM PocketBase): callbacks de router rodam em pool separado — declarações
 * de topo e require('__hooks/…') não são visíveis lá ("Invalid module"). Toda a
 * lógica compartilhada fica INLINE dentro de cada callback (padrão de
 * google_calendar_sync.js).
 *
 * Respostas NUNCA incluem: pin, salario_base, valor_hora, pix, telefone,
 * token_sessao, token/token_diario da estação.
 */

const PIN_MAX_TENTATIVAS = 5
const PIN_BLOQUEIO_MS = 15 * 60 * 1000 // 15 minutos

// ---------- helpers de resposta (padrão do projeto: erros em português) ----------

function erro(e, status, mensagem) {
  return e.json(status, { error: mensagem })
}

function lerCorpo(e) {
  try {
    const info = e.requestInfo()
    return info.body || {}
  } catch (_) {
    return {}
  }
}

function stringCorpo(body, campo) {
  const v = body[campo]
  return typeof v === 'string' ? v.trim() : ''
}

// ---------- data/hora (fuso America/Sao_Paulo, padrão do projeto) ----------

function dataHojeSP() {
  const fuso = { timeZone: 'America/Sao_Paulo' }
  const p = new Intl.DateTimeFormat('en-CA', fuso).formatToParts(new Date())
  const get = (t) => (p.find((x) => x.type === t) || {}).value || ''
  const y = get('year')
  const m = get('month')
  const d = get('day')
  return y && m && d ? y + '-' + m + '-' + d : ''
}

function horaAgoraSP() {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const hh = (p.find((x) => x.type === 'hour') || {}).value || '00'
  const mm = (p.find((x) => x.type === 'minute') || {}).value || '00'
  return hh + ':' + mm
}

function agoraISO() {
  return new Date().toISOString()
}

/** data (datetime) → YYYY-MM-DD, sem shift de fuso. */
function soData(valor) {
  const s = String(valor || '').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : s.slice(0, 10)
}

/** Grava data como YYYY-MM-DD 12:00:00.000Z (padrão toPocketBaseDate do front). */
function dataPB(dataYYYYMMDD) {
  return dataYYYYMMDD + ' 12:00:00.000Z'
}

// ---------- estado do funcionário (payload mínimo, sem dados sensíveis) ----------

function estadoMinimoFuncionario(reg) {
  return {
    id: reg.id,
    nome: reg.getString('nome') || '',
    cargo: reg.getString('cargo') || '',
    valor_hora: reg.getFloat('valor_hora') || 0,
    hora_almoco_conta: reg.getBool('hora_almoco_conta'),
    ativo: reg.getBool('ativo'),
  }
}

/**
 * Resolve o funcionário pelo X-Ponto-Token (token_sessao). Devolve o record
 * ou null. Consulta indexada por token_sessao.
 */
function funcionarioPorTokenSessao(token) {
  if (!token) return null
  try {
    const lista = $app.findRecordsByFilter(
      'funcionarios',
      'token_sessao = {:token}',
      '-created',
      1,
      0,
      { token: token },
    )
    return lista && lista.length > 0 ? lista[0] : null
  } catch (_) {
    return null
  }
}

/**
 * Exige X-Ponto-Token válido e funcionário ativo. Devolve { erro, status, func }.
 */
function exigirSessao(e) {
  const headers = e.requestInfo().headers || {}
  let token = String(headers['x_ponto_token'] || '').trim()
  if (token.indexOf(',') !== -1) {
    token = token.split(',')[0].trim()
  }
  if (!token) {
    return { erro: true, status: 401, msg: 'Sessão do ponto ausente. Identifique-se novamente.' }
  }
  const func = funcionarioPorTokenSessao(token)
  if (!func) {
    return {
      erro: true,
      status: 401,
      msg: 'Sessão do ponto inválida ou expirada. Identifique-se novamente.',
    }
  }
  if (!func.getBool('ativo')) {
    return { erro: true, status: 403, msg: 'Funcionário inativo.' }
  }
  return { erro: false, func: func }
}

// ---------- estação (token diário) ----------

/**
 * Valida o token da estação. Aceita token_diario (validade = hoje) ou, em
 * transição, o token fixo legado — que NÃO é aceito depois que a estação tem
 * token_diario do dia (mesma regra do serviço antigo do navegador).
 * Devolve o record da estação ou null.
 */
function estacaoPorToken(token) {
  if (!token) return null
  const hoje = dataHojeSP()

  try {
    const porDiario = $app.findRecordsByFilter(
      'funcionarios_estacoes',
      'token_diario = {:token} && ativa = true',
      '-created',
      1,
      0,
      { token: token },
    )
    if (porDiario && porDiario.length > 0) {
      const est = porDiario[0]
      const validade = soData(est.get('token_diario_validade'))
      return validade === hoje ? est : null
    }
  } catch (_) {}

  // Fallback de transição: estação sem token_diario ainda. Gera o diário no
  // servidor (nunca mais no navegador).
  try {
    const legada = $app.findRecordsByFilter(
      'funcionarios_estacoes',
      'token = {:token} && ativa = true',
      '-created',
      1,
      0,
      { token: token },
    )
    if (legada && legada.length > 0) {
      const est = legada[0]
      const temDiario = String(est.get('token_diario') || '').trim() !== ''
      const validade = soData(est.get('token_diario_validade'))
      if (!temDiario || validade !== hoje) {
        est.set('token_diario', 'ponto_' + $security.randomString(32))
        est.set('token_diario_validade', agoraISO())
        $app.save(est)
        // token legado já não é mais aceito depois de gerado o diário
        return null
      }
      return null
    }
  } catch (_) {}

  return null
}

// ---------- bloqueio por PIN errado ----------

function pinBloqueadoAte(reg) {
  const bloqueioRaw = String(reg.get('pin_bloqueio_ate') || '')
  if (!bloqueioRaw) return null
  const t = Date.parse(bloqueioRaw)
  if (isNaN(t)) return null
  if (t <= Date.now()) {
    // bloqueio venceu: limpa
    reg.set('pin_bloqueio_ate', null)
    reg.set('pin_tentativas', 0)
    $app.save(reg)
    return null
  }
  return t
}

function registrarPinErrado(reg) {
  const tentativas = (reg.getInt('pin_tentativas') || 0) + 1
  reg.set('pin_tentativas', tentativas)
  if (tentativas >= PIN_MAX_TENTATIVAS) {
    reg.set('pin_bloqueio_ate', new Date(Date.now() + PIN_BLOQUEIO_MS).toISOString())
    reg.set('pin_tentativas', 0)
  }
  $app.save(reg)
  return tentativas
}

function limparPinErrado(reg) {
  reg.set('pin_tentativas', 0)
  reg.set('pin_bloqueio_ate', null)
  $app.save(reg)
}

// ---------- rota: estação ----------

routerAdd('POST', '/backend/v1/ponto/estacao', (e) => {
  const body = lerCorpo(e)
  const token = stringCorpo(body, 'token')

  if (!token) {
    return erro(e, 400, 'Token da estação ausente.')
  }

  const est = estacaoPorToken(token)
  if (!est) {
    return erro(
      e,
      404,
      'Estação não localizada, inativa ou QR Code expirado. Escaneie o QR Code de hoje.',
    )
  }

  // Só {id, nome} (+cargo p/ exibição) dos funcionários ativos. NUNCA pin,
  // salario_base, valor_hora, pix, telefone nem token_sessao.
  const funcs = $app.findRecordsByFilter('funcionarios', 'ativo = true', 'nome', 500, 0)
  const funcionarios = (funcs || []).map((f) => ({
    id: f.id,
    nome: f.getString('nome') || '',
    cargo: f.getString('cargo') || '',
    temPin: String(f.get('pin') || '').trim() !== '',
  }))

  return e.json(200, {
    estacao: {
      id: est.id,
      nome: est.getString('nome') || '',
      local_descricao: est.getString('local_descricao') || '',
    },
    funcionarios: funcionarios,
  })
})

// ---------- rota: login (PIN conferido NO SERVIDOR) ----------

routerAdd('POST', '/backend/v1/ponto/login', (e) => {
  const body = lerCorpo(e)
  const token = stringCorpo(body, 'token')
  const funcionarioId = stringCorpo(body, 'funcionario_id')
  const pin = stringCorpo(body, 'pin')

  if (!token || !funcionarioId) {
    return erro(e, 400, 'Token da estação e funcionário são obrigatórios.')
  }

  const est = estacaoPorToken(token)
  if (!est) {
    return erro(
      e,
      404,
      'Estação não localizada, inativa ou QR Code expirado. Escaneie o QR Code de hoje.',
    )
  }

  let func = null
  try {
    const lista = $app.findRecordsByFilter(
      'funcionarios',
      'id = {:id} && ativo = true',
      '-created',
      1,
      0,
      { id: funcionarioId },
    )
    func = lista && lista.length > 0 ? lista[0] : null
  } catch (_) {
    func = null
  }
  if (!func) {
    return erro(e, 404, 'Funcionário não localizado ou inativo.')
  }

  // Bloqueio por PIN errado
  const bloqueio = pinBloqueadoAte(func)
  if (bloqueio) {
    return erro(
      e,
      429,
      'Muitas tentativas incorretas. Tente novamente em alguns minutos (bloqueio de 15 minutos).',
    )
  }

  // PIN conferido APENAS NO SERVIDOR
  const pinSalvo = String(func.get('pin') || '').trim()
  if (pinSalvo === '' || pin !== pinSalvo) {
    registrarPinErrado(func)
    return erro(e, 401, 'PIN incorreto. Tente novamente ou peça ajuda ao seu gestor.')
  }

  // Sucesso: novo token_sessao, gravado no servidor, devolvido só uma vez
  limparPinErrado(func)
  const novoToken = $security.randomString(40)
  func.set('token_sessao', novoToken)
  $app.save(func)

  return e.json(200, {
    token_sessao: novoToken,
    funcionario: estadoMinimoFuncionario(func),
  })
})

// ---------- rotas autenticadas por X-Ponto-Token ----------

routerAdd('POST', '/backend/v1/ponto/estado', (e) => {
  const s = exigirSessao(e)
  if (s.erro) return erro(e, s.status, s.msg)
  const func = s.func

  const hoje = dataHojeSP()
  const inicio30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const inicio30Str = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    inicio30,
  )

  // Ponto de hoje: aberto primeiro; senão o último do dia
  let pontoHoje = null
  let historico = []
  try {
    const pontos = $app.findRecordsByFilter(
      'funcionarios_pontos',
      'funcionario = {:fid} && data >= {:ini}',
      'data,entrada',
      500,
      0,
      { fid: func.id, ini: dataPB(inicio30Str) },
    )
    const todos = (pontos || []).map((p) => pontoJSON(p))
    for (let i = todos.length - 1; i >= 0; i--) {
      if (soData(todos[i].data) === hoje) {
        if (!pontoHoje && (!todos[i].saida || todos[i].saida.trim() === '')) {
          pontoHoje = todos[i]
        }
      }
    }
    if (!pontoHoje) {
      for (let i = todos.length - 1; i >= 0; i--) {
        if (soData(todos[i].data) === hoje) {
          pontoHoje = todos[i]
          break
        }
      }
    }
    historico = todos
  } catch (err) {
    historico = []
  }

  // Confirmações dos últimos 30 dias
  let confirmacoes = []
  try {
    const confs = $app.findRecordsByFilter(
      'funcionarios_confirmacoes',
      'funcionario = {:fid} && data >= {:ini}',
      'data',
      500,
      0,
      { fid: func.id, ini: dataPB(inicio30Str) },
    )
    confirmacoes = (confs || []).map((c) => confirmacaoJSON(c))
  } catch (_) {
    confirmacoes = []
  }

  // Dívidas ativas (só as do próprio funcionário)
  let dividas = []
  try {
    const divs = $app.findRecordsByFilter(
      'funcionarios_dividas',
      'funcionario = {:fid} && ativa = true',
      '-created',
      200,
      0,
      { fid: func.id },
    )
    dividas = (divs || []).map((d) => dividaJSON(d))
  } catch (_) {
    dividas = []
  }

  // Folha mais recente quitada (para conferência do colaborador)
  let folha = null
  try {
    const folhas = $app.findRecordsByFilter(
      'funcionarios_folhas',
      'funcionario = {:fid} && quitada = true',
      '-periodo_fim',
      5,
      0,
      { fid: func.id },
    )
    const lista = folhas || []
    for (let i = 0; i < lista.length; i++) {
      const status = String(lista[i].get('status_conferencia_colaborador') || 'pendente')
      if (status === 'pendente') {
        folha = folhaJSON(lista[i])
        break
      }
    }
    if (!folha && lista.length > 0) {
      folha = folhaJSON(lista[0])
    }
  } catch (_) {
    folha = null
  }

  // Checklists do dia (das funções do funcionário, vigência + janela do check-in)
  const horaEntrada = pontoHoje && pontoHoje.entrada ? pontoHoje.entrada : ''
  let checklists = []
  try {
    checklists = checklistsDoDia($app, func, hoje, horaEntrada)
  } catch (errC) {
    console.error('[ponto:estado] Erro ao montar checklists do dia:', errC)
    checklists = []
  }

  let execucoes = {}
  try {
    const execs = $app.findRecordsByFilter(
      'funcionarios_checklist_execucoes',
      'funcionario = {:fid} && data >= {:ini} && data <= {:fim}',
      '-data,-created',
      100,
      0,
      { fid: func.id, ini: dataPB(hoje), fim: dataPB(hoje) },
    )
    for (const ex of execs || []) {
      const ck = String(ex.get('checklist') || '')
      if (ck) execucoes[ck] = execucaoJSON(ex)
    }
  } catch (_) {
    execucoes = {}
  }

  return e.json(200, {
    hoje: hoje,
    funcionario: estadoMinimoFuncionario(func),
    ponto_hoje: pontoHoje,
    historico_pontos: historico,
    confirmacoes: confirmacoes,
    dividas: dividas,
    folha: folha,
    checklists: checklists,
    execucoes: execucoes,
  })
})

routerAdd('POST', '/backend/v1/ponto/bater-entrada', (e) => {
  const s = exigirSessao(e)
  if (s.erro) return erro(e, s.status, s.msg)
  const func = s.func

  const body = lerCorpo(e)
  const tokenEstacao = stringCorpo(body, 'token_estacao')

  // REGRA: batida só com origem 'estacao_qr' — a estação é revalidada no
  // servidor a cada batida; o servidor nunca aceita 'fora_do_local' do cliente.
  const est = estacaoPorToken(tokenEstacao)
  if (!est) {
    return erro(e, 403, 'Registro não permitido: escaneie o QR Code da estação para bater o ponto.')
  }

  const hoje = dataHojeSP()

  // Anti-duplicidade no servidor
  try {
    const existentes = $app.findRecordsByFilter(
      'funcionarios_pontos',
      'funcionario = {:fid} && data = {:dia}',
      '-created',
      10,
      0,
      { fid: func.id, dia: dataPB(hoje) },
    )
    for (const p of existentes || []) {
      if (String(p.get('saida') || '').trim() === '') {
        return erro(e, 409, 'Entrada já registrada hoje às ' + String(p.get('entrada') || '') + '.')
      }
    }
  } catch (_) {}

  const ponto = $app.newRecord('funcionarios_pontos')
  ponto.set('funcionario', func.id)
  ponto.set('data', dataPB(hoje))
  ponto.set('entrada', horaAgoraSP())
  ponto.set('pausas', [])
  ponto.set('origem', 'estacao_qr')
  ponto.set('estacao', est.getString('nome') || '')
  ponto.set('local_aproximado', est.getString('local_descricao') || 'Sem estação vinculada')
  ponto.set('editado_por', '')
  ponto.set('observacao', '')
  $app.save(ponto)

  return e.json(200, { ponto: pontoJSON(ponto) })
})

function fecharPontoAcao(e, acao) {
  const s = exigirSessao(e)
  if (s.erro) return erro(e, s.status, s.msg)
  const func = s.func

  const body = lerCorpo(e)
  const pontoId = stringCorpo(body, 'ponto_id')
  if (!pontoId) {
    return erro(e, 400, 'Ponto não informado.')
  }

  // REGRA: saída/pausa/retorno só com estação QR válida revalidada no servidor
  const tokenEstacao = stringCorpo(body, 'token_estacao')
  const est = estacaoPorToken(tokenEstacao)
  if (!est) {
    return erro(e, 403, 'Registro não permitido: escaneie o QR Code da estação.')
  }

  let ponto = null
  try {
    ponto = $app.findRecordById('funcionarios_pontos', pontoId)
  } catch (_) {
    ponto = null
  }
  // Só o ponto DO PRÓPRIO funcionário
  if (!ponto || String(ponto.get('funcionario') || '') !== func.id) {
    return erro(e, 404, 'Ponto não localizado para este colaborador.')
  }

  const hora = horaAgoraSP()

  if (acao === 'saida') {
    if (String(ponto.get('saida') || '').trim() !== '') {
      return erro(e, 409, 'Saída já registrada.')
    }
    // REGRA: saída com itens pendentes de checklist apenas AVISA — nunca bloqueia.
    let pendentes = 0
    try {
      const hoje = dataHojeSP()
      const execs = $app.findRecordsByFilter(
        'funcionarios_checklist_execucoes',
        'funcionario = {:fid} && data = {:dia}',
        '-created',
        50,
        0,
        { fid: func.id, dia: dataPB(hoje) },
      )
      for (const ex of execs || []) {
        const itens = ex.get('itens') || []
        for (const it of itens) {
          if (!it.marcado) pendentes++
        }
      }
    } catch (_) {}
    ponto.set('saida', hora)
    $app.save(ponto)
    return e.json(200, { ponto: pontoJSON(ponto), itens_pendentes: pendentes })
  }

  // pausa / retomar
  const pausas = ponto.get('pausas') || []
  if (acao === 'pausa') {
    if (pausas.length > 0 && !pausas[pausas.length - 1].fim) {
      return erro(e, 409, 'Já existe uma pausa em andamento.')
    }
    pausas.push({ inicio: hora })
  } else {
    // retomar
    const aberta = pausas.length > 0 && !pausas[pausas.length - 1].fim
    if (!aberta) {
      return erro(e, 409, 'Nenhuma pausa em andamento para retomar.')
    }
    pausas[pausas.length - 1].fim = hora
  }
  ponto.set('pausas', pausas)
  $app.save(ponto)
  return e.json(200, { ponto: pontoJSON(ponto) })
}

routerAdd('POST', '/backend/v1/ponto/bater-saida', (e) => fecharPontoAcao(e, 'saida'))
routerAdd('POST', '/backend/v1/ponto/pausa', (e) => fecharPontoAcao(e, 'pausa'))
routerAdd('POST', '/backend/v1/ponto/retomar', (e) => fecharPontoAcao(e, 'retomar'))

// ---------- rota: confirmação de dia trabalhado / divergência ----------

routerAdd('POST', '/backend/v1/ponto/confirmar-dia', (e) => {
  const s = exigirSessao(e)
  if (s.erro) return erro(e, s.status, s.msg)
  const func = s.func

  const body = lerCorpo(e)
  const data = soData(stringCorpo(body, 'data'))
  const divergencia = Boolean(body.divergencia)
  const motivo = stringCorpo(body, 'motivo')

  if (!data) {
    return erro(e, 400, 'Data não informada.')
  }
  if (divergencia && !motivo) {
    return erro(e, 400, 'Informe a divergência.')
  }

  let existente = null
  try {
    const lista = $app.findRecordsByFilter(
      'funcionarios_confirmacoes',
      'funcionario = {:fid} && data = {:dia}',
      '-created',
      1,
      0,
      { fid: func.id, dia: dataPB(data) },
    )
    existente = lista && lista.length > 0 ? lista[0] : null
  } catch (_) {
    existente = null
  }

  if (existente) {
    existente.set('confirmado', !divergencia)
    existente.set('confirmado_em', divergencia ? null : agoraISO())
    existente.set('divergencia_apontada', divergencia)
    existente.set('motivo_divergencia', motivo)
    $app.save(existente)
    return e.json(200, { confirmacao: confirmacaoJSON(existente) })
  }

  const nova = $app.newRecord('funcionarios_confirmacoes')
  nova.set('funcionario', func.id)
  nova.set('data', dataPB(data))
  nova.set('confirmado', !divergencia)
  nova.set('confirmado_em', divergencia ? null : agoraISO())
  nova.set('divergencia_apontada', divergencia)
  nova.set('motivo_divergencia', motivo)
  $app.save(nova)
  return e.json(200, { confirmacao: confirmacaoJSON(nova) })
})

// ---------- rota: conferência da folha pelo colaborador ----------

routerAdd('POST', '/backend/v1/ponto/conferir-folha', (e) => {
  const s = exigirSessao(e)
  if (s.erro) return erro(e, s.status, s.msg)
  const func = s.func

  const body = lerCorpo(e)
  const folhaId = stringCorpo(body, 'folha_id')
  const status = stringCorpo(body, 'status')
  const motivo = stringCorpo(body, 'motivo')

  if (!folhaId || (status !== 'confirmado' && status !== 'divergente')) {
    return erro(e, 400, 'Informe a folha e o status (confirmado ou divergente).')
  }
  if (status === 'divergente' && !motivo) {
    return erro(e, 400, 'Descreva a divergência.')
  }

  let folha = null
  try {
    folha = $app.findRecordById('funcionarios_folhas', folhaId)
  } catch (_) {
    folha = null
  }
  // Só folha DO PRÓPRIO funcionário
  if (!folha || String(folha.get('funcionario') || '') !== func.id) {
    return erro(e, 404, 'Folha não localizada para este colaborador.')
  }

  // Mesmos 3 campos da conferência (regra da mig 0152), agora pelo servidor
  folha.set('status_conferencia_colaborador', status)
  folha.set('conferido_colaborador_em', agoraISO())
  folha.set('motivo_divergencia_colaborador', motivo)
  $app.save(folha)

  return e.json(200, { folha: folhaJSON(folha) })
})

// ---------- rota: marcar item de checklist (exige estação QR) ----------

routerAdd('POST', '/backend/v1/ponto/checklist-marcar', (e) => {
  const s = exigirSessao(e)
  if (s.erro) return erro(e, s.status, s.msg)
  const func = s.func

  const body = lerCorpo(e)
  const checklistId = stringCorpo(body, 'checklist_id')
  const idx = parseInt(body.index, 10)

  if (!checklistId || isNaN(idx) || idx < 0) {
    return erro(e, 400, 'Checklist ou item inválido.')
  }

  // REGRA: marcar item exige a MESMA origem válida do ponto — estação QR
  // revalidada no servidor ('admin' permitido; sem QR a marcação é recusada).
  const tokenEstacao = stringCorpo(body, 'token_estacao')
  const est = estacaoPorToken(tokenEstacao)
  if (!est) {
    return erro(e, 403, 'Marcação não permitida: escaneie o QR Code da estação.')
  }

  // O checklist precisa pertencer a uma das funções do funcionário
  const funcoesFunc = func.get('funcoes') || []
  let template = null
  try {
    template = $app.findRecordById('funcionarios_checklists', checklistId)
  } catch (_) {
    template = null
  }
  if (!template) {
    return erro(e, 404, 'Checklist não localizado.')
  }
  const funcoesCk = template.get('funcoes') || []
  let pertence = false
  for (const f of funcoesCk) {
    if (funcoesFunc.indexOf(f) !== -1) {
      pertence = true
      break
    }
  }
  if (!pertence) {
    return erro(e, 403, 'Este checklist não pertence às suas funções.')
  }

  const hoje = dataHojeSP()
  let execucao = null
  try {
    const lista = $app.findRecordsByFilter(
      'funcionarios_checklist_execucoes',
      'funcionario = {:fid} && checklist = {:ck} && data = {:dia}',
      '-created',
      1,
      0,
      { fid: func.id, ck: checklistId, dia: dataPB(hoje) },
    )
    execucao = lista && lista.length > 0 ? lista[0] : null
  } catch (_) {
    execucao = null
  }

  // Execução nasce PREGUIÇOSAMENTE no primeiro item marcado (idempotente)
  if (!execucao) {
    const itensTemplate = template.get('itens') || []
    const itensIniciais = []
    for (const it of itensTemplate) {
      itensIniciais.push({ texto: String(it.texto || ''), marcado: false })
    }
    execucao = $app.newRecord('funcionarios_checklist_execucoes')
    execucao.set('funcionario', func.id)
    execucao.set('checklist', checklistId)
    execucao.set('data', dataPB(hoje))
    execucao.set('itens', itensIniciais)
    $app.save(execucao)
  }

  const itens = execucao.get('itens') || []
  if (idx >= itens.length) {
    return erro(e, 400, 'Item não existe neste checklist.')
  }
  if (itens[idx].marcado) {
    itens[idx] = { texto: itens[idx].texto, marcado: false }
  } else {
    itens[idx] = { texto: itens[idx].texto, marcado: true, horario: horaAgoraSP() }
  }
  execucao.set('itens', itens)
  $app.save(execucao)

  return e.json(200, { execucao: execucaoJSON(execucao) })
})

// ---------- serializers (payload mínimo para o colaborador) ----------

function pontoJSON(p) {
  return {
    id: p.id,
    data: soData(p.get('data')),
    entrada: String(p.get('entrada') || ''),
    saida: String(p.get('saida') || ''),
    pausas: p.get('pausas') || [],
    origem: String(p.get('origem') || ''),
    estacao: String(p.get('estacao') || ''),
    local_aproximado: String(p.get('local_aproximado') || ''),
    observacao: String(p.get('observacao') || ''),
  }
}

function confirmacaoJSON(c) {
  return {
    id: c.id,
    data: soData(c.get('data')),
    confirmado: c.getBool('confirmado'),
    divergencia_apontada: c.getBool('divergencia_apontada'),
    motivo_divergencia: String(c.get('motivo_divergencia') || ''),
  }
}

function dividaJSON(d) {
  return {
    id: d.id,
    descricao: String(d.get('descricao') || ''),
    valor_total: d.getFloat('valor_total') || 0,
    saldo_atual: d.getFloat('saldo_atual') || 0,
    percentual_abatimento: d.getFloat('percentual_abatimento') || 0,
    ativa: d.getBool('ativa'),
  }
}

function folhaJSON(f) {
  return {
    id: f.id,
    periodo_inicio: soData(f.get('periodo_inicio')),
    periodo_fim: soData(f.get('periodo_fim')),
    a_receber: f.getFloat('a_receber') || 0,
    quitada: f.getBool('quitada'),
    status_conferencia_colaborador: String(f.get('status_conferencia_colaborador') || 'pendente'),
    conferido_colaborador_em: String(f.get('conferido_colaborador_em') || ''),
    motivo_divergencia_colaborador: String(f.get('motivo_divergencia_colaborador') || ''),
  }
}

function execucaoJSON(ex) {
  return {
    id: ex.id,
    checklist: String(ex.get('checklist') || ''),
    data: soData(ex.get('data')),
    itens: ex.get('itens') || [],
  }
}

// ---------- checklists do dia (mesma regra de vigência/janela do front) ----------

function compararHHMM(a, b) {
  const pa = String(a || '00:00').split(':')
  const pb2 = String(b || '00:00').split(':')
  const ah = parseInt(pa[0], 10) || 0
  const am = parseInt(pa[1], 10) || 0
  const bh = parseInt(pb2[0], 10) || 0
  const bm = parseInt(pb2[1], 10) || 0
  if (ah !== bh) return ah < bh ? -1 : 1
  if (am !== bm) return am < bm ? -1 : 0
  return 0
}

function checklistAplicaAoDia(cl, dataYYYYMMDD) {
  const periodo = String(cl.get('periodo') || '')
  if (periodo === 'diario' || periodo === 'manha' || periodo === 'tarde') return true
  if (periodo === 'semanal') {
    // Dia da semana no fuso America/Sao_Paulo
    const partes = dataYYYYMMDD.split('-')
    const d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]), 12)
    return d.getDay() === (cl.getInt('dia_semana') || 0)
  }
  if (periodo === 'mensal') {
    const dia = Number(dataYYYYMMDD.split('-')[2])
    return dia === (cl.getInt('dia_mes') || 1)
  }
  return false
}

function checklistVigeNoCheckIn(cl, horaEntrada) {
  const periodo = String(cl.get('periodo') || '')
  if (periodo !== 'manha' && periodo !== 'tarde') return true
  if (!horaEntrada) return true
  const antesMeioDia = compararHHMM(horaEntrada, '12:00') < 0
  return periodo === 'manha' ? antesMeioDia : !antesMeioDia
}

function checklistsDoDia(app, func, dataYYYYMMDD, horaEntrada) {
  const funcoesFunc = func.get('funcoes') || []
  if (!funcoesFunc || funcoesFunc.length === 0) return []

  const todos = app.findRecordsByFilter('funcionarios_checklists', '', '-created', 500, 0)
  const validos = []
  for (const cl of todos || []) {
    const funcoesCk = cl.get('funcoes') || []
    let pertence = false
    for (const f of funcoesCk) {
      if (funcoesFunc.indexOf(f) !== -1) {
        pertence = true
        break
      }
    }
    if (!pertence) continue
    if (!checklistAplicaAoDia(cl, dataYYYYMMDD)) continue
    if (!checklistVigeNoCheckIn(cl, horaEntrada)) continue

    validos.push({
      id: cl.id,
      nome: String(cl.get('nome') || ''),
      periodo: String(cl.get('periodo') || ''),
      dia_semana: cl.getInt('dia_semana') || 0,
      dia_mes: cl.getInt('dia_mes') || 0,
      itens: (cl.get('itens') || []).map((i) => ({ texto: String(i.texto || '') })),
    })
  }
  return validos
}
