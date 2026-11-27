import { describe, expect, it } from 'vitest'

import { canaisDoProduto, type CanalLite } from './triagemCanais'

const canais: CanalLite[] = [
  { id: 'c1', nome: 'Shopee', cor: '#EE4D2D', ativo: true },
  { id: 'c2', nome: 'Site', cor: '#000000', ativo: true },
  { id: 'c3', nome: 'Antigo', cor: '#123456', ativo: false },
]

describe('canaisDoProduto (fileira de canais da Triagem)', () => {
  it('canal com preço aprovado fica classificado com cor original; demais cinza', () => {
    const icones = canaisDoProduto(
      [{ canal: 'c1', status: 'aprovada', preco_aprovado: 49.9, updated: '2026-01-01' }],
      canais,
    )
    expect(icones.map((i) => i.canalId)).toEqual(['c1', 'c2'])
    expect(icones[0].classificado).toBe(true)
    expect(icones[0].cor).toBe('#EE4D2D')
    expect(icones[0].inicial).toBe('S')
    expect(icones[1].classificado).toBe(false)
  })

  it('produto sem nenhuma classificação: todos os círculos cinza', () => {
    const icones = canaisDoProduto([], canais)
    expect(icones.every((i) => !i.classificado)).toBe(true)
    expect(icones.every((i) => i.rotuloTooltip.endsWith('sem preço aprovado'))).toBe(true)
  })

  it('canais inativos não aparecem', () => {
    const icones = canaisDoProduto([], canais)
    expect(icones.find((i) => i.canalId === 'c3')).toBeUndefined()
  })

  it('tooltip mostra o preço aprovado quando existe', () => {
    const icones = canaisDoProduto(
      [{ canal: 'c2', status: 'aprovada', preco_aprovado: 12.5 }],
      canais,
    )
    expect(icones[1].rotuloTooltip).toContain('Site')
    expect(icones[1].rotuloTooltip).toContain('aprovado')
    expect(icones[1].rotuloTooltip).toContain('12,50')
  })

  it('ignora cenário sem preço ou com status fora de aprovada/desatualizada', () => {
    const icones = canaisDoProduto(
      [
        { canal: 'c1', status: 'aprovada', preco_aprovado: 0 },
        { canal: 'c1', status: 'rascunho', preco_aprovado: 30 },
      ],
      canais,
    )
    expect(icones[0].classificado).toBe(false)
  })

  it('desatualizada conta, mas aprovada tem prioridade sobre ela', () => {
    const icones = canaisDoProduto(
      [
        { canal: 'c1', status: 'desatualizada', preco_aprovado: 20, updated: '2026-03-01' },
        { canal: 'c1', status: 'aprovada', preco_aprovado: 25, updated: '2026-01-01' },
      ],
      canais,
    )
    expect(icones[0].classificado).toBe(true)
    expect(icones[0].precoAprovado).toBe(25)
  })

  it('entre cenários de mesmo status, vence o mais recente', () => {
    const icones = canaisDoProduto(
      [
        { canal: 'c1', status: 'aprovada', preco_aprovado: 10, updated: '2026-01-01' },
        { canal: 'c1', status: 'aprovada', preco_aprovado: 15, updated: '2026-02-01' },
      ],
      canais,
    )
    expect(icones[0].precoAprovado).toBe(15)
  })
})
