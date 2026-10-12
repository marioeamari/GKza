import React, { useState, useMemo } from 'react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Plus, Check, ShoppingBag, Store, AlertCircle, Building2 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { CanalLojaLucro } from '@/lib/lucro'
import { PrecificacaoAprovadaItem } from '@/services/lucro'

export interface ModalAdicionarProdutoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canais: CanalLojaLucro[]
  precificacoesAprovadas: PrecificacaoAprovadaItem[]
  produtosJaAdicionadosIds: string[]
  onAdicionar: (item: PrecificacaoAprovadaItem, quantidadeInicial?: number) => void
}

export const ModalAdicionarProduto: React.FC<ModalAdicionarProdutoProps> = ({
  open,
  onOpenChange,
  canais,
  precificacoesAprovadas,
  produtosJaAdicionadosIds,
  onAdicionar,
}) => {
  // Canal selecionado no dropdown (filtro principal, padrão "todos" ou primeiro canal)
  const [canalSelecionadoId, setCanalSelecionadoId] = useState<string>('todos')
  // Empresa selecionada no dropdown (filtro por empresa, padrão "todas")
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('todas')
  // Termo de busca de produto (nome ou SKU)
  const [termoBusca, setTermoBusca] = useState<string>('')
  // Quantidade inicial opcional para adicionar diretamente
  const [quantidadeInicial, setQuantidadeInicial] = useState<string>('')

  // Lista de empresas únicas encontradas nas precificações aprovadas
  const empresasOpcoes = useMemo(() => {
    const mapa = new Map<string, { id: string; nome: string }>()
    for (const p of precificacoesAprovadas) {
      const nome = p.empresa_nome || 'Sem Empresa'
      const chave = p.empresa_id || nome
      if (!mapa.has(chave)) {
        mapa.set(chave, { id: chave, nome })
      }
    }
    return Array.from(mapa.values())
  }, [precificacoesAprovadas])

  // Filtra itens com precificação aprovada de acordo com canal, empresa e termo de busca
  const itensFiltrados = useMemo(() => {
    return precificacoesAprovadas.filter((item) => {
      // Filtro de canal
      if (canalSelecionadoId !== 'todos' && item.canal_id !== canalSelecionadoId) {
        return false
      }

      // Filtro de empresa
      if (empresaSelecionada !== 'todas') {
        const itemChaveEmpresa = item.empresa_id || item.empresa_nome || 'Sem Empresa'
        if (itemChaveEmpresa !== empresaSelecionada) {
          return false
        }
      }

      // Filtro de texto (nome, SKU, marca, categoria, modalidade, empresa)
      if (termoBusca.trim()) {
        const termo = termoBusca.toLowerCase().trim()
        const matchNome = item.produto_nome.toLowerCase().includes(termo)
        const matchSku = (item.produto_sku || '').toLowerCase().includes(termo)
        const matchMarca = (item.produto_marca || '').toLowerCase().includes(termo)
        const matchCanal = item.canal_nome.toLowerCase().includes(termo)
        const matchModalidade = (item.modalidade_nome || '').toLowerCase().includes(termo)
        const matchEmpresa = (item.empresa_nome || '').toLowerCase().includes(termo)
        if (
          !matchNome &&
          !matchSku &&
          !matchMarca &&
          !matchCanal &&
          !matchModalidade &&
          !matchEmpresa
        ) {
          return false
        }
      }

      return true
    })
  }, [precificacoesAprovadas, canalSelecionadoId, empresaSelecionada, termoBusca])

  const handleSelecionar = (item: PrecificacaoAprovadaItem) => {
    const qtd = parseInt(quantidadeInicial, 10)
    onAdicionar(item, isNaN(qtd) || qtd <= 0 ? undefined : qtd)
    // Fecha o modal ou mantém aberto se quiser adicionar múltiplos
    onOpenChange(false)
    setTermoBusca('')
    setQuantidadeInicial('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-3 border-b">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Adicionar Produto à Grade do Período
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Selecione o canal e busque apenas produtos com precificação{' '}
                <strong className="text-emerald-700 font-semibold">APROVADA</strong> em
                /precificacao/aprovados.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* FILTROS: CANAL, EMPRESA E BUSCA DE PRODUTO */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3">
          {/* Dropdown de Canal */}
          <div className="sm:col-span-4 space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5 text-purple-600" />
              Canal / Loja
            </Label>
            <Select value={canalSelecionadoId} onValueChange={(val) => setCanalSelecionadoId(val)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione o canal..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos" className="text-xs font-medium">
                  Todos os Canais ({precificacoesAprovadas.length})
                </SelectItem>
                {canais.map((c, idx) => {
                  const qtdPrecs = precificacoesAprovadas.filter((p) => p.canal_id === c.id).length
                  const keyCanal = c.id ? `select-canal-${c.id}` : `select-canal-idx-${idx}`
                  return (
                    <SelectItem
                      key={keyCanal}
                      value={c.id || `canal-${idx}`}
                      className="text-xs flex items-center justify-between"
                      disabled={qtdPrecs === 0}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: c.marketplace_cor || '#6B7280' }}
                        />
                        <span>
                          {c.nome} {c.marketplace_nome ? `(${c.marketplace_nome})` : ''}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          [{qtdPrecs} aprov.]
                        </span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Dropdown de Empresa */}
          <div className="sm:col-span-3 space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              Empresa
            </Label>
            <Select value={empresaSelecionada} onValueChange={(val) => setEmpresaSelecionada(val)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todas as empresas..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas" className="text-xs font-medium">
                  Todas as Empresas
                </SelectItem>
                {empresasOpcoes.map((emp) => {
                  const qtdEmp = precificacoesAprovadas.filter(
                    (p) => (p.empresa_id || p.empresa_nome || 'Sem Empresa') === emp.id,
                  ).length
                  return (
                    <SelectItem key={`filtro-emp-${emp.id}`} value={emp.id} className="text-xs">
                      <span>{emp.nome}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">[{qtdEmp}]</span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Campo de Busca por Nome / SKU */}
          <div className="sm:col-span-3 space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              Buscar Produto / SKU
            </Label>
            <div className="relative">
              <Input
                placeholder="Ex: Banho Leve, RFolha..."
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                className="h-9 text-xs pl-8"
              />
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
            </div>
          </div>

          {/* Quantidade Inicial Opcional */}
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs font-semibold" title="Quantidade vendida para inserir direto">
              Qtd Inicial
            </Label>
            <Input
              type="number"
              min="1"
              placeholder="Ex: 10"
              value={quantidadeInicial}
              onChange={(e) => setQuantidadeInicial(e.target.value)}
              className="h-9 text-xs font-mono text-right"
            />
          </div>
        </div>

        {/* LISTA DE PRODUTOS + CANAIS APROVADOS */}
        <div className="flex-1 overflow-y-auto mt-3 border rounded-lg divide-y bg-white min-h-[260px] max-h-[380px]">
          {itensFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <AlertCircle className="h-8 w-8 text-amber-500/70 mb-2" />
              <p className="text-xs font-semibold text-foreground">
                Nenhum produto com precificação aprovada encontrado
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">
                Apenas pares produto+canal com precificação aprovada em /precificacao/aprovados são
                exibidos. Verifique se o canal selecionado possui regras aprovadas.
              </p>
            </div>
          ) : (
            itensFiltrados.map((item, idx) => {
              const jaNaGrade = produtosJaAdicionadosIds.includes(item.produto_id)
              // Chave única e estável: prefere o id único da precificação (item.id) ou compõe produto:canal:id/indice
              const itemKey = item.id
                ? `prec-aprovada-${item.id}`
                : `prec-aprovada-${item.produto_id}:${item.canal_id}:${idx}`

              return (
                <div
                  key={itemKey}
                  className="flex items-center justify-between p-3 hover:bg-slate-50 transition text-xs"
                >
                  <div className="flex items-start gap-3 min-w-0 pr-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-purple-50 text-purple-700 mt-0.5">
                      <ShoppingBag className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground text-xs truncate">
                          {item.produto_nome}
                        </span>
                        {item.produto_sku && (
                          <Badge variant="outline" className="text-[10px] py-0 font-mono">
                            {item.produto_sku}
                          </Badge>
                        )}
                        <Badge
                          variant="secondary"
                          className="text-[10px] py-0 bg-purple-50 text-purple-800 font-semibold"
                        >
                          {item.canal_nome}
                        </Badge>
                        {item.modalidade_nome && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] py-0 bg-blue-50 text-blue-700 border border-blue-200 font-semibold"
                          >
                            {item.modalidade_nome}
                          </Badge>
                        )}
                        {item.empresa_nome && (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 border-slate-300 text-slate-700 bg-slate-50 font-medium"
                          >
                            <Building2 className="h-2.5 w-2.5 mr-1 text-slate-500" />
                            {item.empresa_nome}
                          </Badge>
                        )}
                        {jaNaGrade && (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 border-emerald-300 text-emerald-700 bg-emerald-50"
                          >
                            <Check className="h-2.5 w-2.5 mr-0.5" /> Na grade
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                        <span>
                          Preço Venda:{' '}
                          <strong className="text-foreground font-mono">
                            {formatCurrency(item.preco_venda)}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Lucro Líq. Unit.:{' '}
                          <strong className="text-emerald-700 font-mono">
                            {formatCurrency(item.lucro_liquido_unitario)}
                          </strong>
                        </span>
                        {item.margem_liquida_percentual > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-600 font-mono">
                              ({item.margem_liquida_percentual.toFixed(1)}%)
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className="h-8 text-xs font-semibold gap-1 bg-purple-700 hover:bg-purple-800 text-white shrink-0 ml-2"
                    onClick={() => handleSelecionar(item)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{jaNaGrade ? 'Inserir Qtd' : 'Adicionar'}</span>
                  </Button>
                </div>
              )
            })
          )}
        </div>

        <DialogFooter className="pt-3 border-t flex items-center justify-between sm:justify-between">
          <div className="text-[11px] text-muted-foreground">
            Exibindo <strong className="text-foreground">{itensFiltrados.length}</strong> par(es)
            com precificação aprovada.
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
