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
import { Plus, Edit2, Trash2, Palette, Check } from 'lucide-react'
import { PrecMatrizLegendaRecord } from '@/types/precificacao'
import { precificacaoService } from '@/services/precificacao'
import { useToast } from '@/hooks/use-toast'

interface LegendasMatrizDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLegendaUpdated?: () => void
}

const CORES_SUGERIDAS_LEGENDA = [
  { cor: '#10B981', nome: 'Verde (Ativo)' },
  { cor: '#EF4444', nome: 'Vermelho (Rejeitado)' },
  { cor: '#F59E0B', nome: 'Amarelo (Análise)' },
  { cor: '#3B82F6', nome: 'Azul' },
  { cor: '#8B5CF6', nome: 'Roxo' },
  { cor: '#EC4899', nome: 'Rosa' },
  { cor: '#6B7280', nome: 'Cinza' },
  { cor: '#14B8A6', nome: 'Teal' },
  { cor: '#F97316', nome: 'Laranja' },
]

export function LegendasMatrizDialog({
  open,
  onOpenChange,
  onLegendaUpdated,
}: LegendasMatrizDialogProps) {
  const { toast } = useToast()
  const [legendas, setLegendas] = useState<PrecMatrizLegendaRecord[]>([])
  const [loading, setLoading] = useState(false)

  // Form de edição/criação
  const [editando, setEditando] = useState<PrecMatrizLegendaRecord | null>(null)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState('#10B981')
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [modoForm, setModoForm] = useState(false)

  // Exclusão
  const [legendaParaExcluir, setLegendaParaExcluir] = useState<PrecMatrizLegendaRecord | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = async () => {
    try {
      setLoading(true)
      const lista = await precificacaoService.listMatrizLegendas()
      setLegendas(lista)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar legendas',
        description: 'Não foi possível carregar a lista de classificações da legenda.',
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
    setCor('#10B981')
    setDescricao('')
    setModoForm(false)
  }

  function iniciarCriacao() {
    setEditando(null)
    setNome('')
    setCor('#3B82F6')
    setDescricao('')
    setModoForm(true)
  }

  function iniciarEdicao(l: PrecMatrizLegendaRecord) {
    setEditando(l)
    setNome(l.nome)
    setCor(l.cor || '#10B981')
    setDescricao(l.descricao || '')
    setModoForm(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return

    try {
      setSalvando(true)
      if (editando) {
        await precificacaoService.updateMatrizLegenda(editando.id, {
          nome: nome.trim(),
          cor,
          cor_texto: '#FFFFFF',
          descricao: descricao.trim() || undefined,
        })
        toast({
          title: 'Classificação atualizada',
          description: `Item "${nome.trim()}" atualizado com sucesso.`,
        })
      } else {
        await precificacaoService.createMatrizLegenda({
          nome: nome.trim(),
          cor,
          cor_texto: '#FFFFFF',
          descricao: descricao.trim() || undefined,
          ordem: (legendas.length + 1) * 10,
          ativo: true,
        })
        toast({
          title: 'Classificação criada',
          description: `Novo item de legenda "${nome.trim()}" cadastrado.`,
        })
      }
      resetForm()
      await carregar()
      onLegendaUpdated?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar legenda'
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar',
        description: msg.includes('unique')
          ? 'Já existe uma classificação cadastrada com este nome.'
          : msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    if (!legendaParaExcluir) return
    try {
      setExcluindo(true)
      await precificacaoService.deleteMatrizLegenda(legendaParaExcluir.id)
      toast({
        title: 'Classificação excluída',
        description: `Classificação "${legendaParaExcluir.nome}" foi removida.`,
      })
      setLegendaParaExcluir(null)
      await carregar()
      onLegendaUpdated?.()
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir esta classificação de legenda.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Palette className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  Gerenciar Legenda da Matriz de Canais
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Defina os itens de classificação (nome e cor). Cada célula da matriz é pintada com
                  a cor escolhida.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Form de criação/edição */}
          {modoForm ? (
            <form
              onSubmit={handleSalvar}
              className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  {editando ? `Editar: ${editando.nome}` : 'Nova Classificação de Legenda'}
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
                <Label className="text-xs font-semibold">Nome da Classificação *</Label>
                <Input
                  required
                  placeholder="Ex: Ativo, Rejeitado, Em análise, Descontinuado..."
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                  Cor de Destaque da Célula
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
                    placeholder="#10B981"
                    className="h-8 text-xs font-mono w-28 uppercase bg-white"
                  />
                  <div className="flex items-center gap-1 flex-wrap">
                    {CORES_SUGERIDAS_LEGENDA.map((item) => (
                      <button
                        key={item.cor}
                        type="button"
                        onClick={() => setCor(item.cor)}
                        style={{ backgroundColor: item.cor }}
                        className={`h-5 w-5 rounded-full border border-black/10 transition-transform ${
                          cor.toLowerCase() === item.cor.toLowerCase()
                            ? 'scale-125 ring-2 ring-primary ring-offset-1'
                            : ''
                        }`}
                        title={item.nome}
                      />
                    ))}
                  </div>
                </div>

                {/* Prévia da Célula */}
                <div className="mt-2 p-2 rounded-lg bg-background border border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground text-[11px]">Prévia na célula:</span>
                  <div
                    className="px-3 py-1 rounded font-bold font-mono text-xs shadow-xs text-white"
                    style={{ backgroundColor: cor }}
                  >
                    R$ 49,90
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Descrição / Significado (opcional)</Label>
                <Input
                  placeholder="Ex: Anúncio publicado e com vendas ativas no canal"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={salvando || !nome.trim()}
                  size="sm"
                  className="h-8 bg-primary text-white text-xs font-bold"
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  {salvando ? 'Salvando...' : editando ? 'Atualizar Item' : 'Criar Item'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {legendas.length}{' '}
                {legendas.length === 1 ? 'item configurado' : 'itens configurados'}
              </span>
              <Button
                size="sm"
                className="h-7 text-xs bg-primary text-white font-bold"
                onClick={iniciarCriacao}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Nova Classificação
              </Button>
            </div>
          )}

          {/* Listagem */}
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
            {loading && legendas.length === 0 ? (
              <p className="text-xs text-center py-6 text-muted-foreground">
                Carregando legenda...
              </p>
            ) : legendas.length === 0 ? (
              <p className="text-xs text-center py-6 text-muted-foreground">
                Nenhum item de legenda cadastrado.
              </p>
            ) : (
              legendas.map((leg) => (
                <div
                  key={leg.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 hover:bg-muted/40 transition-colors text-xs gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="px-2.5 py-0.5 rounded text-[11px] font-bold text-white shadow-xs shrink-0"
                      style={{ backgroundColor: leg.cor }}
                    >
                      {leg.nome}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[11px] text-muted-foreground block truncate">
                        {leg.descricao || 'Sem descrição'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {leg.cor}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => iniciarEdicao(leg)}
                      title="Editar"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => setLegendaParaExcluir(leg)}
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
        open={Boolean(legendaParaExcluir)}
        onOpenChange={(op) => !op && setLegendaParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir classificação da legenda?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Tem certeza de que deseja excluir a classificação &quot;{legendaParaExcluir?.nome}
              &quot;? Células da matriz vinculadas a este item perderão a cor da legenda e ficarão
              desclassificadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              disabled={excluindo}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {excluindo ? 'Excluindo...' : 'Sim, excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
