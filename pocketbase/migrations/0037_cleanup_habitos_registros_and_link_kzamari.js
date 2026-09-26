/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // TAREFA 2: Vincular o hábito "Revisão Financeira Diária" à empresa KzaMari (id c8v8eg0errmelt6)
    const kzaMariId = 'c8v8eg0errmelt6'
    try {
      let habitoRev = null
      try {
        habitoRev = app.findFirstRecordByData('metas_habitos', 'id', '4yaw6mr5t706qe4')
      } catch (_) {
        try {
          habitoRev = app.findFirstRecordByData(
            'metas_habitos',
            'nome',
            'Revisão Financeira Diária',
          )
        } catch (_) {}
      }

      if (habitoRev) {
        habitoRev.set('contexto_tipo', 'empresa')
        habitoRev.set('empresa', kzaMariId)
        app.save(habitoRev)
        console.log(
          '[Migration 0037] Hábito "Revisão Financeira Diária" vinculado à empresa KzaMari (' +
            kzaMariId +
            ').',
        )
      }
    } catch (err) {
      console.log('[Migration 0037] Erro ao vincular hábito à empresa KzaMari:', err)
    }

    // TAREFA 1: Garantir dados e higienização genérica de marcações
    const regCol = app.findCollectionByNameOrId('metas_habitos_registros')

    // Registros legítimos que devem permanecer (somente dias programados e data <= hoje 2026-09-26)
    // Marcações inconsistentes que NÃO foram incluídas / serão eliminadas:
    // - Treino Matinal (tlx2wccyrbdtvdt): 2026-09-19 (sábado, dia 6) e 2026-09-20 (domingo, dia 0) - dias não programados [dias_semana: seg-sex 1..5]
    // - Revisão Financeira Diária (4yaw6mr5t706qe4): 2026-09-20 (domingo, dia 0) - dia não programado [dias_semana: seg-sab 1..6]
    // - Academia (tcy1bmksuozadbb): 2026-09-28 (data futura > 2026-09-26)
    const registrosLegitimos = [
      // Treino Matinal & Alongamento (tlx2wccyrbdtvdt)
      { habito: 'tlx2wccyrbdtvdt', data: '2026-09-24', status: 'feito' },
      { habito: 'tlx2wccyrbdtvdt', data: '2026-09-23', status: 'feito' },
      { habito: 'tlx2wccyrbdtvdt', data: '2026-09-22', status: 'feito' },
      { habito: 'tlx2wccyrbdtvdt', data: '2026-09-21', status: 'dispensado' },
      { habito: 'tlx2wccyrbdtvdt', data: '2026-09-18', status: 'feito' },

      // Revisão Financeira Diária (4yaw6mr5t706qe4)
      { habito: '4yaw6mr5t706qe4', data: '2026-09-24', status: 'feito' },
      { habito: '4yaw6mr5t706qe4', data: '2026-09-23', status: 'nao_feito' },
      { habito: '4yaw6mr5t706qe4', data: '2026-09-22', status: 'feito' },
      { habito: '4yaw6mr5t706qe4', data: '2026-09-21', status: 'feito' },
      { habito: '4yaw6mr5t706qe4', data: '2026-09-19', status: 'feito' },
      { habito: '4yaw6mr5t706qe4', data: '2026-09-18', status: 'feito' },

      // Leitura & Desenvolvimento Pessoal (vs6abn28xfb2nbp)
      { habito: 'vs6abn28xfb2nbp', data: '2026-09-24', status: 'feito' },
      { habito: 'vs6abn28xfb2nbp', data: '2026-09-25', status: 'feito' },

      // Dormir (gwgx42ddb1e5yt1)
      { habito: 'gwgx42ddb1e5yt1', data: '2026-09-25', status: 'feito' },
    ]

    for (let i = 0; i < registrosLegitimos.length; i++) {
      const reg = registrosLegitimos[i]
      try {
        const filter = "habito = '" + reg.habito + "' && data = '" + reg.data + "'"
        const existing = app.findRecordsByFilter('metas_habitos_registros', filter, '', 1, 0)
        if (existing.length === 0) {
          const r = new Record(regCol)
          r.set('habito', reg.habito)
          r.set('data', reg.data)
          r.set('status', reg.status)
          app.save(r)
        }
      } catch (e) {
        console.log('[Migration 0037] Aviso ao garantir registro legítimo:', e)
      }
    }

    // ROTINA GENÉRICA DE HIGIENIZAÇÃO:
    // Critérios:
    // (a) marcações em dia não programado do hábito (regras de dias_semana)
    // (b) marcações com data futura em relação a hoje (data > '2026-09-26')
    const todayStr = '2026-09-26'
    console.log(
      '[Migration 0037] Executando varredura genérica de higienização. Data de hoje: ' + todayStr,
    )

    const allHabitos = app.findRecordsByFilter('metas_habitos', 'id != ""', '', 500, 0)
    const habitosMap = {}
    for (let h = 0; h < allHabitos.length; h++) {
      const hab = allHabitos[h]
      let dias = []
      try {
        const raw = hab.get('dias_semana')
        if (Array.isArray(raw)) dias = raw
        else if (typeof raw === 'string') dias = JSON.parse(raw)
      } catch (_) {
        dias = []
      }
      habitosMap[hab.id] = {
        id: hab.id,
        nome: hab.getString('nome'),
        dias_semana: dias,
      }
    }

    const todosRegistros = app.findRecordsByFilter(
      'metas_habitos_registros',
      'id != ""',
      '',
      5000,
      0,
    )
    console.log(
      '[Migration 0037] Total de marcações encontradas para análise: ' + todosRegistros.length,
    )

    const removidosPorHabito = {}
    let totalRemovidos = 0

    for (let j = 0; j < todosRegistros.length; j++) {
      const item = todosRegistros[j]
      const hId = item.getString('habito')
      const dataStr = item.getString('data')
      const habInfo = habitosMap[hId]

      let deveRemover = false
      let motivo = ''

      // (b) Data no futuro (> hoje)
      if (dataStr > todayStr) {
        deveRemover = true
        motivo = 'Marcação com data futura (' + dataStr + ' > ' + todayStr + ')'
      } else if (habInfo) {
        // (a) Dia da semana não programado
        const parts = dataStr.split('-')
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10)
          const m = parseInt(parts[1], 10) - 1
          const d = parseInt(parts[2], 10)
          const dObj = new Date(Date.UTC(y, m, d, 12, 0, 0))
          const dayOfWeek = dObj.getUTCDay() // 0=Dom, 1=Seg, ..., 6=Sab
          const isProg =
            Array.isArray(habInfo.dias_semana) && habInfo.dias_semana.indexOf(dayOfWeek) !== -1

          if (!isProg) {
            deveRemover = true
            motivo =
              'Marcação em dia não programado (dia da semana ' + dayOfWeek + ' em ' + dataStr + ')'
          }
        }
      }

      if (deveRemover) {
        const nomeHab = habInfo ? habInfo.nome : hId
        if (!removidosPorHabito[nomeHab]) {
          removidosPorHabito[nomeHab] = []
        }
        removidosPorHabito[nomeHab].push({
          id: item.id,
          data: dataStr,
          motivo: motivo,
        })
        app.delete(item)
        totalRemovidos++
      }
    }

    console.log(
      '[Migration 0037] Higienização concluída com sucesso! Total removidos: ' + totalRemovidos,
    )
    const habKeys = Object.keys(removidosPorHabito)
    for (let k = 0; k < habKeys.length; k++) {
      const kNome = habKeys[k]
      const lista = removidosPorHabito[kNome]
      console.log(' -> Hábito "' + kNome + '": ' + lista.length + ' marcação(ões) removida(s):')
      for (let l = 0; l < lista.length; l++) {
        console.log('     * [' + lista[l].id + '] data ' + lista[l].data + ' - ' + lista[l].motivo)
      }
    }
  },
  (app) => {},
)
