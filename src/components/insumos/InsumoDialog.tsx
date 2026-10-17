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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { LoaderCircle, Package, Scissors, Truck, Save, Plus } from 'lucide-react'
import type {
  InsumoRecord,
  InsumoCategoriaRecord,
  InsumoTipo,
  InsumoDimensaoTipo,
  Fornecedor,
} from '@/types/domain'
import { insumosService, formatarDimensaoInsumo } from '@/services/insumos'
import { useToast } from '@/hooks/use-toast'

interface InsumoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: InsumoRecord | null
  categorias: InsumoCategoriaRecord[]
  fornecedores: Fornecedor[]
  onSaved?: () => void
  onOpenCategorias?: () => void
}

interface FormState {
  nome: string
  categoria: string
  tipo: InsumoTipo
  dimensao_tipo: InsumoDimensaoTipo
  dimensao_largura_cm: string
  dimensao_altura_cm: string
  dimensao_comprimento_cm: string
  unidade: string
  valor_unitario: string
  fornecedor: string
  observacoes: string
  ativo: boolean
}

const INITIAL_FORM: FormState = {
  nome: '',
  categoria: '',
  tipo: 'insumo',
  dimensao_tipo: 'nenhuma',
  dimensao_largura_cm: '',
  dimensao_altura_cm: '',
  dimensao_comprimento_cm: '',
  unidade: 'un',
  valor_unitario: '',
  fornecedor: '',
  observacoes: '',
  ativo: true,
}

