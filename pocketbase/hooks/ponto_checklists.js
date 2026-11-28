// ponto_checklists.js — rotas de CHECKLIST do colaborador (irmão de ponto_api.js).
//
//  - /checklists          lista os checklists cuja função bate com as funções do colaborador
//  - /checklist-execucoes lista as execuções do PRÓPRIO funcionário na data
//  - /checklist-marcar    grava/atualiza execução de item do PRÓPRIO funcionário

routerAdd('POST', '/backend/v1/ponto/checklists', (e) => {
  // ---------- auth helpers (inline) ----------
  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
  }
  function hojeSP() {
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  }
  function funcionarioPorTokenSessao(tok) {
    if (!tok) return null
    try {
      return $app.findFirstRecordByFilter('funcionarios', 'token_sessao = {:t} && ativo = true', {
        t: tok,
      })
    } catch (_) {
      return null
    }
  }
  // ---------- fim auth helpers ----------

  const headerTok = e.request.header.get('X-Ponto-Token') || ''
  const func = funcionarioPorTokenSessao(headerTok)
  if (!func) {
    return e.json(401, { error: 'Sessão inválida ou expirada.' })
  }

  let body = {}
  try {
    body = e.readBody() || {}
  } catch (_) {
    body = {}
  }
  const dia = (body && body.data ? normalizarDataPonto(body.data) : '') || hojeSP()

  // Funções do colaborador
  let funcoesIds = []
  try {
    const raw = func.get('funcoes')
    funcoesIds = raw ? JSON.parse(JSON.stringify(raw)) : []
    if (!Array.isArray(funcoesIds)) funcoesIds = []
  } catch (_) {
    funcoesIds = []
  }

  // Dia da semana (0=domingo ... 6=sábado) e dia do mês em São Paulo
  const dataRef = new Date(dia + 'T12:00:00-03:00')
  const diaSemana = dataRef.getUTCDay()
  const diaMes = parseInt(dia.slice(8, 10), 10) || 0

  let recs = []
  try {
    recs = $app.findRecordsByFilter('funcionarios_checklists', '', '-created', 200, 0)
  } catch (_) {
    recs = []
  }

  const lista = []
  for (let i = 0; i < recs.length; i++) {
    const c = recs[i]
    const periodo = c.getString('periodo') || ''

    // Filtra por função: o checklist deve ter ao menos uma função em comum
    let cFuncoes = []
    try {
      const rawF = c.get('funcoes')
      cFuncoes = rawF ? JSON.parse(JSON.stringify(rawF)) : []
      if (!Array.isArray(cFuncoes)) cFuncoes = []
    } catch (_) {
      cFuncoes = []
    }
    let temFuncaoComum = false
    for (let j = 0; j < cFuncoes.length; j++) {
      if (funcoesIds.indexOf(cFuncoes[j]) !== -1) {
        temFuncaoComum = true
        break
      }
    }
    if (!temFuncaoComum) continue

    // Regra de periodicidade (espelha checklistAtivoHoje da lib):
    // manha/tarde/diario: todo dia; semanal: dia_semana; mensal: dia_mes.
    if (periodo === 'semanal' && (c.getInt('dia_semana') || 0) !== diaSemana) continue
    if (periodo === 'mensal' && (c.getInt('dia_mes') || 0) !== diaMes) continue

    let itens = []
    try {
      const rawI = c.get('itens')
      itens = rawI ? JSON.parse(JSON.stringify(rawI)) : []
      if (!Array.isArray(itens)) itens = []
    } catch (_) {
      itens = []
    }

    lista.push({
      id: c.getString('id'),
      nome: c.getString('nome') || '',
      periodo: periodo,
      dia_semana: c.getInt('dia_semana') || 0,
      dia_mes: c.getInt('dia_mes') || 0,
      itens: itens,
    })
  }

  return e.json(200, { data: dia, items: lista })
})

routerAdd('POST', '/backend/v1/ponto/checklist-execucoes', (e) => {
  // ---------- auth helpers (inline) ----------
  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
  }
  function hojeSP() {
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  }
  function funcionarioPorTokenSessao(tok) {
    if (!tok) return null
    try {
      return $app.findFirstRecordByFilter('funcionarios', 'token_sessao = {:t} && ativo = true', {
        t: tok,
      })
    } catch (_) {
      return null
    }
  }
  // ---------- fim auth helpers ----------

  const headerTok = e.request.header.get('X-Ponto-Token') || ''
  const func = funcionarioPorTokenSessao(headerTok)
  if (!func) {
    return e.json(401, { error: 'Sessão inválida ou expirada.' })
  }

  let body = {}
  try {
    body = e.readBody() || {}
  } catch (_) {
    body = {}
  }
  const dia = (body && body.data ? normalizarDataPonto(body.data) : '') || hojeSP()

  let recs = []
  try {
    recs = $app.findRecordsByFilter(
      'funcionarios_checklist_execucoes',
      'funcionario = {:fid} && data >= {:ini} && data <= {:fim}',
      '-created',
      200,
      0,
      { fid: func.id, ini: dia + ' 00:00:00', fim: dia + ' 23:59:59' },
    )
  } catch (_) {
    recs = []
  }

  const lista = []
  for (let i = 0; i < recs.length; i++) {
    const x = recs[i]
    let itens = []
    try {
      const raw = x.get('itens')
      itens = raw ? JSON.parse(JSON.stringify(raw)) : []
      if (!Array.isArray(itens)) itens = []
    } catch (_) {
      itens = []
    }
    lista.push({
      id: x.getString('id'),
      checklist: x.getString('checklist') || '',
      data: x.getString('data') || dia,
      itens: itens,
      observacao: x.getString('observacao') || '',
    })
  }

  return e.json(200, { data: dia, items: lista })
})

