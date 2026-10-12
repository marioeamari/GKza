import { describe, it, expect } from 'vitest'
import { MobileSubpageItem } from '@/components/MobileSubpagesMenu'
import { Calculator } from 'lucide-react'

describe('Validação de Contrato do Menu Mobile e Subpáginas', () => {
  it('garante estrutura correta de itens de subpágina', () => {
    const item: MobileSubpageItem = {
      to: '/precificacao/comparar',
      label: 'Comparador',
      description: 'Simulações',
      icon: Calculator,
    }

    expect(item.to).toBe('/precificacao/comparar')
    expect(item.label).toBe('Comparador')
  })
})
