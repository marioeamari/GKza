// ponto_acoes.js — rotas de AÇÃO do ponto autenticadas por X-Ponto-Token
// (entrada/saída/pausa/retomar). Arquivo irmão de ponto_api.js (mesma API
// /backend/v1/ponto/*), separado só para manter arquivos legíveis.
//
// Todas exigem o cabeçalho X-Ponto-Token; o funcionário é localizado por
// token_sessao e a gravação fica restrita AOS REGISTROS DELE.
// Toda rota revalida o token da estação no corpo ({ token }) ao gravar ponto.
// Lógica 100% INLINE (JSVM callbacks em pool separado — sem declarações de topo).

routerAdd('POST', '/backend/v1/ponto/ponto/entrada', (e) => {
  // ---------- auth + estação helpers (inline) ----------
  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
  }
  function hojeSP() {
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  }
  function filtroDia(dia) {
    return '(data >= "' + dia + ' 00:00:00" && data <= "' + dia + ' 23:59:59")'
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
  const estacao = validarEstacaoPorToken((body && body.token) || '')
  if (!estacao) {
    return e.json(401, { error: 'Estação não autorizada.' })
  }

  const dia = hojeSP()
  let pontosDia = []
  try {
    pontosDia = $app.findRecordsByFilter(
      'funcionarios_pontos',
      'funcionario = {:fid} && ' + filtroDia(dia),
      '-created',
      50,
      0,
      { fid: func.id },
    )
  } catch (_) {
    pontosDia = []
  }

  // REGRA (anti-duplicidade, espelha validarPodeRegistrarEntrada):
  // entrada aberta bloqueia nova entrada; dia fechado também bloqueia.
  for (let i = 0; i < pontosDia.length; i++) {
    const saida = pontosDia[i].getString('saida') || ''
    if (!saida.trim()) {
      return e.json(409, {
        error:
          'Já existe uma entrada aberta hoje. Registre a saída ou pausa antes de nova entrada.',
      })
    }
  }
  if (pontosDia.length > 0) {
    return e.json(409, {
      error:
        'O ponto de hoje já foi registrado e finalizado. Para correções, use a edição administrativa.',
    })
  }

  const hora = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(11, 16)

  const col = $app.findCollectionByNameOrId('funcionarios_pontos')
  const novo = new Record(col)
  novo.set('funcionario', func.id)
  novo.set('data', dia + ' 00:00:00.000Z')
  novo.set('entrada', hora)
  novo.set('pausas', [])
  novo.set('origem', 'estacao_qr')
  novo.set('estacao', estacao.id)
  novo.set('local_aproximado', estacao.getString('local_descricao') || '')
  novo.set('editado_por', '')
  novo.set('observacao', (body && body.observacao) || '')
  try {
    $app.save(novo)
  } catch (err) {
    return e.json(500, { error: 'Não foi possível registrar a entrada. Tente novamente.' })
  }

  return e.json(200, {
    ok: true,
    ponto: { id: novo.getString('id'), data: dia, entrada: hora, origem: 'estacao_qr' },
  })
})

routerAdd('POST', '/backend/v1/ponto/ponto/saida', (e) => {
  // ---------- auth + estação helpers (inline) ----------
  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
  }
  function hojeSP() {
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  }
  function filtroDia(dia) {
    return '(data >= "' + dia + ' 00:00:00" && data <= "' + dia + ' 23:59:59")'
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
  const estacao = validarEstacaoPorToken((body && body.token) || '')
  if (!estacao) {
    return e.json(401, { error: 'Estação não autorizada.' })
  }

  const dia = hojeSP()
  let aberto = null
  try {
    const pontosDia = $app.findRecordsByFilter(
      'funcionarios_pontos',
      'funcionario = {:fid} && ' + filtroDia(dia),
      '-created',
      50,
      0,
      { fid: func.id },
    )
    for (let i = 0; i < pontosDia.length; i++) {
      const saida = pontosDia[i].getString('saida') || ''
      if (!saida.trim()) {
        aberto = pontosDia[i]
        break
      }
    }
  } catch (_) {
    aberto = null
  }

  if (!aberto) {
    return e.json(409, { error: 'Nenhuma entrada aberta encontrada para registrar a saída.' })
  }

  const hora = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(11, 16)
  aberto.set('saida', hora)
  if (body && body.observacao) aberto.set('observacao', body.observacao)
  try {
    $app.save(aberto)
  } catch (err) {
    return e.json(500, { error: 'Não foi possível registrar a saída. Tente novamente.' })
  }

  return e.json(200, {
    ok: true,
    ponto: {
      id: aberto.getString('id'),
      data: dia,
      entrada: aberto.getString('entrada') || '',
      saida: hora,
      origem: 'estacao_qr',
    },
  })
})

