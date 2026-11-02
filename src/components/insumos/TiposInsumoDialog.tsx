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
import { Plus, Edit2, Trash2, Layers, Check, Palette, AlertTriangle } from 'lucide-react'
import type { InsumoTipoRecord } from '@/types/domain'
import { insumosService } from '@/services/insumos'
import { useToast } from '@/hooks/use-toast'

export interface TiposInsumoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTipoUpdated?: () => void
  onTipoCreated?: (novoTipo: InsumoTipoRecord) => void
}

const CORES_SUGERIDAS = [
  '#DF5830', // Laranja tema GKza
  '#0284C7', // Azul
  '#D97706', // Âmbar
  '#7C3AED', // Roxo
  '#10B981', // Verde
  '#0D9488', // Verde água / Petróleo
  '#E11D48', // Vermelho / Rosa escuro
  '#6366F1', // Índigo
  '#64748B', // Cinza azulado
  '#EC4899', // Pink
]

export function TiposInsumoDialog({
  open,
  onOpenChange,
  onTipoUpdated,
  onTipoCreated,
}: TiposInsumoDialogProps) {
  const { toast } = useToast()
  const [tipos, setTipos] = useState<InsumoTipoRecord[]>([])
  const [loading, setLoading] = useState(false)

  // Form de edição/criação
  const [editando, setEditando] = useState<InsumoTipoRecord | null>(null)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState('#DF5830')
  const [salvando, setSalvando] = useState(false)
  const [modoForm, setModoForm] = useState(false)

  // Exclusão
  const [tipoParaExcluir, setTipoParaExcluir] = useState<InsumoTipoRecord | null>(null)
  const [qtdUsoTipoParaExcluir, setQtdUsoTipoParaExcluir] = useState<number>(0)
  const [verificandoUso, setVerificandoUso] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = async () => {
    try {
      setLoading(true)
      const lista = await insumosService.listTipos()
      setTipos(lista)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar tipos',
        description: 'Não foi possível carregar a lista de tipos de custo / insumo.',
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
    setCor(CORES_SUGERIDAS[tipos.length % CORES_SUGERIDAS.length] || '#DF5830')
    setModoForm(true)
  }

  function iniciarEdicao(t: InsumoTipoRecord) {
    setEditando(t)
    setNome(t.nome)
    setCor(t.cor || '#DF5830')
    setModoForm(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    const nomeNormalizado = nome.trim()
    if (!nomeNormalizado) return

    // Validação preventiva de duplicação de nome
    const existeDuplicado = tipos.some(
      (t) => t.id !== editando?.id && t.nome.trim().toLowerCase() === nomeNormalizado.toLowerCase(),
    )
    if (existeDuplicado) {
      toast({
        variant: 'destructive',
        title: 'Nome já utilizado',
        description: 'Já existe um Tipo de Custo / Insumo cadastrado com este nome.',
      })
      return
    }

    try {
      setSalvando(true)
      if (editando) {
        await insumosService.updateTipo(editando.id, {
          nome: nomeNormalizado,
          cor,
        })
        toast({
          title: 'Tipo atualizado',
          description: `O tipo "${nomeNormalizado}" foi atualizado com sucesso.`,
        })
      } else {
        const criado = await insumosService.createTipo({
          nome: nomeNormalizado,
          cor,
          ordem: (tipos.length + 1) * 10,
          ativo: true,
        })
        toast({
          title: 'Tipo criado',
          description: `O tipo "${nomeNormalizado}" foi cadastrado e já está disponível.`,
        })
        onTipoCreated?.(criado)
      }
      resetForm()
      await carregar()
      onTipoUpdated?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar tipo'
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar',
        description: msg.includes('unique')
          ? 'Já existe um Tipo de Custo / Insumo cadastrado com este nome.'
          : msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  async function solicitarExclusao(t: InsumoTipoRecord) {
    setTipoParaExcluir(t)
    setVerificandoUso(true)
    try {
      const qtd = await insumosService.countProdutosBaseUsandoTipo(t.id, t.codigo)
      setQtdUsoTipoParaExcluir(qtd)
    } catch {
      setQtdUsoTipoParaExcluir(0)
    } finally {
      setVerificandoUso(false)
    }
  }

  async function confirmarExclusao() {
    if (!tipoParaExcluir) return
    try {
      setExcluindo(true)
      await insumosService.deleteTipo(tipoParaExcluir.id)
      toast({
        title: 'Tipo excluído',
        description: `O tipo "${tipoParaExcluir.nome}" foi removido.`,
      })
      setTipoParaExcluir(null)
      await carregar()
      onTipoUpdated?.()
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir este tipo de custo.',
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
              <div className="h-8 w-8 rounded-lg bg-orange-100/70 text-[#DF5830] flex items-center justify-center font-bold">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Tipos de Custo / Insumo</DialogTitle>
                <DialogDescription className="text-xs">
                  Crie, renomeie ou exclua tipos de custo (ex.: Insumo Geral, Embalagem, Etiqueta,
                  Tecido) para classificar seus produtos base.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Botão de Adicionar / Formulário */}
          {modoForm ? (
            <form
              onSubmit={handleSalvar}
              className="p-3.5 rounded-xl border border-orange-200 bg-orange-50/40 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  {editando ? `Editar: ${editando.nome}` : 'Novo Tipo de Custo / Insumo'}
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
                <Label className="text-xs font-semibold">Nome do Tipo *</Label>
                <Input
                  required
                  placeholder="Ex: Insumo Geral, Embalagem, Tecido, Aviamento..."
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
                            ? 'scale-125 ring-2 ring-[#DF5830] ring-offset-1'
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
                  className="h-8 bg-[#DF5830] hover:bg-[#c94d28] text-white text-xs font-bold"
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  {salvando ? 'Salvando...' : editando ? 'Atualizar Tipo' : 'Criar Tipo'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {tipos.length} {tipos.length === 1 ? 'tipo cadastrado' : 'tipos cadastrados'}
              </span>
              <Button
                size="sm"
                className="h-7 text-xs bg-[#DF5830] hover:bg-[#c94d28] text-white font-bold"
                onClick={iniciarCriacao}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Novo Tipo
              </Button>
            </div>
          )}

          {/* Listagem de tipos */}
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {loading && tipos.length === 0 ? (
              <p className="text-xs text-center py-6 text-muted-foreground">
                Carregando tipos de custo...
              </p>
            ) : tipos.length === 0 ? (
              <p className="text-xs text-center py-6 text-muted-foreground">
                Nenhum tipo cadastrado ainda.
              </p>
            ) : (
              tipos.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 hover:bg-muted/40 transition-colors text-xs gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-4 w-4 rounded-full shrink-0 border border-black/10 shadow-xs"
                      style={{ backgroundColor: t.cor || '#DF5830' }}
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-foreground block truncate">{t.nome}</span>
                      {t.codigo && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          ref: {t.codigo}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono"
                      style={{
                        borderColor: t.cor ? `${t.cor}66` : undefined,
                        color: t.cor || undefined,
                      }}
                    >
                      {t.cor || '#DF5830'}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => iniciarEdicao(t)}
                      title="Editar"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => solicitarExclusao(t)}
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
        open={Boolean(tipoParaExcluir)}
        onOpenChange={(op) => !op && setTipoParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive mb-1">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle>Excluir Tipo de Custo / Insumo?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs space-y-2">
              <p>
                Tem certeza de que deseja excluir o tipo &quot;
                <strong className="text-foreground">{tipoParaExcluir?.nome}</strong>&quot;?
              </p>
              {verificandoUso ? (
                <p className="text-muted-foreground italic">Verificando produtos vinculados...</p>
              ) : qtdUsoTipoParaExcluir > 0 ? (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <strong>Atenção:</strong> Existem{' '}
                  <strong>{qtdUsoTipoParaExcluir} produto(s) base</strong> cadastrado(s) utilizando
                  este tipo. Os produtos continuarão existindo e manterão seu histórico, mas o
                  vínculo com este tipo será descontinuado.
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Nenhum produto base está utilizando este tipo atualmente.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              disabled={excluindo || verificandoUso}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {excluindo ? 'Excluindo...' : 'Confirmar Exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
