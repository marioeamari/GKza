import { useEffect, useState, useRef } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  GripVertical,
  Layers,
  Sparkles,
  Check,
  X,
  Upload,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react'
import { ExpedicaoHeader } from '@/components/expedicao/ExpedicaoHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { toast } from '@/hooks/use-toast'
import { separacaoKitsService } from '@/services/separacaoKits'
import type { KitTema, KitModelo } from '@/types/separacaoKits'
import pb from '@/lib/pocketbase/client'
import { cn } from '@/lib/utils'

export default function TemasModelosPage() {
  const [temas, setTemas] = useState<KitTema[]>([])
  const [modelos, setModelos] = useState<KitModelo[]>([])
  const [temaSelecionado, setTemaSelecionado] = useState<KitTema | null>(null)
  const [loading, setLoading] = useState(true)

  // Dialog Tema
  const [temaDialogOpen, setTemaDialogOpen] = useState(false)
  const [temaEditando, setTemaEditando] = useState<KitTema | null>(null)
  const [temaNome, setTemaNome] = useState('')
  const [temaDescricao, setTemaDescricao] = useState('')
  const [temaAtivo, setTemaAtivo] = useState(true)
  const [salvandoTema, setSalvandoTema] = useState(false)

  // Dialog Modelo
  const [modeloDialogOpen, setModeloDialogOpen] = useState(false)
  const [modeloEditando, setModeloEditando] = useState<KitModelo | null>(null)
  const [modeloCodigo, setModeloCodigo] = useState('')
  const [modeloNome, setModeloNome] = useState('')
  const [modeloAtivo, setModeloAtivo] = useState(true)
  const [modeloFoto, setModeloFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [salvandoModelo, setSalvandoModelo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Confirmação de exclusão
  const [itemParaExcluir, setItemParaExcluir] = useState<{
    tipo: 'tema' | 'modelo'
    id: string
    nome: string
  } | null>(null)

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const carregarDados = async () => {
    try {
      setLoading(true)
      const [temasData, modelosData] = await Promise.all([
        separacaoKitsService.getTemas(),
        separacaoKitsService.getModelos(),
      ])
      setTemas(temasData)
      setModelos(modelosData)

      // Seleciona o primeiro tema ou mantém o atual se existir
      if (temasData.length > 0) {
        setTemaSelecionado((prev) => {
          if (prev) {
            const achou = temasData.find((t) => t.id === prev.id)
            return achou || temasData[0]
          }
          return temasData[0]
        })
      }
    } catch (err) {
      console.error('Erro ao carregar temas e modelos:', err)
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados cadastrados.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Modelos do tema selecionado ordenados por ordem
  const modelosDoTema = modelos
    .filter((m) => m.tema === temaSelecionado?.id)
    .sort((a, b) => {
      const ordA = a.ordem !== undefined ? a.ordem : 999
      const ordB = b.ordem !== undefined ? b.ordem : 999
      return ordA - ordB
    })

  // Handlers Tema
  const abrirCriarTema = () => {
    setTemaEditando(null)
    setTemaNome('')
    setTemaDescricao('')
    setTemaAtivo(true)
    setTemaDialogOpen(true)
  }

  const abrirEditarTema = (t: KitTema) => {
    setTemaEditando(t)
    setTemaNome(t.nome)
    setTemaDescricao(t.descricao || '')
    setTemaAtivo(t.ativo)
    setTemaDialogOpen(true)
  }

  const salvarTema = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!temaNome.trim()) return

    setSalvandoTema(true)
    try {
      if (temaEditando) {
        await separacaoKitsService.updateTema(temaEditando.id, {
          nome: temaNome.trim(),
          descricao: temaDescricao.trim(),
          ativo: temaAtivo,
        })
        toast({ title: 'Tema atualizado com sucesso!' })
      } else {
        const novo = await separacaoKitsService.createTema({
          nome: temaNome.trim(),
          descricao: temaDescricao.trim(),
          ativo: temaAtivo,
          ordem: temas.length + 1,
        })
        toast({ title: 'Novo tema cadastrado!' })
        setTemaSelecionado(novo)
      }
      setTemaDialogOpen(false)
      carregarDados()
    } catch (err) {
      console.error('Erro ao salvar tema:', err)
      toast({
        title: 'Erro ao salvar tema',
        description: 'Verifique se já não existe um tema com esse nome.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoTema(false)
    }
  }

  // Handlers Modelo
  const abrirCriarModelo = () => {
    if (!temaSelecionado) {
      toast({ title: 'Selecione um tema primeiro', variant: 'destructive' })
      return
    }
    setModeloEditando(null)
    // Sugestão de código automático baseado na quantidade atual
    const proximoNumero = modelosDoTema.length + 1
    const prefixo = temaSelecionado.nome.charAt(0).toUpperCase()
    setModeloCodigo(`${prefixo}${proximoNumero < 10 ? '0' + proximoNumero : proximoNumero}`)
    setModeloNome('')
    setModeloAtivo(true)
    setModeloFoto(null)
    setFotoPreview(null)
    setModeloDialogOpen(true)
  }

  const abrirEditarModelo = (m: KitModelo) => {
    setModeloEditando(m)
    setModeloCodigo(m.codigo)
    setModeloNome(m.nome)
    setModeloAtivo(m.ativo)
    setModeloFoto(null)
    if (m.foto) {
      const url = pb.files.getURL(m, m.foto)
      setFotoPreview(url)
    } else {
      setFotoPreview(null)
    }
    setModeloDialogOpen(true)
  }

  const salvarModelo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!temaSelecionado || !modeloCodigo.trim() || !modeloNome.trim()) return

    setSalvandoModelo(true)
    try {
      const formData = new FormData()
      formData.append('tema', temaSelecionado.id)
      formData.append('codigo', modeloCodigo.trim().toUpperCase())
      formData.append('nome', modeloNome.trim())
      formData.append('ativo', String(modeloAtivo))

      if (modeloFoto) {
        formData.append('foto', modeloFoto)
      }

      if (modeloEditando) {
        await separacaoKitsService.updateModelo(modeloEditando.id, formData)
        toast({ title: 'Modelo atualizado com sucesso!' })
      } else {
        formData.append('ordem', String(modelosDoTema.length + 1))
        await separacaoKitsService.createModelo(formData)
        toast({ title: 'Modelo cadastrado com sucesso!' })
      }
      setModeloDialogOpen(false)
      carregarDados()
    } catch (err) {
      console.error('Erro ao salvar modelo:', err)
      toast({
        title: 'Erro ao salvar modelo',
        description: 'Certifique-se de que o código não está duplicado para este tema.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoModelo(false)
    }
  }

  // Drag and Drop para reordenar modelos
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) return

    const novosModelos = [...modelosDoTema]
    const [removido] = novosModelos.splice(draggedIndex, 1)
    novosModelos.splice(dropIndex, 0, removido)

    // Atualiza visual local imediatamente
    const atualizacoes = novosModelos.map((mod, i) => ({
      id: mod.id,
      ordem: i + 1,
    }))

    setModelos((prev) =>
      prev.map((m) => {
        const att = atualizacoes.find((a) => a.id === m.id)
        if (att) return { ...m, ordem: att.ordem }
        return m
      }),
    )

    setDraggedIndex(null)

    try {
      await separacaoKitsService.reordenarModelos(atualizacoes)
      toast({
        title: 'Ordem de distribuição atualizada',
        description: 'A nova prioridade de excedentes foi salva.',
      })
    } catch (err) {
      console.error('Erro ao reordenar:', err)
      toast({ title: 'Erro ao salvar ordem', variant: 'destructive' })
      carregarDados()
    }
  }

  // Exclusão
  const confirmarExclusao = async () => {
    if (!itemParaExcluir) return
    try {
      if (itemParaExcluir.tipo === 'tema') {
        await separacaoKitsService.deleteTema(itemParaExcluir.id)
        toast({ title: 'Tema excluído com sucesso' })
      } else {
        await separacaoKitsService.deleteModelo(itemParaExcluir.id)
        toast({ title: 'Modelo excluído com sucesso' })
      }
      setItemParaExcluir(null)
      carregarDados()
    } catch (err) {
      console.error('Erro ao excluir:', err)
      toast({ title: 'Erro ao excluir item', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <ExpedicaoHeader
        title="Temas e Modelos"
        description="Cadastre os temas (ex: Turma da Mônica, Mickey) e seus personagens/modelos. A ordem define quem recebe unidades excedentes."
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* COLUNA ESQUERDA: LISTA DE TEMAS */}
        <div className="space-y-4 lg:col-span-4">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold">Temas Cadastrados</CardTitle>
                <CardDescription className="text-xs">
                  {temas.length} tema(s) no sistema
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={abrirCriarTema}
                className="h-8 gap-1 bg-primary text-xs font-bold text-white hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" /> Novo Tema
              </Button>
            </CardHeader>
            <CardContent className="space-y-1.5 p-3">
              {temas.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Nenhum tema cadastrado ainda.
                </div>
              ) : (
                temas.map((t) => {
                  const isSelected = temaSelecionado?.id === t.id
                  const qtdModelos = modelos.filter((m) => m.tema === t.id).length
                  const qtdAtivos = modelos.filter((m) => m.tema === t.id && m.ativo).length

                  return (
                    <div
                      key={t.id}
                      onClick={() => setTemaSelecionado(t)}
                      className={cn(
                        'group flex cursor-pointer items-center justify-between rounded-xl p-3 transition border',
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                          : 'border-transparent bg-muted/40 hover:bg-muted/70 text-foreground',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold">{t.nome}</span>
                          {!t.ativo && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Inativo
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs font-normal text-muted-foreground truncate">
                          {qtdModelos} modelos ({qtdAtivos} ativos)
                        </p>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            abrirEditarTema(t)
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/80 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            setItemParaExcluir({ tipo: 'tema', id: t.id, nome: t.nome })
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* COLUNA DIREITA: MODELOS DO TEMA COM REORDENAÇÃO DRAG AND DROP */}
        <div className="space-y-4 lg:col-span-8">
          {temaSelecionado ? (
            <Card className="border-border/80 shadow-sm">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-black">
                      Modelos de {temaSelecionado.nome}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs font-bold">
                      {modelosDoTema.length} modelos
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Arraste os cards para reorganizar a ordem de distribuição automática (o primeiro
                    recebe a sobra primeiro).
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  onClick={abrirCriarModelo}
                  className="h-10 gap-1.5 bg-primary font-bold text-white hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Adicionar Modelo
                </Button>
              </CardHeader>

              <CardContent className="p-4 sm:p-6">
                {modelosDoTema.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Nenhum modelo cadastrado para o tema <strong>{temaSelecionado.nome}</strong>.
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        onClick={abrirCriarModelo}
                        className="bg-primary font-bold text-white"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Cadastrar Primeiro Modelo
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {modelosDoTema.map((mod, index) => {
                      const fotoUrl = mod.foto ? pb.files.getURL(mod, mod.foto) : null

                      return (
                        <div
                          key={mod.id}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDrop={(e) => handleDrop(e, index)}
                          className={cn(
                            'group flex items-center justify-between gap-3 rounded-xl border p-3 transition-all select-none',
                            mod.ativo
                              ? 'border-border/80 bg-card hover:border-primary/40'
                              : 'border-border/40 bg-muted/40 opacity-70',
                            draggedIndex === index && 'opacity-40 border-dashed border-primary',
                          )}
                        >
                          {/* Handle Drag e Ordem */}
                          <div className="flex items-center gap-2">
                            <span
                              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                              title="Arraste para reordenar"
                            >
                              <GripVertical className="h-5 w-5" />
                            </span>
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-xs font-black text-foreground">
                              {index + 1}º
                            </div>
                          </div>

                          {/* Foto Miniatura */}
                          <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-50 p-0.5 dark:border-stone-800 dark:bg-stone-900">
                            {fotoUrl ? (
                              <img
                                src={fotoUrl}
                                alt={mod.nome}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>

                          {/* Info do Modelo */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="border-primary/30 bg-primary/5 text-xs font-bold text-primary"
                              >
                                {mod.codigo}
                              </Badge>
                              <span className="truncate text-sm font-bold text-foreground">
                                {mod.nome}
                              </span>
                              {!mod.ativo && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Inativo
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Ordem de distribuição: prioridade #{index + 1}
                            </p>
                          </div>

                          {/* Ações */}
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => abrirEditarModelo(mod)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive/80 hover:text-destructive"
                              onClick={() =>
                                setItemParaExcluir({
                                  tipo: 'modelo',
                                  id: mod.id,
                                  nome: `${mod.codigo} - ${mod.nome}`,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Selecione ou crie um tema para gerenciar seus modelos.
            </div>
          )}
        </div>
      </div>

      {/* DIALOG DE TEMA (CRIAR / EDITAR) */}
      <Dialog open={temaDialogOpen} onOpenChange={setTemaDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bold">
              {temaEditando ? 'Editar Tema' : 'Novo Tema de Produtos'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={salvarTema} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="temaNome">Nome do Tema *</Label>
              <Input
                id="temaNome"
                value={temaNome}
                onChange={(e) => setTemaNome(e.target.value)}
                placeholder="Ex: Turma da Mônica, Mickey, Sonic..."
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="temaDesc">Descrição / Observações</Label>
              <Input
                id="temaDesc"
                value={temaDescricao}
                onChange={(e) => setTemaDescricao(e.target.value)}
                placeholder="Ex: Kits toalha rosto 100% algodão"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="temaAtivo" className="text-sm font-semibold cursor-pointer">
                Tema Ativo no Sistema
              </Label>
              <Switch id="temaAtivo" checked={temaAtivo} onCheckedChange={setTemaAtivo} />
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTemaDialogOpen(false)}
                disabled={salvandoTema}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvandoTema || !temaNome.trim()}
                className="bg-primary font-bold text-white hover:bg-primary/90"
              >
                {salvandoTema ? 'Salvando...' : 'Salvar Tema'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE MODELO (CRIAR / EDITAR COM UPLOAD DE FOTO) */}
      <Dialog open={modeloDialogOpen} onOpenChange={setModeloDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bold">
              {modeloEditando ? 'Editar Modelo' : `Novo Modelo em ${temaSelecionado?.nome}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={salvarModelo} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1 space-y-1.5">
                <Label htmlFor="modCod">Código *</Label>
                <Input
                  id="modCod"
                  value={modeloCodigo}
                  onChange={(e) => setModeloCodigo(e.target.value)}
                  placeholder="Ex: M01"
                  required
                  className="font-bold uppercase"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="modNome">Nome do Modelo / Personagem *</Label>
                <Input
                  id="modNome"
                  value={modeloNome}
                  onChange={(e) => setModeloNome(e.target.value)}
                  placeholder="Ex: Mônica, Cebolinha, Mickey..."
                  required
                />
              </div>
            </div>

            {/* Upload de Foto do Modelo */}
            <div className="space-y-1.5">
              <Label>Foto do Modelo / Personagem</Label>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50 p-1 dark:border-stone-800 dark:bg-stone-900">
                  {fotoPreview ? (
                    <img src={fotoPreview} alt="Preview" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setModeloFoto(file)
                        setFotoPreview(URL.createObjectURL(file))
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs font-semibold"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {fotoPreview ? 'Trocar Imagem' : 'Selecionar Imagem'}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Formatos JPG, PNG ou WebP (máx. 15MB)
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="modAtivo" className="text-sm font-semibold cursor-pointer">
                  Modelo Ativo
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Modelos inativos são excluídos de novas distribuições automáticas.
                </p>
              </div>
              <Switch id="modAtivo" checked={modeloAtivo} onCheckedChange={setModeloAtivo} />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModeloDialogOpen(false)}
                disabled={salvandoModelo}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvandoModelo || !modeloCodigo.trim() || !modeloNome.trim()}
                className="bg-primary font-bold text-white hover:bg-primary/90"
              >
                {salvandoModelo ? 'Salvando...' : 'Salvar Modelo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAÇÃO DE EXCLUSÃO */}
      <AlertDialog
        open={Boolean(itemParaExcluir)}
        onOpenChange={(op) => !op && setItemParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold text-destructive">
              Confirmar Exclusão de {itemParaExcluir?.tipo === 'tema' ? 'Tema' : 'Modelo'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir <strong>{itemParaExcluir?.nome}</strong>?
              {itemParaExcluir?.tipo === 'tema' &&
                ' Todos os modelos e regras vinculados a este tema também serão removidos.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
