// ponto_consultas.js — rotas de CONSULTA do ponto: pontos-dia, histórico,
// confirmações, dívidas e folha/conferência. Arquivo irmão de ponto_api.js
// (mesma API /backend/v1/ponto/*), separado só para manter arquivos legíveis.
//
// Todas exigem o cabeçalho X-Ponto-Token; o funcionário é localizado por
// token_sessao e a leitura/gravação fica restrita AOS REGISTROS DELE.
// Sem resposta de dados pessoais/financeiros além do necessário:
//  - /folha devolve os valores da própria folha do colaborador (necessários na
//    tela) e os 3 campos de conferência da migração 0152.

routerAdd('POST', '/backend/v1/ponto/pontos-dia', (e) => {
  // ---------- auth helpers (inline) ----------
  function hojeSP() {
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  }
  function filtroDia(dia) {
    return '(data >= "' + dia + ' 00:00:00" && data <= "' + dia + ' 23:59:59")'
  }
  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
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
  function horasDecimais(entrada, saida, pausas, horaAlmocoConta) {
    function toMin(hhmm) {
      const parts = ('' + hhmm).split(':')
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10)
    }
    let total = toMin(saida) - toMin(entrada)
    if (!horaAlmocoConta && pausas && pausas.length) {
      for (let i = 0; i < pausas.length; i++) {
        const p = pausas[i]
        if (p && p.inicio && p.fim) total -= toMin(p.fim) - toMin(p.inicio)
      }
    }
    return total / 60
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

  let pontosDia = []
  try {
    pontosDia = $app.findRecordsByFilter(
      'funcionarios_pontos',
      'funcionario = {:fid} && ' + filtroDia(dia),
      'created',
      50,
      0,
      { fid: func.id },
    )
  } catch (_) {
    pontosDia = []
  }

  const lista = []
  let totalMin = 0
  for (let i = 0; i < pontosDia.length; i++) {
    const p = pontosDia[i]
    const entrada = p.getString('entrada') || ''
    const saida = p.getString('saida') || ''
    let pausas = []
    try {
      const raw = p.get('pausas')
      pausas = raw ? JSON.parse(JSON.stringify(raw)) : []
      if (!Array.isArray(pausas)) pausas = []
    } catch (_) {
      pausas = []
    }
    let horas = 0
    if (saida) {
      horas = horasDecimais(entrada, saida, pausas, func.getBool('hora_almoco_conta'))
      totalMin += Math.round(horas * 60)
    }
    lista.push({
      id: p.getString('id'),
      data: p.getString('data') || dia,
      entrada: entrada,
      saida: saida,
      pausas: pausas,
      origem: p.getString('origem') || '',
      estacao: p.getString('estacao') || '',
      observacao: p.getString('observacao') || '',
      horas: saida ? Math.round(horas * 100) / 100 : 0,
    })
  }

  return e.json(200, {
    data: dia,
    pontos: lista,
    minutos_total: totalMin,
    horas_total: Math.round((totalMin / 60) * 100) / 100,
  })
})

routerAdd('POST', '/backend/v1/ponto/pontos-historico', (e) => {
  // ---------- auth helpers (inline) ----------
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
  const page = Math.max(1, parseInt((body && body.page) || '1', 10) || 1)
  const perPageRaw = parseInt((body && body.per_page) || '30', 10) || 30
  const perPage = Math.min(100, Math.max(1, perPageRaw))

  let result = null
  try {
    result = $app.findRecordsByFilter(
      'funcionarios_pontos',
      'funcionario = {:fid}',
      '-data',
      perPage,
      (page - 1) * perPage,
      { fid: func.id },
    )
  } catch (_) {
    result = []
  }

  const lista = []
  for (let i = 0; i < result.length; i++) {
    const p = result[i]
    let pausas = []
    try {
      const raw = p.get('pausas')
      pausas = raw ? JSON.parse(JSON.stringify(raw)) : []
      if (!Array.isArray(pausas)) pausas = []
    } catch (_) {
      pausas = []
    }
    lista.push({
      id: p.getString('id'),
      data: p.getString('data') || '',
      entrada: p.getString('entrada') || '',
      saida: p.getString('saida') || '',
      pausas: pausas,
      origem: p.getString('origem') || '',
      observacao: p.getString('observacao') || '',
    })
  }

  return e.json(200, { page: page, per_page: perPage, items: lista })
})

