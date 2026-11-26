import { describe, expect, it } from 'vitest'

import {
  ETAPAS_TRIAGEM,
  avaliarProdutoTriagem,
  resumirTriagem,
  ordenarPorAtraso,
  type TriagemFontes,
  type TriagemProdutoInput,
} from './triagemModelo'

const fontesVazias: TriagemFontes = {
  basePorOrigem: new Map(),
  cenariosPorProduto: new Map(),
  matrizPorProduto: new Map(),
  orcamentoItensPorProduto: new Map(),
  orcamentosPorId: new Map(),
  kitPorProdutoPai: new Map(),
}

function produto(overrides: Partial<TriagemProdutoInput> & { id: string }): TriagemProdutoInput {
  return {
    nome: 'Produto Teste',
    sku: 'SKU-1',
    tipo: 'revenda',
    created: '2026-01-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('avaliarProdutoTriagem', () => {
  it('produto recém-cadastrado (sem nada): vermelho em Base..Matriz e CINZA em Comercial e Lucro', () => {
    const r = avaliarProdutoTriagem(produto({ id: 'p1' }), fontesVazias)
    expect(r.etapas.base.status).toBe('vermelho')
    expect(r.etapas.composicao.status).toBe('vermelho')
    expect(r.etapas.cenario.status).toBe('vermelho')
    expect(r.etapas.aprovado.status).toBe('vermelho')
    expect(r.etapas.matriz.status).toBe('vermelho')
    // Regra do usuário: sem uso comercial é CINZA, não vermelho
    expect(r.etapas.comercial.status).toBe('cinza')
    expect(r.etapas.lucro.status).toBe('cinza')
    expect(r.parouNaEtapaNumero).toBe(1)
    expect(r.ultimaEtapaAlcancada).toBeUndefined()
    expect(r.integrado).toBe(false)
  })

  it('produto com produto base vira verde em Base e a etapa pendente passa a ser Composição', () => {
    const fontes: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
    }
    const r = avaliarProdutoTriagem(produto({ id: 'p1' }), fontes)
    expect(r.etapas.base.status).toBe('verde')
    expect(r.etapas.composicao.status).toBe('vermelho')
    expect(r.parouNaEtapaNumero).toBe(2)
  })

  it('composição só fica amarela quando existe mas não fecha com a soma das quantidades do kit', () => {
    const base: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
    }
    const compOk = avaliarProdutoTriagem(
      produto({
        id: 'p1',
        composicao: [{ descricao: 'Insumo 1', qtd: 2, unidade: 'un', custo_unitario: 1 }],
      }),
      base,
    )
    expect(compOk.etapas.composicao.status).toBe('verde')
    expect(compOk.etapas.composicao.dados?.rotulo).toBeUndefined()

    const kitConfig = { itens: [{ produto_id: 'x', qtd: 5 }], custos_adicionais: [] }
    const compDivergente = avaliarProdutoTriagem(
      produto({
        id: 'p1',
        tipo: 'kit',
        composicao: [{ descricao: 'Insumo 1', qtd: 2, unidade: 'un', custo_unitario: 1 }],
      }),
      { ...base, kitPorProdutoPai: new Map([['p1', kitConfig]]) },
    )
    const comp = compDivergente.etapas.composicao
    expect(comp.status).toBe('amarelo')
    expect(comp.dados?.rotulo).toContain('2')
    expect(comp.dados?.rotulo).toContain('5')
  })

  it('cenário só rascunho: Cenário amarelo e Aprovado vermelho (produto aprovado nunca acende vermelho na própria etapa)', () => {
    const base: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
      cenariosPorProduto: new Map([
        [
          'p1',
          [
            {
              id: 'c1',
              produto: 'p1',
              status: 'rascunho',
              preco_aprovado: 0,
              canal: 'canal1',
              updated: '2026-11-20T00:00:00.000Z',
            },
          ],
        ],
      ]),
    }
    const r = avaliarProdutoTriagem(produto({ id: 'p1' }), base)
    expect(r.etapas.cenario.status).toBe('amarelo')
    expect(r.etapas.cenario.dados?.rotulo).toBe('Rascunho não aprovado')
    expect(r.etapas.aprovado.status).toBe('vermelho')

    const aprovado: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
      cenariosPorProduto: new Map([
        [
          'p1',
          [
            {
              id: 'c1',
              produto: 'p1',
              status: 'aprovada',
              preco_aprovado: 24.9,
              canal: 'canal1',
              aprovado_em: '2026-11-06T00:00:00.000Z',
            },
          ],
        ],
      ]),
    }
    const r2 = avaliarProdutoTriagem(
      produto({
        id: 'p1',
        composicao: [{ descricao: 'Insumo 1', qtd: 1, unidade: 'un', custo_unitario: 1 }],
      }),
      aprovado,
    )
    expect(r2.etapas.cenario.status).toBe('verde')
    expect(r2.etapas.aprovado.status).toBe('verde')
    // O rótulo da etapa carrega o dado que qualificou (preço e data da aprovação)
    expect(r2.etapas.aprovado.rotulo).toContain('R$')
    expect(r2.etapas.aprovado.rotulo).toContain('06/11')
    // Aprovado sem matriz nem uso comercial: parou na etapa Matriz/Canais (5)
    expect(r2.parouNaEtapaNumero).toBe(5)
  })

  it("cenário desatualizado com preco_aprovado > 0 qualifica Aprovado com AVISO (amarelo) e trava 'parou na etapa 4'", () => {
    const fontes: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
      cenariosPorProduto: new Map([
        [
          'p1',
          [
            {
              id: 'c1',
              produto: 'p1',
              status: 'desatualizada',
              preco_aprovado: 19.9,
              canal: 'canal1',
              aprovado_em: '2026-10-01T00:00:00.000Z',
            },
          ],
        ],
      ]),
    }
    const r = avaliarProdutoTriagem(
      produto({
        id: 'p1',
        composicao: [{ descricao: 'Insumo 1', qtd: 1, unidade: 'un', custo_unitario: 1 }],
      }),
      fontes,
    )
    expect(r.etapas.aprovado.status).toBe('amarelo')
    expect(r.etapas.aprovado.dados?.rotulo).toContain('desatualizado')
    expect(r.etapas.aprovado.rotulo).toContain('19,90')
    expect(r.parouNaEtapaNumero).toBe(4)
  })

  it("desempate: cenário 'aprovada' vence 'desatualizada' mesmo com data mais antiga", () => {
    const fontes: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
      cenariosPorProduto: new Map([
        [
          'p1',
          [
            {
              id: 'c1',
              produto: 'p1',
              status: 'desatualizada',
              preco_aprovado: 10,
              canal: 'c1',
              aprovado_em: '2026-11-01T00:00:00.000Z',
            },
            {
              id: 'c2',
              produto: 'p1',
              status: 'aprovada',
              preco_aprovado: 20,
              canal: 'c2',
              aprovado_em: '2026-11-05T00:00:00.000Z',
            },
          ],
        ],
      ]),
    }
    const r = avaliarProdutoTriagem(produto({ id: 'p1' }), fontes)
    expect(r.etapas.aprovado.status).toBe('verde')
    expect(r.etapas.aprovado.rotulo).toContain('20,00')
  })

  it('matriz com legenda ativa vira verde; legenda inativa amarela; sem legenda vermelho', () => {
    const base: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
    }
    const verde = avaliarProdutoTriagem(produto({ id: 'p1' }), {
      ...base,
      matrizPorProduto: new Map([['p1', [{ id: 'm1', canal: 'ch1', legenda: 'l1' }]]]),
    })
    expect(verde.etapas.matriz.status).toBe('verde')

    const amarelo = avaliarProdutoTriagem(produto({ id: 'p1' }), {
      ...base,
      matrizPorProduto: new Map([
        ['p1', [{ id: 'm1', canal: 'ch1', legenda: 'l1', expand: { legenda: { ativo: false } } }]],
      ]),
    })
    expect(amarelo.etapas.matriz.status).toBe('amarelo')
    expect(amarelo.etapas.matriz.dados?.rotulo).toContain('inativa')

    const vermelho = avaliarProdutoTriagem(produto({ id: 'p1' }), {
      ...base,
      matrizPorProduto: new Map([['p1', [{ id: 'm1', canal: 'ch1', legenda: '' }]]]),
    })
    expect(vermelho.etapas.matriz.status).toBe('vermelho')
  })

  it('Comercial: item de orçamento vira verde com data e nome do cliente; sem uso fica CINZA com selo próprio', () => {
    // Produto com Base, Composição e Cenário/Aprovado verdes (Matriz nunca feita):
    // com uso comercial o primeiro pendente é a Matriz (5), com ou sem o verde do Comercial.
    const base: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
      cenariosPorProduto: new Map([
        [
          'p1',
          [
            {
              id: 'c1',
              produto: 'p1',
              status: 'aprovada',
              preco_aprovado: 24.9,
              canal: 'canal1',
              aprovado_em: '2026-11-06T00:00:00.000Z',
            },
          ],
        ],
      ]),
    }
    const produtoCompleto = produto({
      id: 'p1',
      composicao: [{ descricao: 'Insumo 1', qtd: 1, unidade: 'un', custo_unitario: 1 }],
    })

    const comUso = avaliarProdutoTriagem(produtoCompleto, {
      ...base,
      orcamentoItensPorProduto: new Map([['p1', [{ id: 'oi1', orcamento: 'orc1' }]]]),
      orcamentosPorId: new Map([
        [
          'orc1',
          {
            id: 'orc1',
            codigo: 'ORC-42',
            cliente_nome: 'Maria',
            created: '2026-11-10T00:00:00.000Z',
          },
        ],
      ]),
    })
    expect(comUso.etapas.comercial.status).toBe('verde')
    expect(comUso.etapas.comercial.rotulo).toContain('Maria')
    // Comercial verde, mas Matriz nunca feita → parou na etapa 5 (Matriz/Canais)
    expect(comUso.parouNaEtapaNumero).toBe(5)
    expect(comUso.selo).toContain('Parou na etapa 5')

    const semUso = avaliarProdutoTriagem(produtoCompleto, base)
    expect(semUso.etapas.comercial.status).toBe('cinza')
    expect(semUso.etapas.comercial.dados?.rotulo).toContain('sem uso comercial')
    // Última alcançada é Aprovado verde → parou na etapa 5 (Matriz/Canais)
    expect(semUso.parouNaEtapaNumero).toBe(5)
    expect(semUso.selo).toContain('Parou na etapa 5')
  })

  it('Lucro fica verde quando todo o trilho anterior está verde (etapa final automática) — selo 100% integrado', () => {
    const fontes: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
      cenariosPorProduto: new Map([
        [
          'p1',
          [
            {
              id: 'c1',
              produto: 'p1',
              status: 'aprovada',
              preco_aprovado: 24.9,
              canal: 'canal1',
              aprovado_em: '2026-11-06T00:00:00.000Z',
            },
          ],
        ],
      ]),
      matrizPorProduto: new Map([['p1', [{ id: 'm1', canal: 'ch1', legenda: 'l1' }]]]),
      orcamentoItensPorProduto: new Map([['p1', [{ id: 'oi1', orcamento: 'orc1' }]]]),
      orcamentosPorId: new Map([
        [
          'orc1',
          {
            id: 'orc1',
            codigo: 'ORC-42',
            cliente_nome: 'Maria',
            created: '2026-11-10T00:00:00.000Z',
          },
        ],
      ]),
    }
    const r = avaliarProdutoTriagem(
      produto({
        id: 'p1',
        composicao: [{ descricao: 'Insumo 1', qtd: 1, unidade: 'un', custo_unitario: 1 }],
      }),
      fontes,
    )
    for (const chave of [
      'base',
      'composicao',
      'cenario',
      'aprovado',
      'matriz',
      'comercial',
      'lucro',
    ]) {
      expect(r.etapas[chave as keyof typeof r.etapas].status).toBe('verde')
    }
    expect(r.integrado).toBe(true)
    expect(r.selo).toContain('100% integrado')
  })

  it('produto SEM nenhum cenário: Cenário e Aprovado vermelhos, selo "Parou na etapa 3 — Cenário" (não derruba o cálculo)', () => {
    const fontes: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
      // p1 não tem NENHUM cenário em cenariosPorProduto
    }
    const r = avaliarProdutoTriagem(
      produto({
        id: 'p1',
        composicao: [{ descricao: 'Insumo 1', qtd: 1, unidade: 'un', custo_unitario: 1 }],
      }),
      fontes,
    )
    expect(r.etapas.cenario.status).toBe('vermelho')
    expect(r.etapas.cenario.rotulo).toBe('Nenhum cenário salvo')
    // Causa raiz do bug de runtime: esta etapa precisa existir mesmo sem cenários
    expect(r.etapas.aprovado).toBeDefined()
    expect(r.etapas.aprovado.status).toBe('vermelho')
    // O selo/resumo não pode quebrar nem ler etapa undefined
    expect(r.selo).toBe('⚠️ Parou na etapa 3 — Cenário')
    expect(r.parouNaEtapaNumero).toBe(3)
    expect(r.severidadePendencia).toBe('vermelho')
    const resumo = resumirTriagem([r])
    expect(resumo.semNenhumCenario).toBe(1)
    expect(resumo.pararamEtapa?.chave).toBe('cenario')
  })

  it('kits/combos são avaliados como produto próprio e o detalhe lista os componentes (com uso comercial ordenados primeiro)', () => {
    const fontes: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
      kitPorProdutoPai: new Map([
        [
          'p1',
          {
            itens: [
              { produto_id: 'f1', qtd: 2 },
              { produto_id: 'f2', qtd: 1 },
            ],
            custos_adicionais: [],
          },
        ],
      ]),
      nomeProdutoPorId: new Map([
        ['f1', 'Filho A'],
        ['f2', 'Filho B'],
      ]),
      orcamentoItensPorProduto: new Map([['f2', [{ id: 'oi2', orcamento: 'orc1' }]]]),
      orcamentosPorId: new Map([
        [
          'orc1',
          { id: 'orc1', codigo: 'ORC-7', cliente_nome: 'Ana', created: '2026-11-12T00:00:00.000Z' },
        ],
      ]),
    }
    const r = avaliarProdutoTriagem(produto({ id: 'p1', tipo: 'kit' }), fontes)
    // O kit é avaliado por si só (não herda comercial dos filhos)…
    expect(r.etapas.comercial.status).toBe('cinza')
    // …mas o detalhe lista os componentes do kit, com uso comercial primeiro
    expect(r.detalheKitComponentes).toHaveLength(2)
    expect(r.detalheKitComponentes[0].nome).toBe('Filho B')
    expect(r.detalheKitComponentes[0].temUsoComercial).toBe(true)
    expect(r.detalheKitComponentes[1].nome).toBe('Filho A')
    expect(r.detalheKitComponentes[1].temUsoComercial).toBe(false)
  })
})

