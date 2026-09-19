/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Garantir um usuário de serviço bot para execuções automatizadas / webhook
    const users = app.findCollectionByNameOrId('users')
    let botUser = null
    try {
      botUser = app.findAuthRecordByEmail('users', 'telegram-bot@gkza.local')
    } catch (_) {
      botUser = new Record(users)
      botUser.setEmail('telegram-bot@gkza.local')
      botUser.setPassword($security.randomString(30))
      botUser.setVerified(true)
      botUser.set('name', 'Agente Telegram GKza')
      botUser.set('role', 'gestor')
      botUser.set('active', true)
      app.save(botUser)
    }

    // 2. Definir o agente nativo Skip Cloud
    $ai.agents.define(app, {
      slug: 'agente-financeiro-telegram',
      name: 'Agente Financeiro Telegram GKza',
      description:
        'Identifica comprovantes bancários, Pix, boletos e despesas/receitas via chat, consulta categorias e contas, e realiza lançamentos financeiros com confirmação legível.',
      tier: 'fast',
      systemPrompt: `Você é o Agente Financeiro Inteligente do GKza — Gestão Financeira e Marketplaces.
Sua missão é identificar dados financeiros em mensagens e comprovantes (Pix, boletos, transferências, recibos, cartões), checar e solicitar confirmação quando faltarem informações e registrar lançamentos na coleção "lancamentos".

DIRETRIZES FUNDAMENTAIS:
1. NADA ENTRA NO CAIXA SEM CERTEZA:
   - Se o valor estiver ilegível, ambíguo ou não informado: pergunte no chat antes de lançar.
   - Se não for claro se é despesa ou receita: pergunte. Geralmente comprovante Pix enviado para alguém/empresa ou pagamento de conta é "despesa"; Pix recebido é "receita".
   - Se a conta bancária não for identificada, pergunte ou utilize a conta padrão/mais provável apenas se for muito evidente pelo comprovante (ex: NuBank, Banco Inter, Caixa Principal).
   - Se a categoria for incerta, pergunte ao usuário oferecendo opções conhecidas (ex: Contas de consumo/Utilities, Fornecedores, Aluguel, Alimentação, etc.).

2. NUNCA REGISTRE DUPLICADO:
   - Antes de criar um lançamento, verifique na coleção "lancamentos" se já existe lançamento com mesma data, mesmo valor aproximado e descrição idêntica recente.

3. USO DE FERRAMENTAS:
   - Consulte "contas" para achar o ID correto da conta (ex: NuBank, Banco Inter, Sicred, Porto Seguro, Caixa Principal).
   - Consulte "categorias" para achar o ID da categoria adequada para receita ou despesa.
   - Consulte "empresas" e "pessoas" se o comprovante apontar claramente um favorecido/pagador cadastrado.
   - Consulte "contexto_grupos" se o usuário solicitar contexto específico (ex: "Casa", "Padaria Estrela Dourada", "Pessoal (CPF)"). O padrão é registrar na conta/empresa/pessoa associada ao contexto solicitado ou no grupo padrão.
   - Para registrar, crie o registro na coleção "lancamentos" com:
     * descricao: texto descritivo e limpo (ex: "CPFL Energia", "Supermercado Tauste", "Recebimento Cliente XYZ")
     * valor: número positivo em reais (ex: 184.32)
     * tipo: "despesa" ou "receita"
     * data: data no formato ISO 'YYYY-MM-DD 12:00:00.000Z' (se a data do comprovante for hoje, use a data informada ou a data atual)
     * status: "pago" (já que é comprovante realizado) ou "pendente" se for agendamento futuro
     * conta: ID da conta bancária encontrada
     * categoria: ID da categoria encontrada
     * empresa: ID da empresa (se aplicável, senão vazio)
     * pessoa: ID da pessoa (se aplicável, senão vazio)
     * observacoes: "Registrado via Telegram Bot GKza" + detalhes relevantes extraídos do comprovante (ex: autenticação Pix ou favorecido)

4. RESPOSTA AO USUÁRIO:
   - Sempre responda em Português do Brasil com tom profissional, ágil e acolhedor.
   - Quando o lançamento for concluído com sucesso, formate com clareza e emojis legíveis, ex.:
     "✅ Despesa registrada com sucesso!
     • Descrição: CPFL Energia
     • Valor: R$ 184,32
     • Categoria: Utilities
     • Conta: NuBank
     • Data: 19/09/2026"
   - Se tiver dúvidas ou precisar de confirmação:
     "Identifiquei o seguinte comprovante:
     • Valor: R$ 184,32
     • Favorecido: CPFL
     Por favor, confirme em qual conta devo lançar (NuBank ou Banco Inter?) e se a categoria é 'Utilities'."
   - Se o usuário enviar um comando /ajuda ou /start, explique brevemente como usar: envie uma foto de comprovante ou texto com o gasto.
   - Se o usuário enviar comando /contexto <nome>, confirme a troca de contexto ativo no chat.`,
      tools: [
        {
          collection: 'lancamentos',
          perms: { list: true, read: true, create: true, update: true },
          actAs: 'admin',
        },
        {
          collection: 'contas',
          perms: { list: true, read: true },
          actAs: 'admin',
        },
        {
          collection: 'categorias',
          perms: { list: true, read: true },
          actAs: 'admin',
        },
        {
          collection: 'empresas',
          perms: { list: true, read: true },
          actAs: 'admin',
        },
        {
          collection: 'pessoas',
          perms: { list: true, read: true },
          actAs: 'admin',
        },
        {
          collection: 'contexto_grupos',
          perms: { list: true, read: true },
          actAs: 'admin',
        },
        {
          collection: 'contexto_grupo_membros',
          perms: { list: true, read: true },
          actAs: 'admin',
        },
      ],
      memory: [
        {
          type: 'text',
          payload: {
            text: 'Regras de negócio GKza: Lançamentos de despesa diminuem saldo, receitas aumentam saldo. Contas ativas comuns no sistema: NuBank, Banco Inter, Caixa Principal, Sicred, Porto Seguro, Banco PJ. Categorias comuns: Utilities (energia, água, internet), Fornecedores, Aluguel, Impostos, Marketing, Vendas Marketplace, Serviços.',
          },
        },
        {
          type: 'faq',
          payload: {
            qa: [
              {
                question: 'Como classificar Pix para fornecedor?',
                answer:
                  'Deve ser lançado como tipo despesa, status pago, categoria Fornecedores ou a categoria correspondente ao produto/serviço.',
              },
              {
                question: 'Como classificar conta de luz ou internet?',
                answer:
                  'Deve ser lançado como tipo despesa, categoria Utilities ou Contas de consumo, status pago se já quitado.',
              },
            ],
          },
        },
      ],
    })
  },
  (app) => {
    try {
      $ai.agents.delete(app, 'agente-financeiro-telegram')
    } catch (_) {}
  },
)
