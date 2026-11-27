import { createContext } from 'react'

import type { CanalIcone } from '@/lib/triagemCanais'

/**
 * Fileira de canais de venda por produto (id do produto → ícones), fornecida
 * pela TriagemProdutosPage. Consumida pelo card (TriagemCardProduto) e pelas
 * linhas de membros do grupo (TriagemMembrosGrupo). Somente leitura.
 */
export const TriagemIconesContext = createContext<Map<string, CanalIcone[]>>(new Map())
