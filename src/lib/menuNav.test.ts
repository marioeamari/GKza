import { describe, expect, it } from 'vitest'
import {
  CADASTROS_CHILDREN,
  isSubItemActive,
  menuGroupForUrl,
  NAV_TREE,
  PRECIFICACAO_CHILDREN,
} from './menuNav'

describe('menuNav — páginas que faltavam na reorganização A+B', () => {
  it('Precificação contém Composição de Produtos apontando /produtos (após Produtos & Kits)', () => {
    const labels = PRECIFICACAO_CHILDREN.map((s) => s.label)
    const idx = labels.indexOf('Composição de Produtos')
    expect(idx).toBeGreaterThan(-1)
    expect(labels[idx - 1]).toBe('Produtos & Kits')
    expect(PRECIFICACAO_CHILDREN[idx].to).toBe('/produtos')
    expect(PRECIFICACAO_CHILDREN[idx].to).not.toBe('/composicao-produtos')
  })

  it('Precificação contém Clientes apontando /precificacao/clientes ao final (após Orçamentos)', () => {
    const last = PRECIFICACAO_CHILDREN[PRECIFICACAO_CHILDREN.length - 1]
    expect(last.label).toBe('Clientes')
    expect(last.to).toBe('/precificacao/clientes')
  })

  it('Cadastros contém Insumos apontando /insumos (após Fornecedores)', () => {
    const labels = CADASTROS_CHILDREN.map((s) => s.label)
    const idx = labels.indexOf('Insumos')
    expect(idx).toBeGreaterThan(-1)
    expect(labels[idx - 1]).toBe('Fornecedores')
    expect(CADASTROS_CHILDREN[idx].to).toBe('/insumos')
  })

  it('desktop e mobile compartilham a MESMA árvore (a árvore é única e os 3 itens estão nela)', () => {
    const subs = NAV_TREE.flatMap((g) => g.children ?? [])
    expect(subs.some((s) => s.to === '/produtos' && s.label === 'Composição de Produtos')).toBe(
      true,
    )
    expect(subs.some((s) => s.to === '/precificacao/clientes')).toBe(true)
    expect(subs.some((s) => s.to === '/insumos')).toBe(true)
  })

  it('nenhum item pré-existente mudou de rota', () => {
    const subs = NAV_TREE.flatMap((g) => g.children ?? [])
    const rotas = subs.map((s) => s.to)
    for (const rota of [
      '/despesas',
      '/lancamentos',
      '/contas',
      '/dizimos',
      '/categorias',
      '/lucro',
      '/precificacao',
      '/precificacao/comparar',
      '/precificacao/aprovados',
      '/precificacao/dashboard',
      '/precificacao/produtos',
      '/precificacao/canais',
      '/precificacao/orcamentos',
      '/expedicao/separacao',
      '/expedicao/temas-modelos',
      '/expedicao/regras',
      '/expedicao/pedidos',
      '/expedicao/historico',
      '/producao',
      '/agenda',
      '/metas-agenda',
      '/habitos',
      '/projetos',
      '/empresas',
      '/pessoas',
      '/fornecedores',
    ]) {
      expect(rotas).toContain(rota)
    }
    expect(rotas).toHaveLength(23)
  })
})

describe('menuNav — detecção de grupo ativo e item ativo', () => {
  it('/produtos e /composicao-produtos abrem o grupo Precificação', () => {
    expect(menuGroupForUrl('/produtos', '')).toBe('/precificacao')
    expect(menuGroupForUrl('/composicao-produtos', '')).toBe('/precificacao')
  })

  it('/precificacao/clientes abre o grupo Precificação e destaca Clientes', () => {
    expect(menuGroupForUrl('/precificacao/clientes', '')).toBe('/precificacao')
    const clientes = PRECIFICACAO_CHILDREN.find((s) => s.to === '/precificacao/clientes')!
    expect(isSubItemActive(clientes, '/precificacao/clientes', '')).toBe(true)
    expect(isSubItemActive(clientes, '/precificacao/orcamentos', '')).toBe(false)
  })

  it('/insumos (e o redirect /composicao-produtos?aba=base) abrem o grupo Cadastros e destacam Insumos', () => {
    expect(menuGroupForUrl('/insumos', '')).toBe('/empresas')
    expect(menuGroupForUrl('/composicao-produtos', '?aba=base')).toBe('/empresas')
    expect(menuGroupForUrl('/produtos', '?aba=base')).toBe('/empresas')
    const insumos = CADASTROS_CHILDREN.find((s) => s.to === '/insumos')!
    expect(isSubItemActive(insumos, '/composicao-produtos', '?aba=base')).toBe(true)
    expect(isSubItemActive(insumos, '/produtos', '?aba=base')).toBe(true)
  })

  it('aba=base NÃO destaca Composição de Produtos (é a página de Insumos)', () => {
    const composicao = PRECIFICACAO_CHILDREN.find((s) => s.to === '/produtos')!
    expect(isSubItemActive(composicao, '/produtos', '')).toBe(true)
    expect(isSubItemActive(composicao, '/composicao-produtos', '')).toBe(true)
    expect(isSubItemActive(composicao, '/composicao-produtos', '?aba=base')).toBe(false)
  })

  it('rotas antigas continuam abrindo os grupos corretos (nenhum item existente regrediu)', () => {
    expect(menuGroupForUrl('/financeiro', '')).toBe('/financeiro')
    expect(menuGroupForUrl('/expedicao/separacao', '')).toBe('/expedicao/separacao')
    expect(menuGroupForUrl('/producao', '')).toBe('/expedicao/separacao')
    expect(menuGroupForUrl('/agenda', '')).toBe('/agenda')
    expect(menuGroupForUrl('/empresas', '')).toBe('/empresas')
    expect(menuGroupForUrl('/pessoas', '')).toBe('/empresas')
    expect(menuGroupForUrl('/fornecedores', '')).toBe('/empresas')
  })
})
