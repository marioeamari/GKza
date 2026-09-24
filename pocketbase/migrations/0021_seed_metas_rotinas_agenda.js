/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    function find(collection, field, value) {
      try {
        return app.findFirstRecordByData(collection, field, value)
      } catch (_) {
        return null
      }
    }

    const pRafa = find('pessoas', 'nome', 'Rafael Nogueira')
    const empEstrela = find('empresas', 'nome_fantasia', 'Estrela Dourada')

    // 1. Hábitos de exemplo
    const habitosCol = app.findCollectionByNameOrId('metas_habitos')
    const regCol = app.findCollectionByNameOrId('metas_habitos_registros')

    let habito1 = find('metas_habitos', 'nome', 'Treino Matinal & Alongamento')
    if (!habito1) {
      habito1 = new Record(habitosCol)
      habito1.set('nome', 'Treino Matinal & Alongamento')
      habito1.set('descricao', '45 minutos de caminhada rápida ou corrida e 10 min de alongamento.')
      habito1.set('contexto_tipo', 'pessoal')
      if (pRafa) habito1.set('pessoa', pRafa.id)
      habito1.set('dias_semana', [1, 2, 3, 4, 5]) // Seg a Sex
      habito1.set('horario', '06:30')
      habito1.set('data_inicio', '2025-01-01 00:00:00.000Z')
      habito1.set('ativo', true)
      habito1.set('cor', '#DF5830')
      app.save(habito1)
    }

    let habito2 = find('metas_habitos', 'nome', 'Revisão Financeira Diária')
    if (!habito2) {
      habito2 = new Record(habitosCol)
      habito2.set('nome', 'Revisão Financeira Diária')
      habito2.set(
        'descricao',
        'Conferir extratos bancários, vendas de marketplaces e pendências de triagem.',
      )
      habito2.set('contexto_tipo', 'empresa')
      if (empEstrela) habito2.set('empresa', empEstrela.id)
      habito2.set('dias_semana', [1, 2, 3, 4, 5, 6]) // Seg a Sab
      habito2.set('horario', '09:00')
      habito2.set('data_inicio', '2025-01-01 00:00:00.000Z')
      habito2.set('ativo', true)
      habito2.set('cor', '#1E6F5C')
      app.save(habito2)
    }

    let habito3 = find('metas_habitos', 'nome', 'Leitura & Desenvolvimento Pessoal')
    if (!habito3) {
      habito3 = new Record(habitosCol)
      habito3.set('nome', 'Leitura & Desenvolvimento Pessoal')
      habito3.set('descricao', 'Ler 20 páginas de livro de negócios ou finanças.')
      habito3.set('contexto_tipo', 'pessoal')
      if (pRafa) habito3.set('pessoa', pRafa.id)
      habito3.set('dias_semana', [0, 1, 2, 3, 4, 5, 6]) // Todos os dias
      habito3.set('horario', '21:30')
      habito3.set('data_inicio', '2025-01-01 00:00:00.000Z')
      habito3.set('ativo', true)
      habito3.set('cor', '#4C3A8C')
      app.save(habito3)
    }

    // Registros recentes para visualização na grade mensal (últimos 7 dias)
    const today = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(today.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]

      // Treino: intercalar feito e dispensado
      try {
        const filter = `habito = '${habito1.id}' && data = '${dateStr}'`
        const ex = app.findRecordsByFilter('metas_habitos_registros', filter, '', 1, 0)
        if (ex.length === 0) {
          const r = new Record(regCol)
          r.set('habito', habito1.id)
          r.set('data', dateStr)
          r.set('status', i === 3 ? 'dispensado' : i === 5 ? 'nao_feito' : 'feito')
          app.save(r)
        }
      } catch (_) {}

      // Revisão Financeira
      try {
        const filter2 = `habito = '${habito2.id}' && data = '${dateStr}'`
        const ex2 = app.findRecordsByFilter('metas_habitos_registros', filter2, '', 1, 0)
        if (ex2.length === 0) {
          const r2 = new Record(regCol)
          r2.set('habito', habito2.id)
          r2.set('data', dateStr)
          r2.set('status', i === 1 ? 'nao_feito' : 'feito')
          app.save(r2)
        }
      } catch (_) {}
    }

    // 2. Projetos de exemplo
    const projCol = app.findCollectionByNameOrId('projetos')
    let proj1 = find('projetos', 'nome', 'Expansão de Canais Online & Marketplaces')
    if (!proj1) {
      proj1 = new Record(projCol)
      proj1.set('nome', 'Expansão de Canais Online & Marketplaces')
      proj1.set(
        'objetivo',
        'Aumentar a presença em marketplaces digitais e otimizar margens operacionais.',
      )
      proj1.set('contexto_tipo', 'empresa')
      if (empEstrela) proj1.set('empresa', empEstrela.id)
      proj1.set('prazo', '2025-06-30 00:00:00.000Z')
      proj1.set('status', 'em_andamento')
      proj1.set('cor', '#DF5830')
      app.save(proj1)
    }

    let proj2 = find('projetos', 'nome', 'Planejamento Financeiro Familiar & Férias')
    if (!proj2) {
      proj2 = new Record(projCol)
      proj2.set('nome', 'Planejamento Financeiro Familiar & Férias')
      proj2.set(
        'objetivo',
        'Organizar a reserva de emergência e o fundo de viagem de final de ano.',
      )
      proj2.set('contexto_tipo', 'pessoal')
      if (pRafa) proj2.set('pessoa', pRafa.id)
      proj2.set('prazo', '2025-12-15 00:00:00.000Z')
      proj2.set('status', 'em_andamento')
      proj2.set('cor', '#2B5BA8')
      app.save(proj2)
    }

    // 3. Tarefas de exemplo
    const tarCol = app.findCollectionByNameOrId('tarefas')
    const tarefasSeed = [
      {
        titulo: 'Mapear comissões e taxas dos novos marketplaces',
        projeto: proj1.id,
        contexto_tipo: 'empresa',
        empresa: empEstrela ? empEstrela.id : '',
        etapa: 'concluida',
        prioridade: 'alta',
        prazo: '2025-04-10 00:00:00.000Z',
        checklist: [
          { id: '1', texto: 'Baixar tabela Shopee', feito: true },
          { id: '2', texto: 'Baixar tabela Mercado Livre', feito: true },
          { id: '3', texto: 'Cadastrar no ERP GKza', feito: true },
        ],
        ordem: 1,
      },
      {
        titulo: 'Integrar relatórios de vendas e repasses semanais',
        projeto: proj1.id,
        contexto_tipo: 'empresa',
        empresa: empEstrela ? empEstrela.id : '',
        etapa: 'em_progresso',
        prioridade: 'urgente',
        prazo: '2025-05-15 00:00:00.000Z',
        checklist: [
          { id: '1', texto: 'Configurar conciliação automática', feito: true },
          { id: '2', texto: 'Validar repasses pendentes', feito: false },
        ],
        ordem: 2,
      },
      {
        titulo: 'Revisar orçamento do plano de saúde familiar',
        contexto_tipo: 'pessoal',
        pessoa: pRafa ? pRafa.id : '',
        etapa: 'a_fazer',
        prioridade: 'media',
        prazo: '2025-04-20 00:00:00.000Z',
        checklist: [
          { id: '1', texto: 'Cotar operadoras alternativas', feito: false },
          { id: '2', texto: 'Calcular impacto mensal', feito: false },
        ],
        ordem: 1,
      },
    ]

    for (let i = 0; i < tarefasSeed.length; i++) {
      const item = tarefasSeed[i]
      const existing = find('tarefas', 'titulo', item.titulo)
      if (!existing) {
        const t = new Record(tarCol)
        t.set('titulo', item.titulo)
        if (item.projeto) t.set('projeto', item.projeto)
        t.set('contexto_tipo', item.contexto_tipo)
        if (item.empresa) t.set('empresa', item.empresa)
        if (item.pessoa) t.set('pessoa', item.pessoa)
        t.set('etapa', item.etapa)
        t.set('prioridade', item.prioridade)
        t.set('prazo', item.prazo)
        t.set('checklist', item.checklist)
        t.set('ordem', item.ordem)
        app.save(t)
      }
    }

    // 4. Metas de exemplo (uma calculada a partir de tarefas, uma manual)
    const metasCol = app.findCollectionByNameOrId('metas_metas')
    let meta1 = find('metas_metas', 'titulo', 'Consolidar Operação Multi-Marketplace')
    if (!meta1) {
      meta1 = new Record(metasCol)
      meta1.set('titulo', 'Consolidar Operação Multi-Marketplace')
      meta1.set(
        'descricao',
        'Concluir todos os marcos de integração operacional dos canais de vendas.',
      )
      meta1.set('contexto_tipo', 'empresa')
      if (empEstrela) meta1.set('empresa', empEstrela.id)
      meta1.set('prazo', '2025-06-30 00:00:00.000Z')
      meta1.set('tipo_progresso', 'tarefas')
      meta1.set('projeto', proj1.id)
      meta1.set('alvo_descricao', '100% das etapas do projeto entregues')
      meta1.set('status', 'em_andamento')
      meta1.set('cor', '#DF5830')
      app.save(meta1)
    }

    let meta2 = find('metas_metas', 'titulo', 'Reserva de Emergência Familiar 6 Meses')
    if (!meta2) {
      meta2 = new Record(metasCol)
      meta2.set('titulo', 'Reserva de Emergência Familiar 6 Meses')
      meta2.set('descricao', 'Alcançar R$ 60.000 guardados em investimentos de liquidez diária.')
      meta2.set('contexto_tipo', 'pessoal')
      if (pRafa) meta2.set('pessoa', pRafa.id)
      meta2.set('prazo', '2025-12-31 00:00:00.000Z')
      meta2.set('tipo_progresso', 'manual')
      meta2.set('progresso_manual', 65)
      meta2.set('alvo_descricao', 'R$ 60.000,00 guardados')
      meta2.set('status', 'em_andamento')
      meta2.set('cor', '#2B5BA8')
      app.save(meta2)
    }

    // 5. Eventos de Agenda de exemplo
    const agendaCol = app.findCollectionByNameOrId('agenda_eventos')
    let ev1 = find('agenda_eventos', 'titulo', 'Reunião Semanal de Alinhamento e Metas')
    if (!ev1) {
      ev1 = new Record(agendaCol)
      ev1.set('titulo', 'Reunião Semanal de Alinhamento e Metas')
      ev1.set('descricao', 'Alinhamento com equipe de vendas e checagem de fluxo de caixa.')
      ev1.set('contexto_tipo', 'empresa')
      if (empEstrela) ev1.set('empresa', empEstrela.id)
      const evDate = new Date()
      evDate.setHours(10, 0, 0, 0)
      const evDateFim = new Date(evDate.getTime() + 60 * 60 * 1000)
      ev1.set('data_inicio', evDate.toISOString())
      ev1.set('data_fim', evDateFim.toISOString())
      ev1.set('local', 'Sala de Reuniões / Google Meet')
      ev1.set('recorrencia', 'semanal')
      ev1.set('status', 'ativo')
      ev1.set('origem', 'sistema')
      ev1.set('cor', '#DF5830')
      app.save(ev1)
    }

    let ev2 = find('agenda_eventos', 'titulo', 'Consulta Médica de Rotina')
    if (!ev2) {
      ev2 = new Record(agendaCol)
      ev2.set('titulo', 'Consulta Médica de Rotina')
      ev2.set('descricao', 'Checkup semestral')
      ev2.set('contexto_tipo', 'pessoal')
      if (pRafa) ev2.set('pessoa', pRafa.id)
      const evDate2 = new Date()
      evDate2.setDate(evDate2.getDate() + 2)
      evDate2.setHours(14, 30, 0, 0)
      const evDateFim2 = new Date(evDate2.getTime() + 45 * 60 * 1000)
      ev2.set('data_inicio', evDate2.toISOString())
      ev2.set('data_fim', evDateFim2.toISOString())
      ev2.set('local', 'Clínica São Paulo - Sala 302')
      ev2.set('recorrencia', 'nenhuma')
      ev2.set('status', 'ativo')
      ev2.set('origem', 'sistema')
      ev2.set('cor', '#2B5BA8')
      app.save(ev2)
    }
  },
  (app) => {},
)
