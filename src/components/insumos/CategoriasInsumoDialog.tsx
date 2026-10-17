import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Edit2, Trash2, Tag, Check, Palette } from 'lucide-react'
import type { InsumoCategoriaRecord } from '@/types/domain'
import { insumosService } from '@/services/insumos'
import { useToast } from '@/hooks/use-toast'

interface CategoriasInsumoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCategoriaUpdated?: () => void
}

const CORES_SUGERIDAS = [
  '#DF5830', // Laranja tema GKza
  '#0284C7', // Azul
  '#0D9488', // Verde água / Petróleo
  '#E11D48', // Rosa escuro
  '#D97706', // Âmbar / Mostarda
  '#7C3AED', // Roxo
  '#10B981', // Verde esmeralda
  '#EC4899', // Pink
  '#64748B', // Cinza azulado
  '#6366F1', // Índigo
]

export function CategoriasInsumoDialog({
  open,
  onOpenChange,
  onCategoriaUpdated,
}: CategoriasInsumoDialogProps) {
  const { toast } = useToast()
  const [categorias, setCategorias] = useState<InsumoCategoriaRecord[]>([])
  const [loading, setLoading] = useState(false)

  // Form de edição/criação
  const [editando, setEditando] = useState<InsumoCategoriaRecord | null>(null)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState('#DF5830')
  const [salvando, setSalvando] = useState(false)
  const [modoForm, setModoForm] = useState(false)

  // Exclusão
  const [categoriaParaExcluir, setCategoriaParaExcluir] = useState<InsumoCategoriaRecord | null>(
    null,
  )
  const [excluindo, setExcluindo] = useState(false)

  const carregar = async () => {
    try {
      setLoading(true)
      const lista = await insumosService.listCategorias()
      setCategorias(lista)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar categorias',
        description: 'Não foi possível carregar a lista de categorias de insumos.',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      carregar()
      resetForm()
    }
  }, [open])

  function resetForm() {
    setEditando(null)
    setNome('')
    setCor('#DF5830')
    setModoForm(false)
  }

  function iniciarCriacao() {
    setEditando(null)
    setNome('')
    setCor(CORES_SUGERIDAS[categorias.length % CORES_SUGERIDAS.length] || '#DF5830')
    setModoForm(true)
  }

  function iniciarEdicao(c: InsumoCategoriaRecord) {
    setEditando(c)
    setNome(c.nome)
    setCor(c.cor || '#DF5830')
    setModoForm(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return

    try {
      setSalvando(true)
      if (editando) {
        await insumosService.updateCategoria(editando.id, {
          nome: nome.trim(),
          cor,
        })
        toast({
          title: 'Categoria atualizada',
          description: `A categoria "${nome.trim()}" foi atualizada com sucesso.`,
        })
      } else {
        await insumosService.createCategoria({
          nome: nome.trim(),
          cor,
          ordem: (categorias.length + 1) * 10,
          ativo: true,
        })
        toast({
          title: 'Categoria criada',
          description: `A categoria "${nome.trim()}" foi cadastrada.`,
        })
      }
      resetForm()
      await carregar()
      onCategoriaUpdated?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar categoria'
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar',
        description: msg.includes('unique')
          ? 'Já existe uma categoria cadastrada com este nome.'
          : msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    if (!categoriaParaExcluir) return
    try {
      setExcluindo(true)
      await insumosService.deleteCategoria(categoriaParaExcluir.id)
      toast({
        title: 'Categoria excluída',
        description: `Categoria "${categoriaParaExcluir.nome}" foi removida.`,
      })
      setCategoriaParaExcluir(null)
      await carregar()
      onCategoriaUpdated?.()
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir esta categoria.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Tag className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  Categorias de Insumos & Serviços
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Crie, edite ou exclua categorias (ex.: Embalagem, Tecido, Serviço de Costura) para
                  organizar seus insumos.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Botão de Adicionar / Formulário */}
          {modoForm ? (
            <form
              onSubmit={handleSalvar}
              className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  {editando ? `Editar: ${editando.nome}` : 'Nova Categoria'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground"
                  onClick={resetForm}
                >
                  Cancelar
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Nome da Categoria *</Label>
                <Input
                  required
                  placeholder="Ex: Embalagem, Tecido, Aviamento..."
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                  Cor de Identificação
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={cor}
                    onChange={(e) => setCor(e.target.value)}
                    className="h-8 w-12 rounded border border-border cursor-pointer bg-white"
                    title="Selecione a cor"
                  />
                  <Input
                    type="text"
                    value={cor}
                    onChange={(e) => setCor(e.target.value)}
                    placeholder="#DF5830"
                    className="h-8 text-xs font-mono w-28 uppercase bg-white"
                  />
                  <div className="flex items-center gap-1 flex-wrap">
                    {CORES_SUGERIDAS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCor(c)}
                        style={{ backgroundColor: c }}
                        className={`h-5 w-5 rounded-full border border-black/10 transition-transform ${
                          cor.toLowerCase() === c.toLowerCase()
                            ? 'scale-125 ring-2 ring-primary ring-offset-1'
                            : ''
                        }`}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={salvando || !nome.trim()}
                  size="sm"
                  className="h-8 bg-primary text-white text-xs font-bold"
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  {salvando ? 'Salvando...' : editando ? 'Atualizar Categoria' : 'Criar Categoria'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {categorias.length}{' '}
                {categorias.length === 1 ? 'categoria cadastrada' : 'categorias cadastradas'}
              </span>
              <Button
                size="sm"
                className="h-7 text-xs bg-primary text-white font-bold"
                onClick={iniciarCriacao}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Nova Categoria
              </Button>
            </div>
          )}

          {/* Listagem de categorias */}
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {loading && categorias.length === 0 ? (
              <p className="text-xs text-center py-6 text-muted-foreground">
                Carregando categorias...
              </p>
            ) : categorias.length === 0 ? (
              <p className="text-xs text-center py-6 text-muted-foreground">
                Nenhuma categoria cadastrada ainda.
              </p>
            ) : (
              categorias.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 hover:bg-muted/40 transition-colors text-xs gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-4 w-4 rounded-full shrink-0 border border-black/10 shadow-xs"
                      style={{ backgroundColor: cat.cor || '#DF5830' }}
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-foreground block truncate">{cat.nome}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono"
                      style={{
                        borderColor: cat.cor ? `${cat.cor}66` : undefined,
                        color: cat.cor || undefined,
                      }}
                    >
                      {cat.cor || '#DF5830'}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => iniciarEdicao(cat)}
                      title="Editar"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => setCategoriaParaExcluir(cat)}
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={Boolean(categoriaParaExcluir)}
        onOpenChange={(op) => !op && setCategoriaParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria de insumo?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Tem certeza de que deseja excluir a categoria &quot;{categoriaParaExcluir?.nome}
              &quot;? Os insumos cadastrados nela manterão seus dados, mas ficarão desvinculados
              desta categoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              disabled={excluindo}
              className="bg-destructive text-white"
            >
              {excluindo ? 'Excluindo...' : 'Confirmar Exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
