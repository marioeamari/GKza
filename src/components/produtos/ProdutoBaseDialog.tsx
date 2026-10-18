import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Package, Scissors, Truck, Tag, Plus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type {
  ProdutoBaseRecord,
  ProdutoBaseTipo,
  Fornecedor,
  InsumoCategoriaRecord,
} from '@/types/domain'
import { produtosBaseService } from '@/services/produtos'
import { formatarDimensaoInsumo } from '@/services/insumos'

export interface ProdutoBaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: ProdutoBaseRecord | null
  fornecedores: Fornecedor[]
  categorias?: InsumoCategoriaRecord[]
  fornecedorPreSelecionadoId?: string
  onSuccess: () => void
  onOpenCategorias?: () => void
}

export function ProdutoBaseDialog({
  open,
  onOpenChange,
  record,
  fornecedores,
  categorias = [],
  fornecedorPreSelecionadoId,
  onSuccess,
  onOpenCategorias,
}: ProdutoBaseDialogProps) {
  const { toast } = useToast()
  const [salvando, setSalvando] = useState(false)

  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<ProdutoBaseTipo>('insumo')
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [sku, setSku] = useState('')
  const [ncm, setNcm] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [unidade, setUnidade] = useState('un')
  const [custoUnitario, setCustoUnitario] = useState<number>(0)
  const [dimensaoTipo, setDimensaoTipo] = useState<'nenhuma' | '2d' | '3d'>('nenhuma')
  const [compCm, setCompCm] = useState<number>(0)
  const [largCm, setLargCm] = useState<number>(0)
  const [altCm, setAltCm] = useState<number>(0)
  const [pesoG, setPesoG] = useState<number>(0)
  const [observacoes, setObservacoes] = useState('')

  useEffect(() => {
    if (open) {
      if (record) {
        setNome(record.nome || '')
        setTipo(record.tipo || 'insumo')
        setCategoriaId(record.categoria || '')
        setFornecedorId(record.fornecedor || fornecedorPreSelecionadoId || '')
        setSku(record.sku || '')
        setNcm(record.ncm || '')
        setCodigoBarras(record.codigo_barras || '')
        setUnidade(record.unidade || 'un')
        setCustoUnitario(record.custo_unitario || 0)
        setDimensaoTipo(record.dimensao_tipo || 'nenhuma')
        setCompCm(record.dimensao_comprimento_cm || 0)
        setLargCm(record.dimensao_largura_cm || 0)
        setAltCm(record.dimensao_altura_cm || 0)
        setPesoG(record.peso_g || 0)
        setObservacoes(record.observacoes || '')
      } else {
        setNome('')
        setTipo('insumo')
        setCategoriaId('')
        setFornecedorId(fornecedorPreSelecionadoId || fornecedores[0]?.id || '')
        setSku('')
        setNcm('')
        setCodigoBarras('')
        setUnidade('un')
        setCustoUnitario(0)
        setDimensaoTipo('nenhuma')
        setCompCm(0)
        setLargCm(0)
        setAltCm(0)
        setPesoG(0)
        setObservacoes('')
      }
    }
  }, [open, record, fornecedorPreSelecionadoId, fornecedores])

  const handleSalvar = async () => {
    if (!nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do Produto Base / Insumo.',
        variant: 'destructive',
      })
      return
    }

    if (!fornecedorId) {
      toast({
        title: 'Fornecedor obrigatório',
        description: 'Cada Produto Base / Insumo deve estar vinculado a um fornecedor.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvando(true)
      const payload: Partial<ProdutoBaseRecord> = {
        nome: nome.trim(),
        tipo,
        categoria: categoriaId || undefined,
        fornecedor: fornecedorId,
        sku: sku.trim(),
        ncm: ncm.trim(),
        codigo_barras: codigoBarras.trim(),
        unidade: unidade.trim() || 'un',
        custo_unitario: Number(custoUnitario) || 0,
        dimensao_tipo: dimensaoTipo,
        dimensao_comprimento_cm: dimensaoTipo === '3d' ? Number(compCm) || 0 : 0,
        dimensao_largura_cm: dimensaoTipo !== 'nenhuma' ? Number(largCm) || 0 : 0,
        dimensao_altura_cm: dimensaoTipo !== 'nenhuma' ? Number(altCm) || 0 : 0,
        peso_g: Number(pesoG) || 0,
        observacoes: observacoes.trim(),
        ativo: true,
      }

      if (record?.id) {
        await produtosBaseService.update(record.id, payload)
      } else {
        await produtosBaseService.create(payload)
      }

      toast({
        title: 'Produto Base salvo',
        description: `"${payload.nome}" foi salvo no catálogo unificado de Produtos Base.`,
      })
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Falha ao salvar produto base.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Preview formatado usando o helper padrão
  const previewDimensao = formatarDimensaoInsumo({
    dimensao_tipo: dimensaoTipo,
    dimensao_comprimento_cm: compCm,
    dimensao_largura_cm: largCm,
    dimensao_altura_cm: altCm,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-orange-50 text-[#DF5830]">
              {tipo === 'servico' ? (
                <Scissors className="h-5 w-5" />
              ) : (
                <Package className="h-5 w-5" />
              )}
            </div>
            <div>
              <DialogTitle className="text-lg">
                {record ? 'Editar Produto Base / Insumo' : 'Novo Produto Base / Insumo'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Item elementar de custo (insumo, embalagem, etiqueta, tecido, revenda ou serviço
                terceirizado).
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome / Descrição */}
          <div className="space-y-1">
            <Label htmlFor="baseNome">Nome / Descrição *</Label>
            <Input
              id="baseNome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Etiqueta Couro GKza, Saco Kraft 20x30, Tecido Algodão Egípcio..."
              className="text-xs"
            />
          </div>

          {/* Tipo e Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="baseTipo">Tipo de Custo / Insumo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as ProdutoBaseTipo)}>
                <SelectTrigger id="baseTipo" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="insumo">Insumo Geral</SelectItem>
                  <SelectItem value="embalagem">Embalagem</SelectItem>
                  <SelectItem value="etiqueta">Etiqueta</SelectItem>
                  <SelectItem value="tecido">Tecido / Malha</SelectItem>
                  <SelectItem value="servico">Serviço Terceirizado</SelectItem>
                  <SelectItem value="costura">Costura</SelectItem>
                  <SelectItem value="pintura">Pintura</SelectItem>
                  <SelectItem value="revenda">Produto de Revenda</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="baseCategoria" className="text-xs flex items-center gap-1">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  Categoria de Insumo
                </Label>
                {onOpenCategorias && (
                  <button
                    type="button"
                    onClick={onOpenCategorias}
                    className="text-[11px] text-[#DF5830] hover:underline font-semibold flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" /> Gerenciar
                  </button>
                )}
              </div>
              <Select
                value={categoriaId || '__none__'}
                onValueChange={(v) => setCategoriaId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger id="baseCategoria" className="text-xs">
                  <SelectValue placeholder="Selecione a categoria..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem categoria definida</SelectItem>
                  {categorias.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fornecedor */}
          <div className="space-y-1">
            <Label htmlFor="baseFornecedor" className="text-xs flex items-center gap-1">
              <Truck className="h-3 w-3 text-muted-foreground" />
              Fornecedor / Terceirizado de Origem *
            </Label>
            <Select value={fornecedorId} onValueChange={setFornecedorId}>
              <SelectTrigger id="baseFornecedor" className="text-xs">
                <SelectValue placeholder="Selecione o fornecedor..." />
              </SelectTrigger>
              <SelectContent>
                {fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome_fantasia || f.razao_social}
                    {f.cidade ? ` (${f.cidade}/${f.uf || ''})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custo Unitário, Unidade e SKU */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="baseCusto" className="text-xs">
                Custo Unitário (R$)
              </Label>
              <Input
                id="baseCusto"
                type="number"
                step="0.01"
                min="0"
                value={custoUnitario}
                onChange={(e) => setCustoUnitario(Number(e.target.value))}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="baseUnidade" className="text-xs">
                Unidade
              </Label>
              <Input
                id="baseUnidade"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="un, m, kg, pct"
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="baseSku" className="text-xs">
                SKU / Cód. Ref.
              </Label>
              <Input
                id="baseSku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex: ETIQ-101"
                className="text-xs uppercase"
              />
            </div>
          </div>

          {/* Dimensões & Formato (2D / 3D) */}
          <div className="p-3 bg-neutral-50 rounded-lg border space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">Dimensões & Formato</Label>
                <p className="text-[11px] text-muted-foreground">
                  Para embalagens, etiquetas e cortes de tecidos.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-orange-50 text-[#DF5830] border border-orange-200 shrink-0">
                {previewDimensao}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label
                className={`flex items-center justify-center p-2 rounded-lg border text-xs cursor-pointer transition ${
                  dimensaoTipo === 'nenhuma'
                    ? 'border-[#DF5830] bg-orange-50/50 font-bold text-[#DF5830]'
                    : 'border-border bg-white text-muted-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="dimensao_tipo"
                  value="nenhuma"
                  checked={dimensaoTipo === 'nenhuma'}
                  onChange={() => setDimensaoTipo('nenhuma')}
                  className="sr-only"
                />
                <span>Sem dimensão</span>
              </label>

              <label
                className={`flex items-center justify-center p-2 rounded-lg border text-xs cursor-pointer transition ${
                  dimensaoTipo === '2d'
                    ? 'border-[#DF5830] bg-orange-50/50 font-bold text-[#DF5830]'
                    : 'border-border bg-white text-muted-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="dimensao_tipo"
                  value="2d"
                  checked={dimensaoTipo === '2d'}
                  onChange={() => setDimensaoTipo('2d')}
                  className="sr-only"
                />
                <span>2D (L × A cm)</span>
              </label>

              <label
                className={`flex items-center justify-center p-2 rounded-lg border text-xs cursor-pointer transition ${
                  dimensaoTipo === '3d'
                    ? 'border-[#DF5830] bg-orange-50/50 font-bold text-[#DF5830]'
                    : 'border-border bg-white text-muted-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="dimensao_tipo"
                  value="3d"
                  checked={dimensaoTipo === '3d'}
                  onChange={() => setDimensaoTipo('3d')}
                  className="sr-only"
                />
                <span>3D (C × L × A cm)</span>
              </label>
            </div>

            {dimensaoTipo !== 'nenhuma' && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {dimensaoTipo === '3d' && (
                  <div>
                    <span className="text-[10px] text-muted-foreground">Comprimento (cm)</span>
                    <Input
                      type="number"
                      value={compCm}
                      onChange={(e) => setCompCm(Number(e.target.value))}
                      className="text-xs h-8 bg-white font-mono"
                    />
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-muted-foreground">Largura (cm)</span>
                  <Input
                    type="number"
                    value={largCm}
                    onChange={(e) => setLargCm(Number(e.target.value))}
                    className="text-xs h-8 bg-white font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Altura (cm)</span>
                  <Input
                    type="number"
                    value={altCm}
                    onChange={(e) => setAltCm(Number(e.target.value))}
                    className="text-xs h-8 bg-white font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Peso e Observações */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label htmlFor="basePeso" className="text-xs">
                Peso (g)
              </Label>
              <Input
                id="basePeso"
                type="number"
                value={pesoG}
                onChange={(e) => setPesoG(Number(e.target.value))}
                placeholder="0"
                className="text-xs"
              />
            </div>
            <div className="sm:col-span-3 space-y-1">
              <Label htmlFor="baseObs" className="text-xs">
                Observações
              </Label>
              <Textarea
                id="baseObs"
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Notas de fornecimento, especificações técnicas..."
                className="text-xs resize-none"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="bg-[#DF5830] hover:bg-[#c94d28] text-white"
          >
            {salvando ? 'Salvando...' : 'Salvar Produto Base'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
