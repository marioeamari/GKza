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
import { Plus, Trash2, Layers, Calculator, Sparkles, Building2, Package } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type {
  ProdutoCompostoRecord,
  ProdutoCompostoClassificacao,
  ProdutoBaseRecord,
  Empresa,
} from '@/types/domain'
import type { ItemComposicaoCusto } from '@/lib/precificacao/calculo'
import { produtosCompostosService, calcularCustosProdutoComposto } from '@/services/produtos'
import { formatCurrency } from '@/lib/format'

interface ProdutoCompostoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: ProdutoCompostoRecord | null
  produtosBase: ProdutoBaseRecord[]
  empresas: Empresa[]
  onSuccess: () => void
  readOnly?: boolean
}

export function ProdutoCompostoDialog({
  open,
  onOpenChange,
  record,
  produtosBase,
  empresas,
  onSuccess,
  readOnly = false,
}: ProdutoCompostoDialogProps) {
  const { toast } = useToast()
  const [salvando, setSalvando] = useState(false)

  // Campos principais
  const [nome, setNome] = useState('')
  const [classificacao, setClassificacao] = useState<ProdutoCompostoClassificacao>('revenda')
  const [baseOrigemId, setBaseOrigemId] = useState<string>('')
  const [sku, setSku] = useState('')
  const [unidade, setUnidade] = useState('un')
  const [status, setStatus] = useState<'ativo' | 'inativo' | 'rascunho'>('ativo')
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState<string[]>([])
  const [observacoes, setObservacoes] = useState('')

  // Custos e dimensões
  const [custoEmbalagem, setCustoEmbalagem] = useState<number>(0)
  const [custoEtiqueta, setCustoEtiqueta] = useState<number>(0)
  const [composicao, setComposicao] = useState<ItemComposicaoCusto[]>([])

  // Dimensões
  const [pesoG, setPesoG] = useState<number>(0)
  const [compCm, setCompCm] = useState<number>(0)
  const [largCm, setLargCm] = useState<number>(0)
  const [altCm, setAltCm] = useState<number>(0)

  // Itens de produtos_base para compor (insumos, embalagens, etiquetas, etc.)
  const [insumoSelecionadoId, setInsumoSelecionadoId] = useState<string>('')
  const [qtdInsumo, setQtdInsumo] = useState<number>(1)

  useEffect(() => {
    if (open) {
      if (record) {
        setNome(record.nome || '')
        setClassificacao(record.classificacao || 'revenda')
        setBaseOrigemId(record.base_origem || '')
        setSku(record.sku || '')
        setUnidade(record.unidade || 'un')
        setStatus(record.status || 'ativo')
        setEmpresasSelecionadas(record.empresas || [])
        setObservacoes(record.observacoes || '')
        setCustoEmbalagem(record.custo_embalagem || 0)
        setCustoEtiqueta(record.custo_etiqueta || 0)
        setComposicao(record.composicao || [])
        setPesoG(record.peso_g || 0)
        setCompCm(record.dimensao_comprimento_cm || 0)
        setLargCm(record.dimensao_largura_cm || 0)
        setAltCm(record.dimensao_altura_cm || 0)
      } else {
        setNome('')
        setClassificacao('revenda')
        setBaseOrigemId('')
        setSku('')
        setUnidade('un')
        setStatus('ativo')
        setEmpresasSelecionadas([])
        setObservacoes('')
        setCustoEmbalagem(0)
        setCustoEtiqueta(0)
        setComposicao([])
        setPesoG(0)
        setCompCm(0)
        setLargCm(0)
        setAltCm(0)
      }
    }
  }, [open, record])

  // Produtos base filtrados para base_origem (apenas tipo revenda)
  const basesRevenda = produtosBase.filter((b) => b.tipo === 'revenda')

  // Ao selecionar uma base de origem em revenda, herda dados caso estejam vazios
  const handleSelecionarBaseOrigem = (baseId: string) => {
    setBaseOrigemId(baseId)
    const base = produtosBase.find((b) => b.id === baseId)
    if (base) {
      if (!nome) setNome(base.nome)
      if (!sku && base.sku) setSku(base.sku)
      if (base.peso_g && !pesoG) setPesoG(base.peso_g)
      if (base.dimensao_comprimento_cm && !compCm) setCompCm(base.dimensao_comprimento_cm)
      if (base.dimensao_largura_cm && !largCm) setLargCm(base.dimensao_largura_cm)
      if (base.dimensao_altura_cm && !altCm) setAltCm(base.dimensao_altura_cm)
    }
  }

  // Custo de aquisição do base_origem selecionado
  const baseOrigemSelecionada = produtosBase.find((b) => b.id === baseOrigemId)
  const custoAquisicaoBase =
    classificacao === 'revenda' ? Number(baseOrigemSelecionada?.custo_unitario) || 0 : 0

  // Cálculo reativo dos totais
  const resumoCustos = calcularCustosProdutoComposto({
    classificacao,
    custo_aquisicao: custoAquisicaoBase,
    composicao,
    custo_embalagem: custoEmbalagem,
    custo_etiqueta: custoEtiqueta,
  })

  const adicionarLinhaComposicao = () => {
    if (!insumoSelecionadoId) return
    const itemBase = produtosBase.find((b) => b.id === insumoSelecionadoId)
    if (!itemBase) return

    const novaLinha: ItemComposicaoCusto = {
      id: `C${composicao.length}`,
      codigo: `C${composicao.length}`,
      descricao: itemBase.nome,
      qtd: qtdInsumo > 0 ? qtdInsumo : 1,
      custo_unitario: Number(itemBase.custo_unitario) || 0,
      unidade: itemBase.unidade || 'un',
      categoria_custo:
        itemBase.tipo === 'embalagem'
          ? 'embalagem'
          : itemBase.tipo === 'etiqueta'
            ? 'etiqueta'
            : itemBase.tipo === 'servico'
              ? 'servico'
              : 'insumo',
      fornecedor_id: itemBase.fornecedor,
      fornecedor_nome: itemBase.expand?.fornecedor?.nome_fantasia || 'Fornecedor',
      insumo_id: itemBase.id,
      insumo_tipo: itemBase.tipo === 'servico' ? 'servico' : 'insumo',
    }

    setComposicao([...composicao, novaLinha])
    setInsumoSelecionadoId('')
    setQtdInsumo(1)
  }

  const removerLinhaComposicao = (index: number) => {
    setComposicao(composicao.filter((_, idx) => idx !== index))
  }

  const toggleEmpresa = (empresaId: string) => {
    if (empresasSelecionadas.includes(empresaId)) {
      setEmpresasSelecionadas(empresasSelecionadas.filter((id) => id !== empresaId))
    } else {
      setEmpresasSelecionadas([...empresasSelecionadas, empresaId])
    }
  }

  const handleSalvar = async () => {
    if (!nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do Produto Composto.',
        variant: 'destructive',
      })
      return
    }

    if (classificacao === 'revenda' && !baseOrigemId) {
      toast({
        title: 'Base de Origem obrigatória',
        description: 'Produtos de revenda exigem uma Base de Origem vinculada.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvando(true)
      const payload: Partial<ProdutoCompostoRecord> = {
        nome: nome.trim(),
        classificacao,
        base_origem: classificacao === 'revenda' ? baseOrigemId : undefined,
        sku: sku.trim(),
        unidade,
        status,
        empresas: empresasSelecionadas,
        composicao,
        custo_aquisicao: custoAquisicaoBase,
        custo_embalagem: custoEmbalagem,
        custo_etiqueta: custoEtiqueta,
        peso_g: pesoG,
        dimensao_comprimento_cm: compCm,
        dimensao_largura_cm: largCm,
        dimensao_altura_cm: altCm,
        observacoes,
      }

      await produtosCompostosService.save(payload, record?.id)

      toast({
        title: 'Produto Composto salvo',
        description: 'Produto atualizado e sincronizado com o motor de precificação.',
      })
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao salvar produto',
        description: err.message || 'Falha ao salvar produto composto.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-orange-50 text-[#DF5830]">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                {readOnly
                  ? `Visualizar Produto: ${record?.nome || ''}`
                  : record
                    ? 'Editar Composição do Produto'
                    : 'Novo Produto Composto'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Entidade central de precificação e catálogo comercial, com composição analítica de
                custos.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Classificação e Dados Básicos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="nome">Nome Comercial do Produto *</Label>
              <Input
                id="nome"
                value={nome}
                disabled={readOnly}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Toalha de Banho Allure Banhão"
                className="font-medium"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="classificacao">Classificação *</Label>
              <Select
                value={classificacao}
                disabled={readOnly}
                onValueChange={(v) => setClassificacao(v as ProdutoCompostoClassificacao)}
              >
                <SelectTrigger id="classificacao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenda">Revenda Comercial</SelectItem>
                  <SelectItem value="fabricacao_propria">Fabricação Própria</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Base de Origem (Obrigatória para Revenda) */}
          {classificacao === 'revenda' && (
            <div className="p-3.5 rounded-lg border border-blue-100 bg-blue-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="baseOrigem"
                  className="text-xs font-semibold text-blue-900 flex items-center gap-1.5"
                >
                  <Package className="h-4 w-4 text-blue-600" />
                  Base de Origem do Fornecedor (Obrigatória p/ Revenda)
                </Label>
                {baseOrigemSelecionada && (
                  <span className="text-xs font-semibold text-blue-800">
                    Custo de Aquisição:{' '}
                    {formatCurrency(Number(baseOrigemSelecionada.custo_unitario) || 0)}
                  </span>
                )}
              </div>
              <Select
                value={baseOrigemId}
                disabled={readOnly}
                onValueChange={handleSelecionarBaseOrigem}
              >
                <SelectTrigger id="baseOrigem" className="bg-white">
                  <SelectValue placeholder="Selecione o produto base de origem..." />
                </SelectTrigger>
                <SelectContent>
                  {basesRevenda.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nome} {b.sku ? `(SKU: ${b.sku})` : ''} —{' '}
                      {b.expand?.fornecedor?.nome_fantasia || 'Fornecedor'} —{' '}
                      {formatCurrency(Number(b.custo_unitario) || 0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {baseOrigemSelecionada?.expand?.fornecedor && (
                <p className="text-[11px] text-blue-700">
                  Fornecedor de origem: {baseOrigemSelecionada.expand.fornecedor.nome_fantasia}{' '}
                  (CNPJ/CPF:{' '}
                  {baseOrigemSelecionada.expand.fornecedor.cnpj ||
                    baseOrigemSelecionada.expand.fornecedor.cpf ||
                    '—'}
                  )
                </p>
              )}
            </div>
          )}

          {/* Vínculo de Empresas (Múltiplas Empresas - Sem duplicar receita) */}
          <div className="p-3.5 rounded-lg border border-neutral-200 bg-neutral-50/70 space-y-2">
            <Label className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-orange-600" />
              Empresas Vinculadas (Vínculo direto, sem duplicação de receita)
            </Label>
            <p className="text-[11px] text-muted-foreground">
              O produto é único e compartilhado; vincular a mais de uma empresa permite faturá-lo em
              canais de ambas mantendo a mesma receita técnica.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {empresas.map((emp) => {
                const ativo = empresasSelecionadas.includes(emp.id)
                return (
                  <button
                    key={emp.id}
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggleEmpresa(emp.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      ativo
                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                    } ${readOnly ? 'cursor-default' : ''}`}
                  >
                    {emp.nome_fantasia || emp.razao_social}
                  </button>
                )
              })}
              {empresas.length === 0 && (
                <span className="text-xs text-muted-foreground italic">
                  Nenhuma empresa cadastrada no sistema.
                </span>
              )}
            </div>
          </div>

          {/* Composição Analítica de Custos (Produtos Base / Insumos) */}
          <div className="space-y-3 p-3.5 rounded-lg border border-neutral-200 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Calculator className="h-4 w-4 text-[#DF5830]" />
                  Composição por Linhas de Produtos Base
                </Label>
                <p className="text-xs text-muted-foreground">
                  Insumos, etiquetas, embalagens, tecidos ou serviços que compõem o produto.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">Subtotal Composição</span>
                <p className="text-sm font-bold text-neutral-800">
                  {formatCurrency(resumoCustos.custo_composicao)}
                </p>
              </div>
            </div>

            {/* Adicionar linha de composição (oculto em modo leitura) */}
            {!readOnly && (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <div className="flex-1">
                  <Select value={insumoSelecionadoId} onValueChange={setInsumoSelecionadoId}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Escolha um item de produtos_base (insumo, embalagem, serviço)..." />
                    </SelectTrigger>
                    <SelectContent>
                      {produtosBase
                        .filter((b) => b.tipo !== 'revenda')
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.nome} ({b.tipo}) — {b.expand?.fornecedor?.nome_fantasia || 'Forn.'} —{' '}
                            {formatCurrency(Number(b.custo_unitario) || 0)}/{b.unidade || 'un'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min="0.01"
                    step="0.1"
                    value={qtdInsumo}
                    onChange={(e) => setQtdInsumo(Number(e.target.value))}
                    placeholder="Qtd"
                    className="text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={adicionarLinhaComposicao}
                  disabled={!insumoSelecionadoId}
                  className="gap-1 text-xs border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </Button>
              </div>
            )}

            {/* Tabela de composição */}
            {composicao.length > 0 ? (
              <div className="border rounded-md overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b">
                    <tr>
                      <th className="py-2 px-3">Item / Origem</th>
                      <th className="py-2 px-2 text-center">Qtd</th>
                      <th className="py-2 px-2 text-right">Unitário</th>
                      <th className="py-2 px-2 text-right">Subtotal</th>
                      <th className="py-2 px-2 text-center w-10">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {composicao.map((item, idx) => {
                      const sub = (item.qtd || 1) * (item.custo_unitario || 0)
                      return (
                        <tr key={idx} className="hover:bg-neutral-50/50">
                          <td className="py-2 px-3">
                            <span className="font-medium text-neutral-800">{item.descricao}</span>
                            {item.fornecedor_nome && (
                              <span className="block text-[10px] text-muted-foreground">
                                Fornecedor: {item.fornecedor_nome}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">{item.qtd}</td>
                          <td className="py-2 px-2 text-right">
                            {formatCurrency(item.custo_unitario)}
                          </td>
                          <td className="py-2 px-2 text-right font-semibold text-neutral-800">
                            {formatCurrency(sub)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {!readOnly ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-red-500 hover:bg-red-50"
                                onClick={() => removerLinhaComposicao(idx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-neutral-400 italic text-center py-2">
                Nenhum item adicional inserido na composição (opcional para revenda).
              </p>
            )}
          </div>

          {/* Embalagem e Etiqueta extras + Card Resumo de Custo Total */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="custoEmb" className="text-xs">
                Custo Embalagem Adicional (R$)
              </Label>
              <Input
                id="custoEmb"
                type="number"
                disabled={readOnly}
                step="0.01"
                min="0"
                value={custoEmbalagem}
                onChange={(e) => setCustoEmbalagem(Number(e.target.value))}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="custoEti" className="text-xs">
                Custo Etiqueta (R$)
              </Label>
              <Input
                id="custoEti"
                type="number"
                disabled={readOnly}
                step="0.01"
                min="0"
                value={custoEtiqueta}
                onChange={(e) => setCustoEtiqueta(Number(e.target.value))}
                className="text-xs"
              />
            </div>

            {/* Painel do Custo Total Consolidado */}
            <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-right flex flex-col justify-center">
              <span className="text-[11px] font-semibold text-orange-900 uppercase tracking-wider">
                Custo Total Consolidado
              </span>
              <p className="text-xl font-bold text-[#DF5830]">
                {formatCurrency(resumoCustos.custo_total)}
              </p>
              <span className="text-[10px] text-orange-800">
                {classificacao === 'revenda'
                  ? resumoCustos.custo_embalagem === 0 && custoEmbalagem > 0
                    ? 'Aquisição Base + Composição (já inclui embalagem)'
                    : 'Aquisição Base + Composição + Embalagem'
                  : resumoCustos.custo_embalagem === 0 && custoEmbalagem > 0
                    ? 'Composição Fabricação (já inclui embalagem)'
                    : 'Composição Fabricação + Embalagem'}
              </span>
            </div>
          </div>

          {/* SKU, Dimensões e Status */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t">
            <div className="space-y-1">
              <Label htmlFor="sku" className="text-xs">
                SKU Próprio
              </Label>
              <Input
                id="sku"
                value={sku}
                disabled={readOnly}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex: PROD-ALLURE"
                className="text-xs uppercase"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="peso" className="text-xs">
                Peso (g)
              </Label>
              <Input
                id="peso"
                type="number"
                disabled={readOnly}
                value={pesoG}
                onChange={(e) => setPesoG(Number(e.target.value))}
                placeholder="200"
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="dimensoes" className="text-xs">
                C × L × A (cm)
              </Label>
              <div className="flex gap-1">
                <Input
                  value={compCm}
                  disabled={readOnly}
                  onChange={(e) => setCompCm(Number(e.target.value))}
                  placeholder="C"
                  className="text-xs px-1 text-center"
                />
                <Input
                  value={largCm}
                  disabled={readOnly}
                  onChange={(e) => setLargCm(Number(e.target.value))}
                  placeholder="L"
                  className="text-xs px-1 text-center"
                />
                <Input
                  value={altCm}
                  disabled={readOnly}
                  onChange={(e) => setAltCm(Number(e.target.value))}
                  placeholder="A"
                  className="text-xs px-1 text-center"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="status" className="text-xs">
                Status
              </Label>
              <Select value={status} disabled={readOnly} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger id="status" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <Label htmlFor="obs" className="text-xs">
              Observações Técnicas / Comerciais
            </Label>
            <Textarea
              id="obs"
              rows={2}
              disabled={readOnly}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas de expedição, composição de lote ou instruções especiais..."
              className="text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            {readOnly ? 'Fechar' : 'Cancelar'}
          </Button>
          {!readOnly && (
            <Button
              type="button"
              onClick={handleSalvar}
              disabled={salvando}
              className="bg-[#DF5830] hover:bg-[#c94d28] text-white"
            >
              {salvando ? 'Salvando...' : 'Salvar Produto Composto'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