routerAdd('POST', '/backend/v1/ponto/checklist-marcar', (e) => {
  // ---------- auth helpers (inline) ----------
  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
  }
  function hojeSP() {
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  }
  function funcionarioPorTokenSessao(tok) {
    if (!tok) return null
    try {
      return $app.findFirstRecordByFilter('funcionarios', 'token_sessao = {:t} && ativo = true', {
        t: tok,
      })
    } catch (_) {
      return null
    }
  }
  // ---------- fim auth helpers ----------

  const headerTok = e.request.header.get('X-Ponto-Token') || ''
  const func = funcionarioPorTokenSessao(headerTok)
  if (!func) {
    return e.json(401, { error: 'Sessão inválida ou expirada.' })
  }

  let body = {}
  try {
    body = e.readBody() || {}
  } catch (_) {
    body = {}
  }
  const checklistId = (body && body.checklist_id) || ''
  const itemIndex = parseInt((body && body.index) || '-1', 10)
  const marcado = !!(body && body.marcado)
  const dia = (body && body.data ? normalizarDataPonto(body.data) : '') || hojeSP()
  if (!checklistId || itemIndex < 0) {
    return e.json(400, { error: 'Dados incompletos.' })
  }

  // O checklist precisa existir
  let checklist = null
  try {
    checklist = $app.findRecordById('funcionarios_checklists', checklistId)
  } catch (_) {
    return e.json(404, { error: 'Checklist não encontrado.' })
  }

  // Execução existente do PRÓPRIO funcionário para o checklist/data
  let exec = null
  try {
    exec = $app.findFirstRecordByFilter(
      'funcionarios_checklist_execucoes',
      'funcionario = {:fid} && checklist = {:cid} && data >= {:ini} && data <= {:fim}',
      {
        fid: func.id,
        cid: checklistId,
        ini: dia + ' 00:00:00',
        fim: dia + ' 23:59:59',
      },
    )
  } catch (_) {
    exec = null
  }

  let itens = []
  if (exec) {
    try {
      const raw = exec.get('itens')
      itens = raw ? JSON.parse(JSON.stringify(raw)) : []
      if (!Array.isArray(itens)) itens = []
    } catch (_) {
      itens = []
    }
    while (itens.length <= itemIndex) itens.push(false)
    itens[itemIndex] = marcado
    exec.set('itens', itens)
    if (body && body.observacao) exec.set('observacao', body.observacao)
    try {
      $app.save(exec)
    } catch (err) {
      return e.json(500, { error: 'Não foi possível salvar o item. Tente novamente.' })
    }
    return e.json(200, {
      ok: true,
      id: exec.getString('id'),
      checklist: checklistId,
      data: dia,
      itens: itens,
    })
  }

  // Cria nova execução do PRÓPRIO funcionário
  const col = $app.findCollectionByNameOrId('funcionarios_checklist_execucoes')
  const novo = new Record(col)
  novo.set('funcionario', func.id)
  novo.set('checklist', checklistId)
  novo.set('data', dia + ' 00:00:00.000Z')
  const nItens = (() => {
    try {
      const rawI = checklist.get('itens')
      const arr = rawI ? JSON.parse(JSON.stringify(rawI)) : []
      return Array.isArray(arr) ? arr.length : 0
    } catch (_) {
      return 0
    }
  })()
  const inicial = []
  for (let i = 0; i < nItens; i++) inicial.push(false)
  if (itemIndex >= inicial.length) {
    while (inicial.length <= itemIndex) inicial.push(false)
  }
  inicial[itemIndex] = marcado
  novo.set('itens', inicial)
  if (body && body.observacao) novo.set('observacao', body.observacao)
  try {
    $app.save(novo)
  } catch (err) {
    return e.json(500, { error: 'Não foi possível salvar o item. Tente novamente.' })
  }

  return e.json(200, {
    ok: true,
    id: novo.getString('id'),
    checklist: checklistId,
    data: dia,
    itens: inicial,
  })
})
