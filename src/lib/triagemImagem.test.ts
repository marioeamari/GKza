import { describe, expect, it } from 'vitest'

import { urlImagemProdutoTriagem } from './triagemImagem'

describe('urlImagemProdutoTriagem', () => {
  it('retorna undefined quando não há imagem (placeholder com inicial do SKU)', () => {
    expect(urlImagemProdutoTriagem({ id: 'abc123', imagem: '' })).toBeUndefined()
    expect(urlImagemProdutoTriagem({ id: 'abc123' })).toBeUndefined()
  })

  it('espelho com origem_id resolve a URL pela coleção produtos (onde o arquivo existe)', () => {
    const url = urlImagemProdutoTriagem({
      id: 'espelho1',
      imagem: 'foto_produto.jpg',
      origem_id: 'produtoOrigem9',
    })
    expect(url).toContain('/api/files/produtos/produtoOrigem9/foto_produto.jpg')
    expect(url).toContain('thumb=100x100')
  })

  it('espelho sem origem_id usa o próprio id (legado)', () => {
    const url = urlImagemProdutoTriagem({ id: 'espelho1', imagem: 'legado.jpg' })
    expect(url).toContain('/api/files/produtos/espelho1/legado.jpg')
  })

  it('nunca devolve string vazia — devolve undefined ou URL válida', () => {
    const url = urlImagemProdutoTriagem({ id: 'espelho1', imagem: 'x.png' })
    expect(url === undefined || url.length > 0).toBe(true)
  })
})
