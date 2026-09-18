migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    // 1. Coleção contexto_grupos
    const grupos = new Collection({
      name: 'contexto_grupos',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: adminOrManager,
      updateRule: adminOrManager,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 120 },
        { name: 'cor', type: 'text', required: false, max: 20 },
        { name: 'observacoes', type: 'text', required: false, max: 2000 },
        { name: 'ordem', type: 'number', required: false, onlyInt: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_contexto_grupos_nome ON contexto_grupos (nome)',
        'CREATE INDEX idx_contexto_grupos_ordem ON contexto_grupos (ordem)',
      ],
    })
    app.save(grupos)

    const pessoasCol = app.findCollectionByNameOrId('pessoas')
    const empresasCol = app.findCollectionByNameOrId('empresas')
    const contasCol = app.findCollectionByNameOrId('contas')

    // 2. Coleção contexto_grupo_membros
    const membros = new Collection({
      name: 'contexto_grupo_membros',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: adminOrManager,
      updateRule: adminOrManager,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'grupo',
          type: 'relation',
          required: true,
          collectionId: grupos.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pessoa', 'empresa', 'conta'],
        },
        {
          name: 'pessoa',
          type: 'relation',
          required: false,
          collectionId: pessoasCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'empresa',
          type: 'relation',
          required: false,
          collectionId: empresasCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'conta',
          type: 'relation',
          required: false,
          collectionId: contasCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_ctx_membros_grupo ON contexto_grupo_membros (grupo)',
        'CREATE INDEX idx_ctx_membros_tipo ON contexto_grupo_membros (tipo)',
        'CREATE INDEX idx_ctx_membros_pessoa ON contexto_grupo_membros (pessoa)',
        'CREATE INDEX idx_ctx_membros_empresa ON contexto_grupo_membros (empresa)',
        'CREATE INDEX idx_ctx_membros_conta ON contexto_grupo_membros (conta)',
      ],
    })
    app.save(membros)

    // 3. SEED DE DADOS INICIAIS E MIGRAÇÃO DE CONTEXTOS EXISTENTES
    function find(collection, field, value) {
      try {
        return app.findFirstRecordByData(collection, field, value)
      } catch (_) {
        return null
      }
    }

    function create(collection, values) {
      const record = new Record(app.findCollectionByNameOrId(collection))
      const keys = Object.keys(values)
      for (let i = 0; i < keys.length; i++) record.set(keys[i], values[keys[i]])
      app.save(record)
      return record
    }

    function ensure(collection, field, value, values) {
      const existing = find(collection, field, value)
      return existing || create(collection, values)
    }

    function addMembro(grupoId, tipo, refId) {
      const filter = `grupo = '${grupoId}' && tipo = '${tipo}' && ${tipo} = '${refId}'`
      const existing = app.findRecordsByFilter('contexto_grupo_membros', filter, '', 1, 0)
      if (existing.length === 0) {
        const m = new Record(app.findCollectionByNameOrId('contexto_grupo_membros'))
        m.set('grupo', grupoId)
        m.set('tipo', tipo)
        m.set(tipo, refId)
        app.save(m)
      }
    }

    // Buscar pessoas existentes ou garantir exemplos (Carolina e Rafael, mais Filhas)
    const p1 = ensure('pessoas', 'nome', 'Carolina Mendes', {
      nome: 'Carolina Mendes',
      cpf: '529.982.247-25',
      email: 'carolina.mendes@email.com',
      telefone: '(11) 98845-2210',
      observacoes: 'Orçamento familiar',
    })
    const p2 = ensure('pessoas', 'nome', 'Rafael Nogueira', {
      nome: 'Rafael Nogueira',
      cpf: '168.995.350-09',
      email: 'rafael.nogueira@email.com',
      telefone: '(19) 99710-4432',
      observacoes: 'Orçamento familiar',
    })

    // Adicionar pessoas filhas para o caso de uso citado pelo usuário ("Filhas")
    const filha1 = ensure('pessoas', 'nome', 'Beatriz Nogueira', {
      nome: 'Beatriz Nogueira',
      cpf: '333.444.555-66',
      email: 'beatriz.filha@email.com',
      telefone: '(19) 99123-4567',
      observacoes: 'Filha (escola, cursos, saúde)',
    })
    const filha2 = ensure('pessoas', 'nome', 'Isabela Nogueira', {
      nome: 'Isabela Nogueira',
      cpf: '444.555.666-77',
      email: 'isabela.filha@email.com',
      telefone: '(19) 99234-5678',
      observacoes: 'Filha (ballet, natação)',
    })

    // Empresas existentes
    const empEstrela = find('empresas', 'nome_fantasia', 'Estrela Dourada')
    const empBelaVista = find('empresas', 'nome_fantasia', 'Bela Vista Suprimentos')

    // Contas existentes
    const cCaixa = find('contas', 'nome', 'Caixa Principal')
    const cInter = find('contas', 'nome', 'Banco Inter')
    const cNubank = find('contas', 'nome', 'NuBank')
    const cPorto = find('contas', 'nome', 'Porto Seguro')
    const cSicred = find('contas', 'nome', 'Sicred')
    const cBancoPJ = find('contas', 'nome', 'Banco PJ')

    // GRUPO 1: Casa (orçamento familiar + contas de casa)
    const grupoCasa = ensure('contexto_grupos', 'nome', 'Casa', {
      nome: 'Casa',
      cor: '#DF5830', // Laranja do tema
      observacoes: 'Orçamento e despesas familiares da residência',
      ordem: 1,
    })
    if (p1) addMembro(grupoCasa.id, 'pessoa', p1.id)
    if (p2) addMembro(grupoCasa.id, 'pessoa', p2.id)
    if (cNubank) addMembro(grupoCasa.id, 'conta', cNubank.id)
    if (cCaixa) addMembro(grupoCasa.id, 'conta', cCaixa.id)
    if (cInter) addMembro(grupoCasa.id, 'conta', cInter.id)

    // GRUPO 2: Filhas (visão focada exclusivamente nos parâmetros das filhas)
    const grupoFilhas = ensure('contexto_grupos', 'nome', 'Filhas', {
      nome: 'Filhas',
      cor: '#A8556A', // Rosa / magenta suave
      observacoes: 'Gastos, mensalidades e atividades das filhas',
      ordem: 2,
    })
    if (filha1) addMembro(grupoFilhas.id, 'pessoa', filha1.id)
    if (filha2) addMembro(grupoFilhas.id, 'pessoa', filha2.id)

    // GRUPO 3: Pessoal (CPF) - mapeia histórico do contexto anterior
    const grupoPessoal = ensure('contexto_grupos', 'nome', 'Pessoal (CPF)', {
      nome: 'Pessoal (CPF)',
      cor: '#2B5BA8', // Azul
      observacoes: 'Despesas pessoais e individuais',
      ordem: 3,
    })
    if (p1) addMembro(grupoPessoal.id, 'pessoa', p1.id)
    if (p2) addMembro(grupoPessoal.id, 'pessoa', p2.id)
    if (cPorto) addMembro(grupoPessoal.id, 'conta', cPorto.id)
    if (cSicred) addMembro(grupoPessoal.id, 'conta', cSicred.id)

    // GRUPO 4: Empresas existentes (Estrela Dourada)
    if (empEstrela) {
      const gEstrela = ensure('contexto_grupos', 'nome', 'Padaria Estrela Dourada', {
        nome: 'Padaria Estrela Dourada',
        cor: '#1E6F5C', // Verde escuro
        observacoes: 'Visão operacional da Padaria Estrela Dourada LTDA',
        ordem: 4,
      })
      addMembro(gEstrela.id, 'empresa', empEstrela.id)
      if (cBancoPJ) addMembro(gEstrela.id, 'conta', cBancoPJ.id)
    }

    // GRUPO 5: Bela Vista Suprimentos
    if (empBelaVista) {
      const gBelaVista = ensure('contexto_grupos', 'nome', 'Bela Vista Suprimentos', {
        nome: 'Bela Vista Suprimentos',
        cor: '#B7791F', // Dourado
        observacoes: 'Visão de fornecedor e compras Bela Vista',
        ordem: 5,
      })
      addMembro(gBelaVista.id, 'empresa', empBelaVista.id)
    }

    // GRUPO 6: Grupo "Todas as Empresas (PJ)" agregando ambas as empresas
    if (empEstrela && empBelaVista) {
      const gHolding = ensure('contexto_grupos', 'nome', 'Empresas Agrupadas (PJ)', {
        nome: 'Empresas Agrupadas (PJ)',
        cor: '#4C3A8C', // Roxo
        observacoes: 'Visão consolidada de todas as operações empresariais',
        ordem: 6,
      })
      addMembro(gHolding.id, 'empresa', empEstrela.id)
      addMembro(gHolding.id, 'empresa', empBelaVista.id)
      if (cBancoPJ) addMembro(gHolding.id, 'conta', cBancoPJ.id)
    }

    // 4. Associar despesas de exemplo aos membros para efeito imediato
    // Por exemplo, Escola associar a Beatriz (filha)
    try {
      const cEscola = find('despesas_compromisso', 'descricao', 'Escola')
      if (cEscola && filha1) {
        cEscola.set('pessoa', filha1.id)
        app.save(cEscola)
      }
    } catch (_) {}

    // Criar um compromisso específico das filhas: "Ballet & Natação Filhas"
    try {
      const catUtil =
        find('categorias', 'nome', 'Contas e Serviços') || find('categorias', 'tipo', 'despesa')
      const tagRafa = find('tags', 'nome', 'Rafa')
      const tipoFixa = find('tipos_despesa', 'codigo', 'fixa')
      const pixCpf = find('metodos_pagamento', 'codigo', 'pix_cpf')

      if (catUtil && tipoFixa && filha2) {
        const cBallet = ensure('despesas_compromisso', 'descricao', 'Ballet & Atividades Filhas', {
          contexto_tipo: 'pessoal',
          descricao: 'Ballet & Atividades Filhas',
          fornecedor: 'Escola de Dança Harmonia',
          categoria: catUtil.id,
          pessoa: filha2.id,
          tag: tagRafa ? tagRafa.id : '',
          tipo_despesa: tipoFixa.id,
          metodo_pagamento: pixCpf ? pixCpf.id : '',
          conta_padrao: cInter ? cInter.id : '',
          secao: 'contas_mensais_pix_boleto',
          regra_repeticao: 'mensal',
          dia_vencimento: 8,
          regra_vencimento_texto: '8/m',
          data_inicio: '2026-01-01 00:00:00.000Z',
          valor_estimado: 380,
          ativo: true,
          observacoes: 'Aulas de dança e esportes das filhas',
        })

        const now = new Date()
        const compStr = `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`
        const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 8, 12, 0, 0))

        const existingFilter = `compromisso = '${cBallet.id}' && competencia = '${compStr}'`
        const existingOccs = app.findRecordsByFilter(
          'despesas_ocorrencias',
          existingFilter,
          '',
          1,
          0,
        )
        if (existingOccs.length === 0) {
          const occ = new Record(app.findCollectionByNameOrId('despesas_ocorrencias'))
          occ.set('compromisso', cBallet.id)
          occ.set('contexto_tipo', 'pessoal')
          occ.set('secao', 'contas_mensais_pix_boleto')
          occ.set('conta', cInter ? cInter.id : '')
          occ.set('competencia', compStr)
          occ.set('data_vencimento', dueDate.toISOString())
          occ.set('valor_previsto', 380)
          occ.set('status', 'prevista')
          occ.set('dizimo', false)
          occ.set('observacoes', 'Mensalidade ballet')
          app.save(occ)
        }
      }
    } catch (_) {}
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('contexto_grupo_membros'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('contexto_grupos'))
    } catch (_) {}
  },
)
