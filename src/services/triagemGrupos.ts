import pb from '@/lib/pocketbase/client'
import {
  montarGruposSalvos,
  normalizarMembros,
  type TriagemGrupo,
  type TriagemGrupoRecord,
} from '@/lib/triagemGrupos'

/**
 * Persistência dos grupos manuais da Triagem de Produtos.
 *
 * Regra gravada (protocolo acordado, migração 0153): um registro em
 * `prec_triagem_grupos` por grupo, com `titulo` (texto opcional — sem título
 * a UI mostra "Grupo"), `ordem` (number, posição na grade) e `membros`
 * (JSON array de ids de prec_produtos NA ORDEM — o PRIMEIRO é o card da
 * frente da pilha). Cards soltos não geram registro: sua ordem vem da
 * ordenação padrão (ordenarPorAtraso) e vale só na sessão.
 */
const COLECAO = 'prec_triagem_grupos'

/** Carrega todos os grupos salvos, ordenados pela `ordem` gravada. */
export async function carregarGruposTriagem(): Promise<TriagemGrupo[]> {
  const registros = await pb.collection(COLECAO).getFullList<TriagemGrupoRecord>({
    sort: 'ordem,created',
  })
  return montarGruposSalvos(registros.map((r) => ({ ...r, membros: normalizarMembros(r.membros) })))
}

export interface SalvarGrupoTriagemInput {
  /** id real do registro; ausente ou tmp_* → cria. */
  id?: string
  titulo: string
  ordem: number
  membros: string[]
}

/** Cria ou atualiza um grupo e devolve o registro persistido. */
export async function salvarGrupoTriagem(
  input: SalvarGrupoTriagemInput,
): Promise<TriagemGrupoRecord> {
  const dados = { titulo: input.titulo, ordem: input.ordem, membros: input.membros }
  if (input.id && !input.id.startsWith('tmp_')) {
    return await pb.collection(COLECAO).update<TriagemGrupoRecord>(input.id, dados)
  }
  return await pb.collection(COLECAO).create<TriagemGrupoRecord>(dados)
}

/** Exclui o registro do grupo (usado ao desfazer grupo / grupo esvaziado). */
export async function excluirGrupoTriagem(id: string): Promise<void> {
  if (id.startsWith('tmp_')) return
  await pb.collection(COLECAO).delete(id)
}