routerAdd('POST', '/backend/v1/ponto/confirmacoes-listar', (e) => {
  // ---------- auth helpers (inline) ----------
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

  let recs = []
  try {
    recs = $app.findRecordsByFilter(
      'funcionarios_confirmacoes',
      'funcionario = {:fid} && confirmado != true && divergencia_apontada != true',
      '-data',
      100,
      0,
      { fid: func.id },
    )
  } catch (_) {
    recs = []
  }

  const lista = []
  for (let i = 0; i < recs.length; i++) {
    lista.push({
      id: recs[i].getString('id'),
      data: recs[i].getString('data') || '',
      confirmado: recs[i].getBool('confirmado'),
      divergencia_apontada: recs[i].getBool('divergencia_apontada'),
      motivo_divergencia: recs[i].getString('motivo_divergencia') || '',
      observacao: recs[i].getString('observacao') || '',
    })
  }

  return e.json(200, { items: lista })
})

routerAdd('POST', '/backend/v1/ponto/confirmacao-salvar', (e) => {
  // ---------- auth helpers (inline) ----------
  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
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
  const data = normalizarDataPonto((body && body.data) || '')
  if (!data) {
    return e.json(400, { error: 'Data é obrigatória.' })
  }
  const divergencia = !!(body && body.divergencia)
  const motivo = (body && body.motivo) || ''
  if (divergencia && !motivo) {
    return e.json(400, { error: 'Motivo é obrigatório ao apontar divergência.' })
  }

  // Localiza o registro do PRÓPRIO funcionário para a data (unique idx func+data)
  let rec = null
  try {
    rec = $app.findFirstRecordByFilter(
      'funcionarios_confirmacoes',
      'funcionario = {:fid} && data >= {:ini} && data <= {:fim}',
      {
        fid: func.id,
        ini: data + ' 00:00:00',
        fim: data + ' 23:59:59',
      },
    )
  } catch (_) {
    rec = null
  }
  if (!rec) {
    return e.json(404, { error: 'Nenhuma confirmação pendente para esta data.' })
  }
  if (rec.getBool('confirmado') || rec.getBool('divergencia_apontada')) {
    return e.json(409, { error: 'Este dia já foi confirmado.' })
  }

  rec.set('confirmado', !divergencia)
  rec.set('confirmado_em', new Date().toISOString())
  rec.set('divergencia_apontada', divergencia)
  if (motivo) rec.set('motivo_divergencia', motivo)
  try {
    $app.save(rec)
  } catch (err) {
    return e.json(500, { error: 'Não foi possível salvar a confirmação. Tente novamente.' })
  }

  return e.json(200, {
    ok: true,
    id: rec.getString('id'),
    data: data,
    confirmado: !divergencia,
    divergencia_apontada: divergencia,
  })
})

routerAdd('POST', '/backend/v1/ponto/dividas', (e) => {
  // ---------- auth helpers (inline) ----------
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

  let recs = []
  try {
    recs = $app.findRecordsByFilter(
      'funcionarios_dividas',
      'funcionario = {:fid} && ativa = true',
      '-created',
      100,
      0,
      { fid: func.id },
    )
  } catch (_) {
    recs = []
  }

  const lista = []
  for (let i = 0; i < recs.length; i++) {
    lista.push({
      id: recs[i].getString('id'),
      descricao: recs[i].getString('descricao') || '',
      valor_total: recs[i].getFloat('valor_total') || 0,
      saldo_atual: recs[i].getFloat('saldo_atual') || 0,
      percentual_abatimento: recs[i].getFloat('percentual_abatimento') || 0,
    })
  }

  return e.json(200, { items: lista })
})

