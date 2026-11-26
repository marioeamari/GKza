import { describe, expect, it } from 'vitest'

import { urlImagemProdutoTriagem } from './triagemImagem'

/**
 * Base usada nos testes: a mesma que o helper resolve em runtime.
 * No ambiente de teste não há VITE_POCKETBASE_URL nem window.location real,
 * então resolvePocketBaseBaseUrl() cai no origin do jsdom (http://localhost:3000).
 */
const BASE = 'http://localhost:3000'

// Registro REAL do banco (Kit 5 Banho Isa — print do usuário com imagem quebrada):
// upload da foto acontece no PRÓPRIO espelho prec_produtos (KitDialog manda FormData).
const KIT_REAL = {
  id: 'vgzc5dyals4t8vf',
  imagem: 'banho_isa_5_qz4upqjynl.jpg',
  origem_id: '',
  tipo: 'kit',
}

// Registro real do banco: espelho de revenda com origem em Produto Composto;
// produtos.imagem do registro de origem está VAZIO, e o nome no espelho
// (…_0v26vxy9mq.jpg) é FABRICADO — não bate com nenhum arquivo físico.
const ESPELHO_REVENDA = {
  id: 'dqnyc901ataaoyw',
  imagem: 'banho_isa_jnocmtk3e3_0v26vxy9mq.jpg',
  origem_id: 'kq2px802x9e6kgr',
  tipo: 'revenda',
  fornecedor_produto_id: 'p18o8y0u6hxsrqz',
  fornecedor_produto_imagem: 'banho_isa_jnocmtk3e3.jpg',
}

describe('urlImagemProdutoTriagem', () => {
  it('retorna undefined quando não há imagem (placeholder com inicial do SKU)', () => {
    expect(urlImagemProdutoTriagem({ id: 'abc123', imagem: '' })).toBeUndefined()
    expect(urlImagemProdutoTriagem({ id: 'abc123' })).toBeUndefined()
    expect(urlImagemProdutoTriagem(undefined as any)).toBeUndefined()
  })

  it('CASO REAL: kit KIT-BIsa-5 resolve pela coleção prec_produtos (upload acontece no espelho)', () => {
    const url = urlImagemProdutoTriagem(KIT_REAL)
    expect(url).toBe(
      `${BASE}/api/files/prec_produtos/vgzc5dyals4t8vf/banho_isa_5_qz4upqjynl.jpg?thumb=100x100`,
    )
  })

  it('kit SEM origem_id resolve pela coleção prec_produtos mesmo com tipo kit', () => {
    const url = urlImagemProdutoTriagem({
      id: 'kitSemOrigem',
      imagem: 'kit_foto.jpg',
      origem_id: '',
      tipo: 'kit',
    })
    expect(url).toBe(`${BASE}/api/files/prec_produtos/kitSemOrigem/kit_foto.jpg?thumb=100x100`)
  })

  it('espelho legado (sem origem_id) usa a coleção prec_produtos — não produtos', () => {
    const url = urlImagemProdutoTriagem({ id: 'espelho1', imagem: 'legado.jpg' })
    expect(url).toBe(`${BASE}/api/files/prec_produtos/espelho1/legado.jpg?thumb=100x100`)
  })

  it('CASO REAL: espelho de revenda usa a foto REAL do catálogo de fornecedor (fornecedores_produtos)', () => {
    const url = urlImagemProdutoTriagem(ESPELHO_REVENDA)
    // Coleção e registro corretos (não produtos/, nem prec_produtos/)
    expect(url).toContain('/api/files/fornecedores_produtos/p18o8y0u6hxsrqz/')
    expect(url).toContain('banho_isa_jnocmtk3e3.jpg')
    expect(url).not.toContain('0v26vxy9mq')
  })

  it('espelho de revenda carrega fallback do pb_hook para completar filename em runtime', () => {
    const url = urlImagemProdutoTriagem(ESPELHO_REVENDA)
    const [principal, fallback] = (url || '').split('&fallback=')
    // URL principal: filename real do registro fornecedor_produto
    expect(principal).toBe(
      `${BASE}/api/files/fornecedores_produtos/p18o8y0u6hxsrqz/banho_isa_jnocmtk3e3.jpg?thumb=100x100`,
    )
    // fallback: rota do pb_hook (triagem_imagem.js) com filename vazio
    expect(fallback).toBe(`${BASE}/api/files/fornecedores_produtos/p18o8y0u6hxsrqz/?thumb=100x100`)
  })

  it('espelho com origem_id e imagem_produtos usa a coleção produtos', () => {
    const url = urlImagemProdutoTriagem({
      id: 'esp1',
      imagem: 'nome_fabricado.jpg',
      origem_id: 'origem9',
      tipo: 'revenda',
      imagem_produtos: 'foto_real.jpg',
    })
    expect(url).toBe(`${BASE}/api/files/produtos/origem9/foto_real.jpg?thumb=100x100`)
  })

  it('espelho com origem_id SEM imagem_produtos nem fornecedor usa último recurso prec_produtos', () => {
    const url = urlImagemProdutoTriagem({
      id: 'esp2',
      imagem: 'upload_antigo.jpg',
      origem_id: 'origem9',
      tipo: 'revenda',
    })
    expect(url).toBe(`${BASE}/api/files/prec_produtos/esp2/upload_antigo.jpg?thumb=100x100`)
  })

  it('nunca devolve string vazia — devolve undefined ou URL válida', () => {
    const url = urlImagemProdutoTriagem({ id: 'esp3', imagem: 'x.png' })
    expect(url === undefined || url.length > 0).toBe(true)
  })

  it('blob:/data: (preview local) passam direto', () => {
    expect(urlImagemProdutoTriagem({ id: 'a', imagem: 'blob:http://x/y' })).toBe('blob:http://x/y')
    expect(urlImagemProdutoTriagem({ id: 'a', imagem: 'data:image/png;base64,xyz' })).toBe(
      'data:image/png;base64,xyz',
    )
  })
})
