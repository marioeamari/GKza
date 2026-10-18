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
import { Package, Truck } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { ProdutoBaseRecord, ProdutoBaseTipo, Fornecedor } from '@/types/domain'
import { produtosBaseService } from '@/services/produtos'

interface ProdutoBaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: ProdutoBaseRecord | null
  fornecedores: Fornecedor[]
  fornecedorPreSelecionadoId?: string
  onSuccess: () => void
}

export function ProdutoBaseDialog({
  open,
  onOpenChange,
  record,
  fornecedores,
  fornecedorPreSelecionadoId,
  onSuccess,
}: ProdutoBaseDialogProps) {
  const { toast } = useToast()
  const [salvando, setSalvando] = useState(false)

  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<ProdutoBaseTipo>('insumo')
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
        description: 'Informe o nome do Produto Base.',
        variant: 'destructive',
      })
      return
    }

    if (!fornecedorId) {
      toast({
        title: 'Fornecedor obrigatório',
        description: 'Cada Produto Base deve estar vinculado a um fornecedor.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvando(true)
      const payload: Partial<ProdutoBaseRecord> = {
        nome: nome.trim(),
        tipo,
        fornecedor: fornecedorId,
        sku: sku.trim(),
        ncm: ncm.trim(),
        codigo_barras: codigoBarras.trim(),
        unidade,
        custo_unitario: custoUnitario,
        dimensao_tipo: dimensaoTipo,
        dimensao_comprimento_cm: compCm,
        dimensao_largura_cm: largCm,
        dimensao_altura_cm: altCm,
        peso_g: pesoG,
        observacoes,
        ativo: true,
      }

      if (record?.id) {
        await produtosBaseService.update(record.id, payload)
      } else {
        await produtosBaseService.create(payload)
      }

      toast({
        title: 'Produto Base salvo',
        description: 'Item de custo salvo no catálogo unificado.',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-orange-50 text-[#DF5830]">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                {record ? 'Editar Produto Base' : 'Novo Produto Base'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Item elementar que compõe custo (revenda, insumo, embalagem, serviço terceirizado).
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="baseNome">Nome / Descrição *</Label>
            <Input
              id="baseNome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Toalha de Banho Branca ou Saco Plástico 20x30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="baseTipo">Tipo de Custo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as ProdutoBaseTipo)}>
                <SelectTrigger id="baseTipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenda">Produto de Revenda</SelectItem>
                  <SelectItem value="insumo">Insumo Geral</SelectItem>
                  <SelectItem value="embalagem">Embalagem</SelectItem>
                  <SelectItem value="etiqueta">Etiqueta</SelectItem>
                  <SelectItem value="tecido">Tecido</SelectItem>
                  <SelectItem value="pintura">Pintura</SelectItem>
                  <SelectItem value="costura">Costura</SelectItem>
                  <SelectItem value="servico">Serviço Terceirizado</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="baseFornecedor">Fornecedor *</Label>
              <Select value={fornecedorId} onValueChange={setFornecedorId}>
                <SelectTrigger id="baseFornecedor">
                  <SelectValue placeholder="Selecione o fornecedor..." />
                </SelectTrigger>
                <SelectContent>
                  {fornecedores.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome_fantasia || f.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="baseCusto">Custo Unitário (R$)</Label>
              <Input
                id="baseCusto"
                type="number"
                step="0.01"
                min="0"
                value={custoUnitario}
                onChange={(e) => setCustoUnitario(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="baseUnidade">Unidade</Label>
              <Input
                id="baseUnidade"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="un, m, kg, pct"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="baseSku">SKU / Cód. Fornecedor</Label>
              <Input
                id="baseSku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex: FORN-101"
              />
            </div>
          </div>

          {/* Dimensões */}
          <div className="p-3 bg-neutral-50 rounded-lg border space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Dimensões & Formato</Label>
              <Select value={dimensaoTipo} onValueChange={(v: any) => setDimensaoTipo(v)}>
                <SelectTrigger className="w-32 h-7 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Nenhuma</SelectItem>
                  <SelectItem value="2d">2D (L × A)</SelectItem>
                  <SelectItem value="3d">3D (C × L × A)</SelectItem>
                </SelectContent>
              </Select>
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
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-muted-foreground">Largura (cm)</span>
                  <Input
                    type="number"
                    value={largCm}
                    onChange={(e) => setLargCm(Number(e.target.value))}
                    className="text-xs h-8 bg-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Altura (cm)</span>
                  <Input
                    type="number"
                    value={altCm}
                    onChange={(e) => setAltCm(Number(e.target.value))}
                    className="text-xs h-8 bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="baseObs">Observações</Label>
            <Textarea
              id="baseObs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas de fornecimento, tabela de descontos ou especificações..."
              className="text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
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