routerAdd('POST', '/backend/v1/ponto/folha', (e) => {
  // ---------- auth helpers (inline) ----------
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

  let recs = []
  try {
    recs = $app.findRecordsByFilter(
      'funcionarios_folhas',
      'funcionario = {:fid}',
      '-periodo_inicio',
      24,
      0,
      { fid: func.id },
    )
  } catch (_) {
    recs = []
  }

  const lista = []
  for (let i = 0; i < recs.length; i++) {
    const f = recs[i]
    let descontos = []
    try {
      const raw = f.get('descontos')
      descontos = raw ? JSON.parse(JSON.stringify(raw)) : []
      if (!Array.isArray(descontos)) descontos = []
    } catch (_) {
      descontos = []
    }
    let diasPendentes = []
    try {
      const raw2 = f.get('dias_pendentes_fechamento')
      diasPendentes = raw2 ? JSON.parse(JSON.stringify(raw2)) : []
      if (!Array.isArray(diasPendentes)) diasPendentes = []
    } catch (_) {
      diasPendentes = []
    }
    lista.push({
      id: f.getString('id'),
      periodo_inicio: f.getString('periodo_inicio') || '',
      periodo_fim: f.getString('periodo_fim') || '',
      ganho_total: f.getFloat('ganho_total') || 0,
      descontos: descontos,
      divida_semanal: f.getFloat('divida_semanal') || 0,
      a_receber: f.getFloat('a_receber') || 0,
      quitada: f.getBool('quitada'),
      data_quitacao: f.getString('data_quitacao') || '',
      status_conferencia_colaborador: f.getString('status_conferencia_colaborador') || '',
      conferido_colaborador_em: f.getString('conferido_colaborador_em') || '',
      motivo_divergencia_colaborador: f.getString('motivo_divergencia_colaborador') || '',
      dias_pendentes_fechamento: diasPendentes,
    })
  }

  return e.json(200, { items: lista })
})

routerAdd('POST', '/backend/v1/ponto/folha-conferir', (e) => {
  // ---------- auth helpers (inline) ----------
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
  const folhaId = (body && body.folha_id) || ''
  const status = (body && body.status) || ''
  const motivo = (body && body.motivo) || ''
  if (!folhaId || !status) {
    return e.json(400, { error: 'Dados incompletos.' })
  }
  if (status !== 'confirmado' && status !== 'divergente') {
    return e.json(400, { error: 'Status inválido.' })
  }
  if (status === 'divergente' && !motivo) {
    return e.json(400, { error: 'Motivo é obrigatório ao apontar divergência.' })
  }

  let folha = null
  try {
    folha = $app.findRecordById('funcionarios_folhas', folhaId)
  } catch (_) {
    return e.json(404, { error: 'Folha não encontrada.' })
  }
  // RESTRIÇÃO DE DONO: só a folha do próprio funcionário.
  if (folha.getString('funcionario') !== func.id) {
    return e.json(404, { error: 'Folha não encontrada.' })
  }

  // SOMENTE os 3 campos de conferência da migração 0152. Qualquer tentativa
  // de tocar outro campo é recusada (403).
  const permitidos = {
    status_conferencia_colaborador: status === 'divergente' ? 'divergente' : 'confirmado',
    conferido_colaborador_em: new Date().toISOString(),
    motivo_divergencia_colaborador: status === 'divergente' ? motivo : '',
  }
  if (body && Object.keys(body).length > 4) {
    // folha_id, status, motivo + campo extra qualquer → 403
    const permitidosKeys = ['folha_id', 'status', 'motivo']
    for (let k = 0; k < Object.keys(body).length; k++) {
      if (permitidosKeys.indexOf(Object.keys(body)[k]) === -1) {
        return e.json(403, { error: 'Campos de conferência não permitidos.' })
      }
    }
  }

  folha.set('status_conferencia_colaborador', permitidos.status_conferencia_colaborador)
  folha.set('conferido_colaborador_em', permitidos.conferido_colaborador_em)
  folha.set('motivo_divergencia_colaborador', permitidos.motivo_divergencia_colaborador)
  try {
    $app.save(folha)
  } catch (err) {
    return e.json(500, { error: 'Não foi possível registrar a conferência. Tente novamente.' })
  }

  return e.json(200, {
    ok: true,
    id: folha.getString('id'),
    status_conferencia_colaborador: permitidos.status_conferencia_colaborador,
  })
})