routerAdd('POST', '/backend/v1/ponto/ponto/pausa', (e) => {
  // ---------- auth + estação helpers (inline) ----------
  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
  }
  function hojeSP() {
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  }
  function filtroDia(dia) {
    return '(data >= "' + dia + ' 00:00:00" && data <= "' + dia + ' 23:59:59")'
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
  const estacao = validarEstacaoPorToken((body && body.token) || '')
  if (!estacao) {
    return e.json(401, { error: 'Estação não autorizada.' })
  }

  const dia = hojeSP()
  let aberto = null
  try {
    const pontosDia = $app.findRecordsByFilter(
      'funcionarios_pontos',
      'funcionario = {:fid} && ' + filtroDia(dia),
      '-created',
      50,
      0,
      { fid: func.id },
    )
    for (let i = 0; i < pontosDia.length; i++) {
      const saida = pontosDia[i].getString('saida') || ''
      if (!saida.trim()) {
        aberto = pontosDia[i]
        break
      }
    }
  } catch (_) {
    aberto = null
  }

  if (!aberto) {
    return e.json(409, { error: 'Nenhuma entrada aberta encontrada para registrar a saída.' })
  }
  // Já existe pausa aberta? Recusa (sem pausa duplicada).
  let pausas = []
  try {
    const raw = aberto.get('pausas')
    pausas = raw ? JSON.parse(JSON.stringify(raw)) : []
    if (!Array.isArray(pausas)) pausas = []
  } catch (_) {
    pausas = []
  }
  for (let i = 0; i < pausas.length; i++) {
    if (pausas[i] && pausas[i].inicio && !pausas[i].fim) {
      return e.json(409, { error: 'Já existe uma pausa em andamento.' })
    }
  }

  const hora = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(11, 16)
  pausas.push({ inicio: hora })
  aberto.set('pausas', pausas)
  try {
    $app.save(aberto)
  } catch (err) {
    return e.json(500, { error: 'Não foi possível registrar a pausa. Tente novamente.' })
  }

  return e.json(200, {
    ok: true,
    ponto: { id: aberto.getString('id'), data: dia, pausas: pausas, origem: 'estacao_qr' },
  })
})

routerAdd('POST', '/backend/v1/ponto/ponto/retomar', (e) => {
  // ---------- auth + estação helpers (inline) ----------
  function normalizarDataPonto(s) {
    return s ? ('' + s).trim().slice(0, 10) : ''
  }
  function hojeSP() {
    const d = new Date(Date.now() - 3 * 3600 * 1000)
    return d.toISOString().slice(0, 10)
  }
  function filtroDia(dia) {
    return '(data >= "' + dia + ' 00:00:00" && data <= "' + dia + ' 23:59:59")'
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
  const estacao = validarEstacaoPorToken((body && body.token) || '')
  if (!estacao) {
    return e.json(401, { error: 'Estação não autorizada.' })
  }

  const dia = hojeSP()
  let aberto = null
  try {
    const pontosDia = $app.findRecordsByFilter(
      'funcionarios_pontos',
      'funcionario = {:fid} && ' + filtroDia(dia),
      '-created',
      50,
      0,
      { fid: func.id },
    )
    for (let i = 0; i < pontosDia.length; i++) {
      const saida = pontosDia[i].getString('saida') || ''
      if (!saida.trim()) {
        aberto = pontosDia[i]
        break
      }
    }
  } catch (_) {
    aberto = null
  }

  if (!aberto) {
    return e.json(409, { error: 'Nenhuma entrada aberta encontrada para retomar da pausa.' })
  }

  let pausas = []
  try {
    const raw = aberto.get('pausas')
    pausas = raw ? JSON.parse(JSON.stringify(raw)) : []
    if (!Array.isArray(pausas)) pausas = []
  } catch (_) {
    pausas = []
  }

  let haviaPausaAberta = false
  for (let i = pausas.length - 1; i >= 0; i--) {
    if (pausas[i] && pausas[i].inicio && !pausas[i].fim) {
      pausas[i].fim = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(11, 16)
      haviaPausaAberta = true
      break
    }
  }
  if (!haviaPausaAberta) {
    return e.json(409, { error: 'Nenhuma pausa em andamento para retomar.' })
  }

  aberto.set('pausas', pausas)
  try {
    $app.save(aberto)
  } catch (err) {
    return e.json(500, { error: 'Não foi possível retomar da pausa. Tente novamente.' })
  }

  return e.json(200, {
    ok: true,
    ponto: { id: aberto.getString('id'), data: dia, pausas: pausas, origem: 'estacao_qr' },
  })
})
