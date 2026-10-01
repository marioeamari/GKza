migrate(
  (app) => {
    const authenticated = "@request.auth.id != ''"
    const adminOrManager = "@request.auth.role = 'admin' || @request.auth.role = 'gestor'"

    // 1. kit_temas
    const kitTemas = new Collection({
      name: 'kit_temas',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: adminOrManager,
      updateRule: adminOrManager,
      deleteRule: adminOrManager,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 150 },
        { name: 'descricao', type: 'text', required: false, max: 1000 },
        { name: 'ativo', type: 'bool', required: false },
        { name: 'ordem', type: 'number', required: false, min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_kit_temas_nome ON kit_temas (nome)',
        'CREATE INDEX idx_kit_temas_ativo ON kit_temas (ativo)',
      ],
    })
    app.save(kitTemas)

    // 2. kit_modelos
    const kitModelos = new Collection({
      name: 'kit_modelos',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: adminOrManager,
      updateRule: adminOrManager,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'tema',
          type: 'relation',
          required: true,
          collectionId: kitTemas.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'codigo', type: 'text', required: true, max: 50 },
        { name: 'nome', type: 'text', required: true, max: 150 },
        {
          name: 'foto',
          type: 'file',
          required: false,
          maxSelect: 1,
          maxSize: 15728640,
          mimeTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/heic',
            'image/heif',
          ],
        },
        { name: 'ordem', type: 'number', required: false, min: 0 },
        { name: 'ativo', type: 'bool', required: false },
        { name: 'observacoes', type: 'text', required: false, max: 500 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_kit_modelos_tema ON kit_modelos (tema)',
        'CREATE INDEX idx_kit_modelos_ordem ON kit_modelos (ordem)',
        'CREATE INDEX idx_kit_modelos_ativo ON kit_modelos (ativo)',
        'CREATE UNIQUE INDEX idx_kit_modelos_tema_codigo ON kit_modelos (tema, codigo)',
      ],
    })
    app.save(kitModelos)

    // 3. kit_regras
    const kitRegras = new Collection({
      name: 'kit_regras',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: adminOrManager,
      updateRule: adminOrManager,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'tema',
          type: 'relation',
          required: true,
          collectionId: kitTemas.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['automatica', 'manual'],
          maxSelect: 1,
        },
        { name: 'quantidade_kit', type: 'number', required: false, min: 1 },
        { name: 'descricao', type: 'text', required: false, max: 250 },
        { name: 'composicao', type: 'json', required: false },
        { name: 'ativo', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_kit_regras_tema ON kit_regras (tema)',
        'CREATE INDEX idx_kit_regras_tipo ON kit_regras (tipo)',
        'CREATE INDEX idx_kit_regras_qtd ON kit_regras (quantidade_kit)',
      ],
    })
    app.save(kitRegras)

    // 4. kit_pedidos
    const kitPedidos = new Collection({
      name: 'kit_pedidos',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        { name: 'numero_pedido', type: 'text', required: true, max: 100 },
        { name: 'marketplace', type: 'text', required: false, max: 80 },
        { name: 'produto_nome', type: 'text', required: true, max: 200 },
        { name: 'sku', type: 'text', required: false, max: 100 },
        {
          name: 'tema',
          type: 'relation',
          required: true,
          collectionId: kitTemas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'quantidade_total', type: 'number', required: true, min: 1 },
        {
          name: 'tipo_composicao',
          type: 'select',
          required: true,
          values: ['padrao', 'personalizada'],
          maxSelect: 1,
        },
        { name: 'composicao_personalizada', type: 'json', required: false },
        {
          name: 'status_separacao',
          type: 'select',
          required: true,
          values: ['aguardando', 'em_separacao', 'finalizado', 'cancelado'],
          maxSelect: 1,
        },
        { name: 'cliente_nome', type: 'text', required: false, max: 150 },
        { name: 'observacoes', type: 'text', required: false, max: 1000 },
        {
          name: 'separador_atual',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_kit_pedidos_num ON kit_pedidos (numero_pedido)',
        'CREATE INDEX idx_kit_pedidos_sku ON kit_pedidos (sku)',
        'CREATE INDEX idx_kit_pedidos_status ON kit_pedidos (status_separacao)',
        'CREATE INDEX idx_kit_pedidos_tema ON kit_pedidos (tema)',
      ],
    })
    app.save(kitPedidos)

    // 5. kit_historico_separacao
    const kitHistorico = new Collection({
      name: 'kit_historico_separacao',
      type: 'base',
      listRule: authenticated,
      viewRule: authenticated,
      createRule: authenticated,
      updateRule: authenticated,
      deleteRule: adminOrManager,
      fields: [
        {
          name: 'pedido',
          type: 'relation',
          required: false,
          collectionId: kitPedidos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'numero_pedido', type: 'text', required: true, max: 100 },
        { name: 'marketplace', type: 'text', required: false, max: 80 },
        { name: 'produto_nome', type: 'text', required: false, max: 200 },
        { name: 'sku', type: 'text', required: false, max: 100 },
        {
          name: 'tema',
          type: 'relation',
          required: false,
          collectionId: kitTemas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'tema_nome', type: 'text', required: false, max: 150 },
        { name: 'quantidade_total', type: 'number', required: true, min: 1 },
        {
          name: 'tipo_composicao',
          type: 'select',
          required: true,
          values: ['padrao', 'personalizada'],
          maxSelect: 1,
        },
        {
          name: 'regra_origem',
          type: 'select',
          required: false,
          values: ['personalizada', 'manual', 'automatica'],
          maxSelect: 1,
        },
        { name: 'composicao_utilizada', type: 'json', required: true },
        {
          name: 'funcionario',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'funcionario_nome', type: 'text', required: false, max: 150 },
        { name: 'data_inicio', type: 'date', required: false },
        { name: 'data_fim', type: 'date', required: false },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['aguardando', 'em_separacao', 'finalizado'],
          maxSelect: 1,
        },
        { name: 'observacoes', type: 'text', required: false, max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_kit_hist_num ON kit_historico_separacao (numero_pedido)',
        'CREATE INDEX idx_kit_hist_status ON kit_historico_separacao (status)',
        'CREATE INDEX idx_kit_hist_func ON kit_historico_separacao (funcionario)',
      ],
    })
    app.save(kitHistorico)

    // Seed Temas e Modelos iniciais
    // Tema 1: Turma da Mônica (6 modelos)
    try {
      const temaMonica = new Record(kitTemas)
      temaMonica.set('nome', 'Turma da Mônica')
      temaMonica.set('descricao', 'Kit Toalha de Rosto / Banho Personagens Maurício de Sousa')
      temaMonica.set('ativo', true)
      temaMonica.set('ordem', 1)
      app.save(temaMonica)

      const monicaModelos = [
        { codigo: 'M01', nome: 'Mônica', ordem: 1 },
        { codigo: 'M02', nome: 'Cebolinha', ordem: 2 },
        { codigo: 'M03', nome: 'Magali', ordem: 3 },
        { codigo: 'M04', nome: 'Cascão', ordem: 4 },
        { codigo: 'M05', nome: 'Mônica 2', ordem: 5 },
        { codigo: 'M06', nome: 'Turma Completa', ordem: 6 },
      ]
      for (const m of monicaModelos) {
        const rec = new Record(kitModelos)
        rec.set('tema', temaMonica.id)
        rec.set('codigo', m.codigo)
        rec.set('nome', m.nome)
        rec.set('ordem', m.ordem)
        rec.set('ativo', true)
        app.save(rec)
      }

      // Regra padrão automática para Monica
      const regraAutoMonica = new Record(kitRegras)
      regraAutoMonica.set('tema', temaMonica.id)
      regraAutoMonica.set('tipo', 'automatica')
      regraAutoMonica.set('descricao', 'Divisão automática equilibrada entre modelos ativos')
      regraAutoMonica.set('ativo', true)
      app.save(regraAutoMonica)
    } catch (e) {
      console.log('Seed Monica error:', e)
    }

    // Tema 2: Mickey & Amigos (9 modelos)
    try {
      const temaMickey = new Record(kitTemas)
      temaMickey.set('nome', 'Mickey & Amigos')
      temaMickey.set('descricao', 'Linha Disney Toalhas Mickey e Turma')
      temaMickey.set('ativo', true)
      temaMickey.set('ordem', 2)
      app.save(temaMickey)

      const mickeyModelos = [
        { codigo: 'M01', nome: 'Mickey Clássico', ordem: 1 },
        { codigo: 'M02', nome: 'Minnie Vermelha', ordem: 2 },
        { codigo: 'M03', nome: 'Pato Donald', ordem: 3 },
        { codigo: 'M04', nome: 'Pateta', ordem: 4 },
        { codigo: 'M05', nome: 'Pluto', ordem: 5 },
        { codigo: 'M06', nome: 'Margarida', ordem: 6 },
        { codigo: 'M07', nome: 'Minnie Rosa', ordem: 7 },
        { codigo: 'M08', nome: 'Mickey Moderno', ordem: 8 },
        { codigo: 'M09', nome: 'Mickey e Minnie Juntos', ordem: 9 },
      ]
      const savedMickeyModelos = []
      for (const m of mickeyModelos) {
        const rec = new Record(kitModelos)
        rec.set('tema', temaMickey.id)
        rec.set('codigo', m.codigo)
        rec.set('nome', m.nome)
        rec.set('ordem', m.ordem)
        rec.set('ativo', true)
        app.save(rec)
        savedMickeyModelos.push({ id: rec.id, codigo: m.codigo, nome: m.nome })
      }

      // Regra manual para kit de 10 unidades do Mickey (M01=2, M02..M09=1)
      const regraManual10 = new Record(kitRegras)
      regraManual10.set('tema', temaMickey.id)
      regraManual10.set('tipo', 'manual')
      regraManual10.set('quantidade_kit', 10)
      regraManual10.set('descricao', 'Kit 10 unidades Mickey: M01 leva 2 un, demais 1 un')
      regraManual10.set('ativo', true)
      const comp10 = savedMickeyModelos.map((sm, idx) => ({
        modelo_id: sm.id,
        codigo: sm.codigo,
        nome: sm.nome,
        quantidade: idx === 0 ? 2 : 1,
      }))
      regraManual10.set('composicao', comp10)
      app.save(regraManual10)
    } catch (e) {
      console.log('Seed Mickey error:', e)
    }

    // Tema 3: Sonic (4 modelos)
    try {
      const temaSonic = new Record(kitTemas)
      temaSonic.set('nome', 'Sonic')
      temaSonic.set('descricao', 'Toalhas Sonic the Hedgehog e amigos')
      temaSonic.set('ativo', true)
      temaSonic.set('ordem', 3)
      app.save(temaSonic)

      const sonicModelos = [
        { codigo: 'S01', nome: 'Sonic Veloz', ordem: 1 },
        { codigo: 'S02', nome: 'Tails Raposa', ordem: 2 },
        { codigo: 'S03', nome: 'Knuckles Equidna', ordem: 3 },
        { codigo: 'S04', nome: 'Shadow', ordem: 4 },
      ]
      for (const m of sonicModelos) {
        const rec = new Record(kitModelos)
        rec.set('tema', temaSonic.id)
        rec.set('codigo', m.codigo)
        rec.set('nome', m.nome)
        rec.set('ordem', m.ordem)
        rec.set('ativo', true)
        app.save(rec)
      }
    } catch (e) {
      console.log('Seed Sonic error:', e)
    }

    // Tema 4: Pokémon (5 modelos)
    try {
      const temaPoke = new Record(kitTemas)
      temaPoke.set('nome', 'Pokémon')
      temaPoke.set('descricao', 'Toalhas Coleção Inicial Pokémon')
      temaPoke.set('ativo', true)
      temaPoke.set('ordem', 4)
      app.save(temaPoke)

      const pokeModelos = [
        { codigo: 'P01', nome: 'Pikachu', ordem: 1 },
        { codigo: 'P02', nome: 'Charmander', ordem: 2 },
        { codigo: 'P03', nome: 'Squirtle', ordem: 3 },
        { codigo: 'P04', nome: 'Bulbasaur', ordem: 4 },
        { codigo: 'P05', nome: 'Gengar', ordem: 5 },
      ]
      for (const m of pokeModelos) {
        const rec = new Record(kitModelos)
        rec.set('tema', temaPoke.id)
        rec.set('codigo', m.codigo)
        rec.set('nome', m.nome)
        rec.set('ordem', m.ordem)
        rec.set('ativo', true)
        app.save(rec)
      }
    } catch (e) {
      console.log('Seed Pokemon error:', e)
    }

    // Pedidos de exemplo para teste imediato na expedição
    try {
      const monicaRec = app.findFirstRecordByData('kit_temas', 'nome', 'Turma da Mônica')
      const mickeyRec = app.findFirstRecordByData('kit_temas', 'nome', 'Mickey & Amigos')

      // Pedido Padrão 123456789 - Exemplo da especificação
      const p1 = new Record(kitPedidos)
      p1.set('numero_pedido', '123456789')
      p1.set('marketplace', 'Shopee')
      p1.set('produto_nome', 'Kit Toalha de Rosto Personagens')
      p1.set('sku', 'KIT-TOALHA-MONICA-30')
      p1.set('tema', monicaRec.id)
      p1.set('quantidade_total', 30)
      p1.set('tipo_composicao', 'padrao')
      p1.set('status_separacao', 'aguardando')
      p1.set('cliente_nome', 'Juliana Fernandes')
      app.save(p1)

      // Pedido Personalizado - Exemplo da especificação (Mickey 50 un: M01=30, M07=20)
      const p2 = new Record(kitPedidos)
      p2.set('numero_pedido', '987654321')
      p2.set('marketplace', 'Mercado Livre')
      p2.set('produto_nome', 'Kit Toalhas Banho Personagens 50 un')
      p2.set('sku', 'KIT-TOALHA-MICKEY-50')
      p2.set('tema', mickeyRec.id)
      p2.set('quantidade_total', 50)
      p2.set('tipo_composicao', 'personalizada')
      p2.set('status_separacao', 'aguardando')
      p2.set('cliente_nome', 'Carlos Eduardo Silva')
      p2.set('composicao_personalizada', [
        { codigo: 'M01', nome: 'Mickey Clássico', quantidade: 30 },
        { codigo: 'M07', nome: 'Minnie Rosa', quantidade: 20 },
      ])
      p2.set('observacoes', 'Cliente solicitou no chat: 30 Mickey Clássico e 20 Minnie Rosa.')
      app.save(p2)

      // Pedido com regra manual (Mickey 10 un)
      const p3 = new Record(kitPedidos)
      p3.set('numero_pedido', 'SHP-456123')
      p3.set('marketplace', 'Shopee')
      p3.set('produto_nome', 'Kit Toalha de Lavabo Mickey 10 un')
      p3.set('sku', 'KIT-LAVABO-MICKEY-10')
      p3.set('tema', mickeyRec.id)
      p3.set('quantidade_total', 10)
      p3.set('tipo_composicao', 'padrao')
      p3.set('status_separacao', 'aguardando')
      p3.set('cliente_nome', 'Beatriz Lima')
      app.save(p3)
    } catch (e) {
      console.log('Seed Pedidos error:', e)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('kit_historico_separacao'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('kit_pedidos'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('kit_regras'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('kit_modelos'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('kit_temas'))
    } catch (_) {}
  },
)
