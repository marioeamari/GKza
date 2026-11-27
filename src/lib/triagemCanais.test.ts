import { describe, expect, it } from 'vitest'

import {
  canaisDoProduto,
  chaveProdutoCanal,
  iconesCanaisPorProduto,
  type CanalLite,
  type MapaPrecoPorProdCanal,
} from './triagemCanais'

const canais: CanalLite[] = [
  { id: 'c1', nome: 'Shopee', cor: '#EE4D2D', ativo: true },
  { id: 'c2', nome: 'Site', cor: '#000000', ativo: true },
  { id: 'c3', nome: 'Antigo', cor: '#123456', ativo: false },
]

const mapa: MapaPrecoPorProdCanal = {
  [chaveProdutoCanal('p1', 'c1')]: { preco_aprovado: 24.9 },
  [chaveProdutoCanal('p2', 'c2')]: { preco_aprovado: 12.5 },
}

describe('canaisDoProduto (fileira de canais da Triagem)', () => {
  it('canal presente no mapa oficial fica classificado com cor original; demais cinza', () => {
    const icones = canaisDoProduto('p1', mapa, canais)
    expect(icones.map((i) => i.canalId)).toEqual(['c1', 'c2'])
    expect(icones[0].classificado).toBe(true)
    expect(icones[0].cor).toBe('#EE4D2D')
    expect(icones[0].inicial).toBe('S')
    expect(icones[1].classificado).toBe(false)
  })

  it('produto sem nenhuma classificação: todos os círculos cinza', () => {
    const icones = canaisDoProduto('p-sem', mapa, canais)
    expect(icones.every((i) => !i.classificado)).toBe(true)
    expect(icones.every((i) => i.rotuloTooltip.endsWith('sem preço aprovado'))).toBe(true)
  })

  it('canais inativos não aparecem', () => {
    const icones = canaisDoProduto('p1', mapa, canais)
    expect(icones.find((i) => i.canalId === 'c3')).toBeUndefined()
  })

  it('tooltip mostra o nome do canal e o preço aprovado quando existe', () => {
    const icones = canaisDoProduto('p2', mapa, canais)
    expect(icones[1].rotuloTooltip).toContain('Site')
    expect(icones[1].rotuloTooltip).toContain('aprovado')
    expect(icones[1].rotuloTooltip).toContain('12,50')
  })

  it('entrada com preço zero não conta como classificada', () => {
    const icones = canaisDoProduto(
      'p3',
      { [chaveProdutoCanal('p3', 'c1')]: { preco_aprovado: 0 } },
      canais,
    )
    expect(icones[0].classificado).toBe(false)
  })
})

describe('iconesCanaisPorProduto', () => {
  it('monta uma fileira por produto da Triagem, na mesma ordem dos canais', () => {
    const mapaIcones = iconesCanaisPorProduto(['p1', 'p2'], mapa, canais)
    expect(mapaIcones.get('p1')?.[0].classificado).toBe(true)
    expect(mapaIcones.get('p2')?.[0].classificado).toBe(false)
    expect(mapaIcones.get('p2')?.[1].classificado).toBe(true)
  })
})
