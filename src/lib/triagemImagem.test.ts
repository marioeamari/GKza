import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { urlImagemProdutoTriagem } from './triagemImagem'

/**
 * Base usada nos testes: stubamos a env ANTES de importar/consumir o helper
 * (resolvePocketBaseBaseUrl() lê import.meta.env em cada chamada), então a
 * asserção não depende de VITE_POCKETBASE_URL definida no ambiente de teste.
 */
const BASE = 'http://pb.teste.local'

beforeEach(() => {
  vi.stubEnv('VITE_POCKETBASE_URL', BASE)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * Inputs completos: helpers que preenchem os campos exigidos por
 * Pick<TriagemProdutoInput, ...> (id, imagem, origem_id, tipo, ...).
 */
const baseInput = {
  nome: 'Produto',
  sku: 'SKU-1',
  tipo: 'revenda',
  created: '2026-01-01T10:00:00.000Z',
} as const

// Registro REAL do banco (Kit 5 Banho Isa — print do usuário com imagem quebrada):
// upload da foto acontece no PRÓPRIO espelho prec_produtos (KitDialog manda FormData).
const KIT_REAL = {
  ...baseInput,
  id: 'w5wlaxyof4dpe6t',
  imagem: '5_banho_isa_capa_aeq8o3pvam.jpg',
  origem_id: '',
  tipo: 'kit',
}

// Registro real do banco: espelho de revenda com origem em Produto Composto;
// produtos.imagem do registro de origem está VAZIO, e o nome no espelho
// (…_0v26vxy9mq.jpg) é FABRICADO — não bate com nenhum arquivo físico.
// O nome REAL chega injetado em fornecedor_produto_imagem (services/triagem.ts).
const ESPELHO_REVENDA = {
  ...baseInput,
  id: 'pj43k9fmabivuse',
  imagem: 'banho_isa_jnocmtk3e3_0v26vxy9mq.jpg',
  origem_id: 'vn96ojmihvbrqd3',
  fornecedor_produto_id: 'p18o8y0u6hxsrqz',
  fornecedor_produto_imagem: 'banho_isa_jnocmtk3e3.jpg',
}

describe('urlImagemProdutoTriagem', () => {
  it('retorna undefined quando não há imagem (placeholder com inicial do SKU)', () => {
    expect(urlImagemProdutoTriagem({ ...baseInput, id: 'abc123', imagem: '' })).toBeUndefined()
    expect(urlImagemProdutoTriagem({ ...baseInput, id: 'abc123' })).toBeUndefined()
    expect(urlImagemProdutoTriagem(undefined as any)).toBeUndefined()
  })

  it('CASO REAL: kit KIT-BIsa-5 resolve pela coleção prec_produtos (upload acontece no espelho)', () => {
    const url = urlImagemProdutoTriagem(KIT_REAL)
    expect(url).toBe(
      `${BASE}/api/files/prec_produtos/w5wlaxyof4dpe6t/5_banho_isa_capa_aeq8o3pvam.jpg?thumb=100x100`,
    )
  })

  it('kit SEM origem_id resolve pela coleção prec_produtos mesmo com tipo kit', () => {
    const url = urlImagemProdutoTriagem({
      ...baseInput,
      id: 'kitSemOrigem',
      imagem: 'kit_foto.jpg',
      origem_id: '',
      tipo: 'kit',
    })
    expect(url).toBe(`${BASE}/api/files/prec_produtos/kitSemOrigem/kit_foto.jpg?thumb=100x100`)
  })

  it('espelho legado (sem origem_id) usa a coleção prec_produtos — não produtos', () => {
    const url = urlImagemProdutoTriagem({ ...baseInput, id: 'espelho1', imagem: 'legado.jpg' })
    expect(url).toBe(`${BASE}/api/files/prec_produtos/espelho1/legado.jpg?thumb=100x100`)
  })

  it('CASO REAL: espelho de revenda usa a foto REAL do catálogo de fornecedor (fornecedores_produtos)', () => {
    const url = urlImagemProdutoTriagem(ESPELHO_REVENDA)
    // Coleção e registro corretos (não produtos/, nem prec_produtos/)
    expect(url).toBe(
      `${BASE}/api/files/fornecedores_produtos/p18o8y0u6hxsrqz/banho_isa_jnocmtk3e3.jpg?thumb=100x100`,
    )
    // Nome fabricado do espelho nunca entra na URL
    expect(url).not.toContain('0v26vxy9mq')
  })

  it('sem fallback= na URL — nome real chega injetado, a URL sai completa', () => {
    const url = urlImagemProdutoTriagem(ESPELHO_REVENDA)
    expect(url).not.toContain('fallback=')
    expect(url).not.toContain('/api/files/fornecedores_produtos/p18o8y0u6hxsrqz/?')
  })

  it('espelho com origem_id e imagem_produtos usa a coleção produtos', () => {
    const url = urlImagemProdutoTriagem({
      ...baseInput,
      id: 'esp1',
      imagem: 'nome_fabricado.jpg',
      origem_id: 'origem9',
      imagem_produtos: 'foto_real.jpg',
    })
    expect(url).toBe(`${BASE}/api/files/produtos/origem9/foto_real.jpg?thumb=100x100`)
  })

  it('espelho com origem_id SEM imagem_produtos nem fornecedor usa último recurso prec_produtos', () => {
    const url = urlImagemProdutoTriagem({
      ...baseInput,
      id: 'esp2',
      imagem: 'upload_antigo.jpg',
      origem_id: 'origem9',
    })
    expect(url).toBe(`${BASE}/api/files/prec_produtos/esp2/upload_antigo.jpg?thumb=100x100`)
  })

  it('espelho com origem_id e NENHUM arquivo conhecido: undefined (placeholder)', () => {
    const url = urlImagemProdutoTriagem({
      ...baseInput,
      id: 'esp4',
      imagem: '',
      origem_id: 'origem9',
    })
    expect(url).toBeUndefined()
  })

  it('nunca devolve string vazia — devolve undefined ou URL válida', () => {
    const url = urlImagemProdutoTriagem({ ...baseInput, id: 'esp3', imagem: 'x.png' })
    expect(url === undefined || url.length > 0).toBe(true)
  })

  it('blob:/data: (preview local) passam direto', () => {
    expect(urlImagemProdutoTriagem({ ...baseInput, id: 'a', imagem: 'blob:http://x/y' })).toBe(
      'blob:http://x/y',
    )
    expect(
      urlImagemProdutoTriagem({ ...baseInput, id: 'a', imagem: 'data:image/png;base64,xyz' }),
    ).toBe('data:image/png;base64,xyz')
  })
})
