import { useMemo, useState } from 'react'
import {
  Building2,
  FolderTree,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
  Wallet,
  X,
  Layers,
  Save,
  LoaderCircle,
  HelpCircle,
} from 'lucide-react'

import { PermissionButton } from '@/components/PermissionButton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { can } from '@/lib/permissions'
import { contextoService } from '@/services/contexto'
import type {
  Conta,
  ContextoGrupo,
  ContextoGrupoComMembros,
  ContextoGrupoMembro,
  ContextoMembroTipo,
  Empresa,
  Pessoa,
  Role,
} from '@/types/domain'

const defaultPalette = [
  '#DF5830',
  '#1E6F5C',
  '#2B5BA8',
  '#A8556A',
  '#B7791F',
  '#4C3A8C',
  '#005CA9',
  '#61737E',
]

interface ContextoVisualizacaoTabProps {
  userRole?: Role
  grupos: ContextoGrupoComMembros[]
  pessoas: Pessoa[]
  empresas: Empresa[]
  contas: Conta[]
  onRefresh: () => Promise<void>
}

export function ContextoVisualizacaoTab({
  userRole,
  grupos,
  pessoas,
  empresas,
  contas,
  onRefresh,
}: ContextoVisualizacaoTabProps) {
  const { toast } = useToast()
  const canManage = can(userRole, 'manageUsers') // apenas admin/gestor gerenciam

  // Modal Grupo (Criar / Editar)
  const [grupoModal, setGrupoModal] = useState(false)
  const [editingGrupo, setEditingGrupo] = useState<ContextoGrupo | null>(null)
  const [formGrupo, setFormGrupo] = useState({
    nome: '',
    cor: '#DF5830',
    observacoes: '',
    ordem: 1,
  })
  const [savingGrupo, setSavingGrupo] = useState(false)
  const [deletandoGrupo, setDeletandoGrupo] = useState<ContextoGrupo | null>(null)

  // Modal Gerenciamento de Membros
  const [membrosModal, setMembrosModal] = useState(false)
  const [activeGrupoParaMembros, setActiveGrupoParaMembros] =
    useState<ContextoGrupoComMembros | null>(null)
  const [activeMembroTab, setActiveMembroTab] = useState<ContextoMembroTipo>('pessoa')
  const [membroSearch, setMembroSearch] = useState('')
  const [savingMembro, setSavingMembro] = useState(false)

  // Abrir criação/edição de grupo
  const openGrupoDialog = (grupo?: ContextoGrupo) => {
    setEditingGrupo(grupo || null)
    setFormGrupo(
      grupo
        ? {
            nome: grupo.nome,
            cor: grupo.cor || '#DF5830',
            observacoes: grupo.observacoes || '',
            ordem: grupo.ordem || 1,
          }
        : {
            nome: '',
            cor: defaultPalette[grupos.length % defaultPalette.length],
            observacoes: '',
            ordem: grupos.length + 1,
          },
    )
    setGrupoModal(true)
  }

  const handleSaveGrupo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formGrupo.nome.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Informe o nome do grupo de contexto.',
      })
      return
    }

    setSavingGrupo(true)
    try {
      await contextoService.saveGrupo(
        {
          nome: formGrupo.nome.trim(),
          cor: formGrupo.cor || '#DF5830',
          observacoes: formGrupo.observacoes.trim() || undefined,
          ordem: Number(formGrupo.ordem) || 1,
        },
        editingGrupo?.id,
      )

      toast({
        title: editingGrupo ? 'Grupo atualizado' : 'Grupo criado com sucesso',
        description: `O grupo "${formGrupo.nome}" já está disponível no seletor da barra lateral.`,
      })
      setGrupoModal(false)
      await onRefresh()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar grupo',
        description: apiMessage(err),
      })
    } finally {
      setSavingGrupo(false)
    }
  }

  const handleDeleteGrupo = async () => {
    if (!deletandoGrupo) return
    try {
      await contextoService.deleteGrupo(deletandoGrupo.id)
      toast({
        title: 'Grupo excluído',
        description: `O grupo "${deletandoGrupo.nome}" foi removido com sucesso.`,
      })
      setDeletandoGrupo(null)
      await onRefresh()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir grupo',
        description: apiMessage(err),
      })
    }
  }

  // Abrir modal de membros com sincronização fresca
  const openMembrosDialog = async (g: ContextoGrupoComMembros) => {
    setActiveGrupoParaMembros(g)
    setActiveMembroTab('pessoa')
    setMembroSearch('')
    setMembrosModal(true)

    // Re-fetch fresco dos membros para garantir IDs atualizados
    try {
      const freshList = await contextoService.listGruposComMembros()
      const freshGroup = freshList.find((item) => item.id === g.id)
      if (freshGroup) {
        setActiveGrupoParaMembros(freshGroup)
      }
    } catch (err) {
      console.warn('Erro ao sincronizar membros do grupo:', err)
    }
  }

  // Adicionar membro ao grupo
  const handleAddMembro = async (tipo: ContextoMembroTipo, refId: string) => {
    if (!activeGrupoParaMembros) return
    const grupoId = activeGrupoParaMembros.id
    setSavingMembro(true)
    try {
      await contextoService.addMembro(grupoId, tipo, refId)
      toast({ title: 'Membro adicionado ao grupo' })
      await onRefresh()
      // Atualiza o grupo ativo com a listagem mais fresca do backend
      const freshList = await contextoService.listGruposComMembros()
      const updated = freshList.find((g) => g.id === grupoId)
      if (updated) setActiveGrupoParaMembros(updated)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao adicionar membro',
        description: apiMessage(err),
      })
    } finally {
      setSavingMembro(false)
    }
  }

  // Remover membro do grupo
  const handleRemoveMembro = async (membroId: string) => {
    if (!activeGrupoParaMembros) return
    const grupoId = activeGrupoParaMembros.id

    // Remoção otimista imediata na UI local
    const membroRemovido = activeGrupoParaMembros.membros.find((m) => m.id === membroId)
    const refId =
      membroRemovido?.tipo === 'pessoa'
        ? membroRemovido.pessoa || membroRemovido.expand?.pessoa?.id
        : membroRemovido?.tipo === 'empresa'
          ? membroRemovido.empresa || membroRemovido.expand?.empresa?.id
          : membroRemovido?.tipo === 'conta'
            ? membroRemovido.conta || membroRemovido.expand?.conta?.id
            : null

    setActiveGrupoParaMembros((prev) => {
      if (!prev) return null
      const updatedMembros = prev.membros.filter((m) => m.id !== membroId)
      return {
        ...prev,
        membros: updatedMembros,
        pessoas:
          membroRemovido?.tipo === 'pessoa' && refId
            ? prev.pessoas.filter((p) => p.id !== refId)
            : prev.pessoas,
        empresas:
          membroRemovido?.tipo === 'empresa' && refId
            ? prev.empresas.filter((e) => e.id !== refId)
            : prev.empresas,
        contas:
          membroRemovido?.tipo === 'conta' && refId
            ? prev.contas.filter((c) => c.id !== refId)
            : prev.contas,
      }
    })

    setSavingMembro(true)
    try {
      await contextoService.removeMembro(membroId)
      toast({ title: 'Membro removido do grupo' })
      await onRefresh()
      const freshList = await contextoService.listGruposComMembros()
      const updated = freshList.find((g) => g.id === grupoId)
      if (updated) setActiveGrupoParaMembros(updated)
    } catch (err: any) {
      // 404 significa que já não existe no banco: sucesso idempotente
      if (err?.status === 404 || err?.response?.status === 404) {
        toast({ title: 'Membro removido do grupo' })
        await onRefresh()
        const freshList = await contextoService.listGruposComMembros()
        const updated = freshList.find((g) => g.id === grupoId)
        if (updated) setActiveGrupoParaMembros(updated)
      } else {
        // Erro real (permissão, rede etc.): desfaz e avisa com mensagem amigável
        toast({
          variant: 'destructive',
          title: 'Erro ao remover membro',
          description: apiMessage(err),
        })
        const freshList = await contextoService.listGruposComMembros().catch(() => [])
        const restored = freshList.find((g) => g.id === grupoId)
        if (restored) setActiveGrupoParaMembros(restored)
      }
    } finally {
      setSavingMembro(false)
    }
  }

  // Filtragem na busca de membros candidatos para adição
  const availableCandidates = useMemo(() => {
    if (!activeGrupoParaMembros) return []
    const q = membroSearch.toLowerCase().trim()

    if (activeMembroTab === 'pessoa') {
      const existingIds = new Set(activeGrupoParaMembros.pessoas.map((p) => p.id))
      return pessoas
        .filter((p) => !existingIds.has(p.id))
        .filter(
          (p) =>
            !q ||
            p.nome.toLowerCase().includes(q) ||
            p.cpf.includes(q) ||
            (p.email && p.email.toLowerCase().includes(q)),
        )
    } else if (activeMembroTab === 'empresa') {
      const existingIds = new Set(activeGrupoParaMembros.empresas.map((e) => e.id))
      return empresas
        .filter((e) => !existingIds.has(e.id))
        .filter(
          (e) =>
            !q ||
            (e.nome_fantasia && e.nome_fantasia.toLowerCase().includes(q)) ||
            (e.razao_social && e.razao_social.toLowerCase().includes(q)) ||
            (e.cnpj && e.cnpj.includes(q)),
        )
    } else {
      const existingIds = new Set(activeGrupoParaMembros.contas.map((c) => c.id))
      return contas
        .filter((c) => !existingIds.has(c.id))
        .filter(
          (c) =>
            !q ||
            c.nome.toLowerCase().includes(q) ||
            c.tipo.toLowerCase().includes(q) ||
            (c.bandeira && c.bandeira.toLowerCase().includes(q)),
        )
    }
  }, [activeGrupoParaMembros, activeMembroTab, membroSearch, pessoas, empresas, contas])

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Aba */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground sm:text-lg">
              Contextos de Visualização
            </h2>
            <Badge variant="outline" className="text-xs">
              {grupos.length} grupos
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Agrupe pessoas, empresas e contas para alternar visões personalizadas no topo da barra
            lateral (ex.: "Casa", "Filhas", "CNPJ Mario LTDA" ou "Empresas Agrupadas").
          </p>
        </div>

        {canManage && (
          <PermissionButton allowed={canManage} onClick={() => openGrupoDialog()}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo grupo de contexto
          </PermissionButton>
        )}
      </div>

      {/* Dica explicativa */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground/80 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-2.5">
          <FolderTree className="h-4 w-4 shrink-0 text-primary mt-0.5" />
          <span>
            Ao selecionar um grupo no topo do app, <strong>todas as telas de dados</strong>{' '}
            (Dashboard, Despesas, Lançamentos) exibirão exclusivamente os números e compromissos
            vinculados aos membros daquele grupo. O item padrão <strong>"Todos"</strong> mantém a
            visão global consolidada.
          </span>
        </div>
      </div>

      {/* Grid de Grupos */}
      {grupos.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <CardContent className="space-y-3 p-0">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
              <FolderTree className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-foreground">Nenhum grupo de contexto criado</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Crie seu primeiro grupo para agrupar despesas familiares ("Casa"), filhos ou suas
              empresas PJ em visões isoladas.
            </p>
            {canManage && (
              <Button onClick={() => openGrupoDialog()} size="sm" className="mt-2">
                <Plus className="mr-1.5 h-4 w-4" /> Criar grupo agora
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {grupos.map((grp) => {
            const totalMembros = grp.pessoas.length + grp.empresas.length + grp.contas.length
            return (
              <div
                key={grp.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-white p-5 shadow-soft transition hover:border-primary/40 hover:shadow-md"
              >
                {/* Faixa colorida no topo */}
                <div
                  className="absolute left-0 right-0 top-0 h-1.5"
                  style={{ background: grp.cor || '#DF5830' }}
                />

                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-xs"
                        style={{ background: grp.cor || '#DF5830' }}
                      >
                        <FolderTree className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-foreground text-sm sm:text-base">
                          {grp.nome}
                        </h3>
                        <span className="text-[10px] text-muted-foreground">
                          Ordem no seletor: #{grp.ordem || 1}
                        </span>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openGrupoDialog(grp)}
                          title="Editar grupo"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletandoGrupo(grp)}
                          title="Excluir grupo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {grp.observacoes && (
                    <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                      {grp.observacoes}
                    </p>
                  )}

                  {/* Resumo de Membros por Tipo */}
                  <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="font-semibold text-foreground">Membros agregados:</span>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {totalMembros} membros
                      </Badge>
                    </div>

                    {/* Chips com badges dos tipos */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {grp.pessoas.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-foreground">
                          <UserRound className="h-3 w-3 text-primary" />
                          {grp.pessoas.length} Pessoa(s)
                        </span>
                      )}
                      {grp.empresas.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-foreground">
                          <Building2 className="h-3 w-3 text-[#1E6F5C]" />
                          {grp.empresas.length} Empresa(s)
                        </span>
                      )}
                      {grp.contas.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-foreground">
                          <Wallet className="h-3 w-3 text-[#2B5BA8]" />
                          {grp.contas.length} Conta(s)
                        </span>
                      )}
                      {totalMembros === 0 && (
                        <span className="text-[11px] italic text-muted-foreground">
                          Nenhum membro agregado ainda.
                        </span>
                      )}
                    </div>

                    {/* Preview rápido de nomes */}
                    {totalMembros > 0 && (
                      <div className="pt-1.5 text-[11px] text-muted-foreground line-clamp-2">
                        {[
                          ...grp.pessoas.map((p) => p.nome),
                          ...grp.empresas.map((e) => e.nome_fantasia || e.razao_social),
                          ...grp.contas.map((c) => c.nome),
                        ].join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Botão de gerenciar membros */}
                <div className="mt-5 border-t border-border pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-semibold"
                    onClick={() => openMembrosDialog(grp)}
                  >
                    <Users className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    {canManage ? 'Gerenciar Membros' : 'Ver Membros'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* DIALOG CRIAR / EDITAR GRUPO */}
      <Dialog open={grupoModal} onOpenChange={setGrupoModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingGrupo ? 'Editar Grupo de Contexto' : 'Novo Grupo de Contexto'}
            </DialogTitle>
            <DialogDescription>
              Defina o nome, cor de identificação e ordem no seletor da barra lateral.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveGrupo} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do Grupo *</Label>
              <Input
                value={formGrupo.nome}
                onChange={(e) => setFormGrupo({ ...formGrupo, nome: e.target.value })}
                placeholder="Ex.: Casa, Filhas, CNPJ Mario LTDA, Empresas Agrupadas..."
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Cor de Identificação</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formGrupo.cor}
                  onChange={(e) => setFormGrupo({ ...formGrupo, cor: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                />
                <div className="flex flex-wrap gap-1.5">
                  {defaultPalette.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormGrupo({ ...formGrupo, cor: c })}
                      className="h-6 w-6 rounded-full border border-black/10 transition hover:scale-110"
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Ordem de Exibição no Menu</Label>
              <Input
                type="number"
                min={1}
                max={99}
                value={formGrupo.ordem}
                onChange={(e) =>
                  setFormGrupo({ ...formGrupo, ordem: parseInt(e.target.value, 10) || 1 })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Observações / Descrição</Label>
              <Textarea
                value={formGrupo.observacoes}
                onChange={(e) => setFormGrupo({ ...formGrupo, observacoes: e.target.value })}
                placeholder="Ex.: Reúne todas as pessoas e contas do orçamento doméstico familiar..."
                rows={3}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGrupoModal(false)}
                disabled={savingGrupo}
              >
                Cancelar
              </Button>
              <Button disabled={savingGrupo}>
                {savingGrupo ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar Grupo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG GERENCIAR MEMBROS DO GRUPO */}
      <Dialog open={membrosModal} onOpenChange={setMembrosModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span
                className="grid h-7 w-7 place-items-center rounded-lg text-white shadow-xs"
                style={{ background: activeGrupoParaMembros?.cor || '#DF5830' }}
              >
                <FolderTree className="h-4 w-4" />
              </span>
              <DialogTitle>Membros de "{activeGrupoParaMembros?.nome}"</DialogTitle>
            </div>
            <DialogDescription>
              Adicione ou remova Pessoas, Empresas e Contas bancárias/cartões vinculadas a este
              grupo.
            </DialogDescription>
          </DialogHeader>

          {activeGrupoParaMembros && (
            <div className="space-y-6">
              {/* LISTA ATUAL DE MEMBROS */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Membros Vinculados ({activeGrupoParaMembros.membros.length})
                </h4>

                {activeGrupoParaMembros.membros.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    Nenhum membro cadastrado neste grupo. Utilize a busca abaixo para adicionar
                    Pessoas, Empresas ou Contas.
                  </div>
                ) : (
                  <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-secondary/15">
                    {activeGrupoParaMembros.membros.map((m) => {
                      const isPessoa = m.tipo === 'pessoa'
                      const isEmpresa = m.tipo === 'empresa'
                      const isConta = m.tipo === 'conta'

                      const title = isPessoa
                        ? m.expand?.pessoa?.nome || 'Pessoa'
                        : isEmpresa
                          ? m.expand?.empresa?.nome_fantasia ||
                            m.expand?.empresa?.razao_social ||
                            'Empresa'
                          : m.expand?.conta?.nome || 'Conta'

                      const subtitle = isPessoa
                        ? m.expand?.pessoa?.cpf
                          ? `CPF: ${m.expand.pessoa.cpf}`
                          : 'Pessoa física'
                        : isEmpresa
                          ? m.expand?.empresa?.cnpj
                            ? `CNPJ: ${m.expand.empresa.cnpj}`
                            : 'Empresa PJ'
                          : m.expand?.conta?.tipo
                            ? `Tipo: ${m.expand.conta.tipo}`
                            : 'Conta financeira'

                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between p-3 transition hover:bg-secondary/40"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white ${
                                isPessoa
                                  ? 'bg-[#DF5830]'
                                  : isEmpresa
                                    ? 'bg-[#1E6F5C]'
                                    : 'bg-[#2B5BA8]'
                              }`}
                            >
                              {isPessoa ? (
                                <UserRound className="h-4 w-4" />
                              ) : isEmpresa ? (
                                <Building2 className="h-4 w-4" />
                              ) : (
                                <Wallet className="h-4 w-4" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-bold text-xs text-foreground sm:text-sm">
                                {title}
                              </p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {subtitle} · <span className="capitalize">{m.tipo}</span>
                              </p>
                            </div>
                          </div>

                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveMembro(m.id)}
                              disabled={savingMembro}
                              title="Remover do grupo"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* SEÇÃO: ADICIONAR NOVO MEMBRO */}
              {canManage && (
                <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Adicionar Membro ao Grupo
                  </h4>

                  {/* Seletor de Tipo */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveMembroTab('pessoa')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition ${
                        activeMembroTab === 'pessoa'
                          ? 'border-primary bg-primary text-white shadow-xs'
                          : 'border-border bg-secondary/30 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <UserRound className="h-3.5 w-3.5" />
                      Pessoas ({pessoas.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMembroTab('empresa')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition ${
                        activeMembroTab === 'empresa'
                          ? 'border-[#1E6F5C] bg-[#1E6F5C] text-white shadow-xs'
                          : 'border-border bg-secondary/30 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Empresas ({empresas.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMembroTab('conta')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition ${
                        activeMembroTab === 'conta'
                          ? 'border-[#2B5BA8] bg-[#2B5BA8] text-white shadow-xs'
                          : 'border-border bg-secondary/30 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      Contas ({contas.length})
                    </button>
                  </div>

                  {/* Busca */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={membroSearch}
                      onChange={(e) => setMembroSearch(e.target.value)}
                      placeholder={`Buscar ${
                        activeMembroTab === 'pessoa'
                          ? 'por nome ou CPF...'
                          : activeMembroTab === 'empresa'
                            ? 'por razão social, fantasia ou CNPJ...'
                            : 'por nome da conta ou cartão...'
                      }`}
                      className="pl-9 text-xs"
                    />
                  </div>

                  {/* Lista de Candidatos */}
                  <div className="max-h-48 overflow-y-auto divide-y divide-border rounded-xl border border-border">
                    {availableCandidates.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        {membroSearch
                          ? 'Nenhum cadastro encontrado para a busca.'
                          : 'Todos os cadastros deste tipo já foram adicionados a este grupo.'}
                      </div>
                    ) : (
                      availableCandidates.map((candidate: any) => {
                        const name =
                          activeMembroTab === 'pessoa'
                            ? candidate.nome
                            : activeMembroTab === 'empresa'
                              ? candidate.nome_fantasia || candidate.razao_social
                              : candidate.nome

                        const detail =
                          activeMembroTab === 'pessoa'
                            ? candidate.cpf
                              ? `CPF ${candidate.cpf}`
                              : 'Pessoa'
                            : activeMembroTab === 'empresa'
                              ? candidate.cnpj
                                ? `CNPJ ${candidate.cnpj}`
                                : 'Empresa PJ'
                              : `${candidate.tipo} ${candidate.bandeira ? `(${candidate.bandeira})` : ''}`

                        return (
                          <div
                            key={candidate.id}
                            className="flex items-center justify-between p-2.5 transition hover:bg-secondary/40"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <p className="truncate text-xs font-bold text-foreground">{name}</p>
                              <p className="truncate text-[10px] text-muted-foreground">{detail}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={savingMembro}
                              onClick={() => handleAddMembro(activeMembroTab, candidate.id)}
                            >
                              <Plus className="mr-1 h-3 w-3" /> Adicionar
                            </Button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setMembrosModal(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAR EXCLUSÃO DE GRUPO */}
      <AlertDialog open={!!deletandoGrupo} onOpenChange={(o) => !o && setDeletandoGrupo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir grupo de contexto?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá o grupo "{deletandoGrupo?.nome}" e desvinculará seus membros. Nenhum
              cadastro de pessoa, empresa, conta ou lançamento será excluído do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteGrupo}
            >
              Excluir Grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