describe('resumirTriagem', () => {
  it('conta integrados, etapa mais comum e sem nenhum cenário', () => {
    const fontes: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([
        ['p1', { id: 'b1' }],
        ['p2', { id: 'b2' }],
        ['p3', { id: 'b3' }],
      ]),
      cenariosPorProduto: new Map([
        [
          'p1',
          [
            {
              id: 'c1',
              produto: 'p1',
              status: 'aprovada',
              preco_aprovado: 10,
              canal: 'c',
              aprovado_em: '2026-11-01T00:00:00.000Z',
            },
          ],
        ],
      ]),
      matrizPorProduto: new Map([['p1', [{ id: 'm1', canal: 'ch1', legenda: 'l1' }]]]),
      orcamentoItensPorProduto: new Map([['p1', [{ id: 'oi1', orcamento: 'orc1' }]]]),
      orcamentosPorId: new Map([
        [
          'orc1',
          {
            id: 'orc1',
            codigo: 'ORC-42',
            cliente_nome: 'Maria',
            created: '2026-11-10T00:00:00.000Z',
          },
        ],
      ]),
    }
    const prods = [
      produto({
        id: 'p1',
        nome: 'Completo',
        composicao: [{ descricao: 'Insumo 1', qtd: 1, unidade: 'un', custo_unitario: 1 }],
      }),
      produto({ id: 'p2', nome: 'Só base' }),
      produto({ id: 'p3', nome: 'Só base 2' }),
    ]
    const avaliacoes = prods.map((p) => avaliarProdutoTriagem(p, fontes))
    const resumo = resumirTriagem(avaliacoes)
    expect(resumo.total).toBe(3)
    expect(resumo.integrados).toBe(1)
    // p2 e p3 têm Base verde e travam na Composição (vermelha)
    expect(resumo.pararamEtapa?.chave).toBe('composicao')
    expect(resumo.pararamEtapa?.quantidade).toBe(2)
    expect(resumo.semNenhumCenario).toBe(2)
  })

  it('ordenarPorAtraso coloca os mais atrasados primeiro e integrados por último', () => {
    const fontes: TriagemFontes = {
      ...fontesVazias,
      basePorOrigem: new Map([['p1', { id: 'b1' }]]),
    }
    const completo = avaliarProdutoTriagem(
      produto({
        id: 'p1',
        composicao: [{ descricao: 'Insumo 1', qtd: 1, unidade: 'un', custo_unitario: 1 }],
        created: '2026-01-01T00:00:00.000Z',
      }),
      fontes,
    )
    const parado = avaliarProdutoTriagem(
      produto({ id: 'p2', created: '2026-06-01T00:00:00.000Z' }),
      fontes,
    )
    const ordenadas = ordenarPorAtraso([completo, parado])
    expect(ordenadas[0].produto.id).toBe('p2')
    expect(ordenadas[1].produto.id).toBe('p1')
    expect(ETAPAS_TRIAGEM).toHaveLength(7)
  })
})