export function InsumoDialog({
  open,
  onOpenChange,
  record,
  categorias,
  fornecedores,
  onSaved,
  onOpenCategorias,
}: InsumoDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (record) {
        setForm({
          nome: record.nome || '',
          categoria: record.categoria || '',
          tipo: record.tipo || 'insumo',
          dimensao_tipo: record.dimensao_tipo || 'nenhuma',
          dimensao_largura_cm:
            record.dimensao_largura_cm !== undefined && record.dimensao_largura_cm !== null
              ? String(record.dimensao_largura_cm)
              : '',
          dimensao_altura_cm:
            record.dimensao_altura_cm !== undefined && record.dimensao_altura_cm !== null
              ? String(record.dimensao_altura_cm)
              : '',
          dimensao_comprimento_cm:
            record.dimensao_comprimento_cm !== undefined && record.dimensao_comprimento_cm !== null
              ? String(record.dimensao_comprimento_cm)
              : '',
          unidade: record.unidade || 'un',
          valor_unitario:
            record.valor_unitario !== undefined && record.valor_unitario !== null
              ? String(record.valor_unitario)
              : '',
          fornecedor: record.fornecedor || '',
          observacoes: record.observacoes || '',
          ativo: record.ativo ?? true,
        })
      } else {
        setForm(INITIAL_FORM)
      }
    }
  }, [open, record])

  const parseNumber = (val: string) => {
    if (!val.trim()) return undefined
    const parsed = parseFloat(val.replace(',', '.'))
    return isNaN(parsed) ? undefined : parsed
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Informe o nome do insumo ou serviço terceirizado.',
      })
      return
    }

    try {
      setSaving(true)
      const payload = {
        nome: form.nome.trim(),
        categoria: form.categoria || undefined,
        tipo: form.tipo,
        dimensao_tipo: form.dimensao_tipo,
        dimensao_largura_cm:
          form.dimensao_tipo === '2d' || form.dimensao_tipo === '3d'
            ? parseNumber(form.dimensao_largura_cm)
            : undefined,
        dimensao_altura_cm:
          form.dimensao_tipo === '2d' || form.dimensao_tipo === '3d'
            ? parseNumber(form.dimensao_altura_cm)
            : undefined,
        dimensao_comprimento_cm:
          form.dimensao_tipo === '3d' ? parseNumber(form.dimensao_comprimento_cm) : undefined,
        unidade: form.unidade.trim() || 'un',
        valor_unitario: parseNumber(form.valor_unitario) ?? 0,
        fornecedor: form.fornecedor || undefined,
        observacoes: form.observacoes.trim() || undefined,
        ativo: form.ativo,
      }

      if (record?.id) {
        await insumosService.updateInsumo(record.id, payload)
        toast({
          title: 'Insumo atualizado',
          description: `O cadastro de "${payload.nome}" foi atualizado com sucesso.`,
        })
      } else {
        await insumosService.createInsumo(payload)
        toast({
          title: 'Insumo cadastrado',
          description: `"${payload.nome}" foi adicionado ao catálogo.`,
        })
      }

      onOpenChange(false)
      onSaved?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar insumo'
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: msg,
      })
    } finally {
      setSaving(false)
    }
  }

  // Preview da dimensão
  const previewDimensao = formatarDimensaoInsumo({
    dimensao_tipo: form.dimensao_tipo,
    dimensao_comprimento_cm: parseNumber(form.dimensao_comprimento_cm),
    dimensao_largura_cm: parseNumber(form.dimensao_largura_cm),
    dimensao_altura_cm: parseNumber(form.dimensao_altura_cm),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              {form.tipo === 'servico' ? (
                <Scissors className="h-4 w-4" />
              ) : (
                <Package className="h-4 w-4" />
              )}
            </div>
            <div>
              <DialogTitle className="text-base font-bold">
                {record?.id ? 'Editar Insumo / Serviço' : 'Novo Insumo ou Serviço Terceirizado'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Cadastre insumos físicos (embalagem, tecidos) ou serviços de terceiros (costura,
                impressão) com rastreabilidade de origem.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Linha 1: Nome */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nome do Insumo / Serviço *</Label>
            <Input
              required
              placeholder="Ex: Caixa Kraft P (20x15x5 cm), Tecido Algodão Cru, Costura Body..."
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="text-xs"
            />
          </div>

          {/* Linha 2: Tipo & Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tipo de Item *</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm({ ...form, tipo: v as InsumoTipo })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="insumo">Insumo Físico (material, embalagem...)</SelectItem>
                  <SelectItem value="servico">
                    Serviço Terceirizado (costureira, facção...)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Categoria</Label>
                {onOpenCategorias && (
                  <button
                    type="button"
                    onClick={onOpenCategorias}
                    className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" /> Gerenciar
                  </button>
                )}
              </div>
              <Select
                value={form.categoria || '__none__'}
                onValueChange={(v) => setForm({ ...form, categoria: v === '__none__' ? '' : v })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione a categoria" />
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

          {/* Linha 3: Fornecedor / Terceirizado (Rastreabilidade) */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              Fornecedor / Terceirizado de Origem
            </Label>
            <Select
              value={form.fornecedor || '__none__'}
              onValueChange={(v) => setForm({ ...form, fornecedor: v === '__none__' ? '' : v })}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Selecione o fornecedor ou costureira..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Origem interna / Sem fornecedor vinculado</SelectItem>
                {fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome_fantasia || f.razao_social}
                    {f.cidade ? ` (${f.cidade}/${f.uf || ''})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Garante que você saiba exatamente de quem comprou o insumo ou qual costureira realizou
              o serviço.
            </p>
          </div>

          {/* Linha 4: Dimensões (Nenhuma, 2D, 3D) */}
          <div className="p-3 rounded-xl border border-border/80 bg-muted/20 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <Label className="text-xs font-bold text-foreground">
                  Tipo de Dimensão (2D ou 3D)
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Especialmente para embalagens (caixas, sacos) e cortes de tecidos.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary shrink-0 self-start sm:self-auto">
                {previewDimensao}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label
                className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                  form.dimensao_tipo === 'nenhuma'
                    ? 'border-primary bg-primary/5 font-bold text-primary'
                    : 'border-border bg-white text-muted-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="dimensao_tipo"
                  value="nenhuma"
                  checked={form.dimensao_tipo === 'nenhuma'}
                  onChange={() => setForm({ ...form, dimensao_tipo: 'nenhuma' })}
                  className="sr-only"
                />
                <span>Sem dimensão</span>
              </label>

              <label
                className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                  form.dimensao_tipo === '2d'
                    ? 'border-primary bg-primary/5 font-bold text-primary'
                    : 'border-border bg-white text-muted-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="dimensao_tipo"
                  value="2d"
                  checked={form.dimensao_tipo === '2d'}
                  onChange={() => setForm({ ...form, dimensao_tipo: '2d' })}
                  className="sr-only"
                />
                <span>2D (Largura × Altura)</span>
              </label>

              <label
                className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                  form.dimensao_tipo === '3d'
                    ? 'border-primary bg-primary/5 font-bold text-primary'
                    : 'border-border bg-white text-muted-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="dimensao_tipo"
                  value="3d"
                  checked={form.dimensao_tipo === '3d'}
                  onChange={() => setForm({ ...form, dimensao_tipo: '3d' })}
                  className="sr-only"
                />
                <span>3D (Comp. × Larg. × Alt.)</span>
              </label>
            </div>

            {/* Campos condicionais de dimensões */}
            {form.dimensao_tipo === '2d' && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Largura (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ex: 20"
                    value={form.dimensao_largura_cm}
                    onChange={(e) => setForm({ ...form, dimensao_largura_cm: e.target.value })}
                    className="h-8 text-xs bg-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Altura / Comprimento (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ex: 30"
                    value={form.dimensao_altura_cm}
                    onChange={(e) => setForm({ ...form, dimensao_altura_cm: e.target.value })}
                    className="h-8 text-xs bg-white font-mono"
                  />
                </div>
              </div>
            )}

            {form.dimensao_tipo === '3d' && (
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Comprimento (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ex: 30"
                    value={form.dimensao_comprimento_cm}
                    onChange={(e) => setForm({ ...form, dimensao_comprimento_cm: e.target.value })}
                    className="h-8 text-xs bg-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Largura (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ex: 20"
                    value={form.dimensao_largura_cm}
                    onChange={(e) => setForm({ ...form, dimensao_largura_cm: e.target.value })}
                    className="h-8 text-xs bg-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Altura (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ex: 10"
                    value={form.dimensao_altura_cm}
                    onChange={(e) => setForm({ ...form, dimensao_altura_cm: e.target.value })}
                    className="h-8 text-xs bg-white font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Linha 5: Valor unitário e Unidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Valor Unitário (R$)</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                placeholder="Ex: 1.50"
                value={form.valor_unitario}
                onChange={(e) => setForm({ ...form, valor_unitario: e.target.value })}
                className="text-xs font-mono font-bold"
              />
              <p className="text-[11px] text-muted-foreground">
                Ao selecionar este insumo no produto, este custo será usado no cálculo automático.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Unidade de Medida</Label>
              <Input
                placeholder="Ex: un, m, cm, kg, g, rolo..."
                value={form.unidade}
                onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          {/* Linha 6: Observações */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Observações / Detalhes</Label>
            <Textarea
              rows={2}
              placeholder="Ex.: Gramatura 180g, pedido mínimo 100 un, tempo médio de confecção..."
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              className="text-xs resize-none"
            />
          </div>

          {/* Linha 7: Status ativo */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div>
              <Label className="text-xs font-semibold">Insumo / Serviço Ativo</Label>
              <p className="text-[11px] text-muted-foreground">
                Insumos inativos não são sugeridos na composição de novos produtos.
              </p>
            </div>
            <Switch
              checked={form.ativo}
              onCheckedChange={(checked) => setForm({ ...form, ativo: checked })}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="bg-primary text-white font-bold"
            >
              {saving ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {record?.id ? 'Salvar Alterações' : 'Cadastrar Insumo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
