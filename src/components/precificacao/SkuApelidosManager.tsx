import React, { useState } from 'react'
import { Plus, Trash2, Tag, AlertCircle } from 'lucide-react'
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
import type { PrecCanalRecord } from '@/types/precificacao'
import { adicionarApelidoCanal, removerApelidoCanal } from '@/lib/blingVendasParser'

export interface SkuApelidosManagerProps {
  skuPrincipal: string
  apelidos: Array<{ canal: string; sku_externo: string }>
  canaisDisponiveis: PrecCanalRecord[]
  onChange: (novosApelidos: Array<{ canal: string; sku_externo: string }>) => void
  readOnly?: boolean
}

export function SkuApelidosManager({
  skuPrincipal,
  apelidos = [],
  canaisDisponiveis = [],
  onChange,
  readOnly = false,
}: SkuApelidosManagerProps) {
  const [novoCanal, setNovoCanal] = useState<string>('')
  const [novoSkuExterno, setNovoSkuExterno] = useState<string>('')
  const [erro, setErro] = useState<string | null>(null)

  const handleAdicionar = () => {
    setErro(null)
    const skuLimpo = novoSkuExterno.trim()
    if (!skuLimpo) {
      setErro('Digite o código ou apelido do Bling / canal.')
      return
    }

    // Se não selecionou canal específico, usa 'global' ou primeiro canal
    const canalDestino = novoCanal.trim() || 'todos'

    // Verifica se já existe o mesmo par
    const jaExiste = apelidos.some(
      (a) =>
        a.sku_externo.toLowerCase() === skuLimpo.toLowerCase() &&
        a.canal.toLowerCase() === canalDestino.toLowerCase(),
    )

    if (jaExiste) {
      setErro(`O apelido "${skuLimpo}" já está cadastrado para este canal.`)
      return
    }

    const atualizados = adicionarApelidoCanal(apelidos, canalDestino, skuLimpo)
    onChange(atualizados)
    setNovoSkuExterno('')
  }

  const handleRemover = (canal: string, skuExterno: string) => {
    const atualizados = removerApelidoCanal(apelidos, canal, skuExterno)
    onChange(atualizados)
  }

  const getNomeCanal = (canalId: string) => {
    if (!canalId || canalId === 'todos' || canalId === 'global') return 'Todos os canais'
    const c = canaisDisponiveis.find(
      (item) => item.id === canalId || item.nome.toLowerCase() === canalId.toLowerCase(),
    )
    return c?.nome || canalId
  }

  return (
    <div className="rounded-xl border border-border/80 bg-slate-50/60 p-3.5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-purple-600" />
          <Label className="font-bold text-xs text-foreground uppercase tracking-wider">
            Dicionário de Apelidos SKU por Canal (Bling / Marketplaces)
          </Label>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          SKU Padrão do Sistema:{' '}
          <strong className="text-foreground">{skuPrincipal || 'Nenhum'}</strong>
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Mapeie os códigos que o Bling ou marketplaces enviam (ex:{' '}
        <code className="bg-white px-1 py-0.5 rounded border text-foreground font-mono">B197</code>,{' '}
        <code className="bg-white px-1 py-0.5 rounded border text-foreground font-mono">
          RPatrulha-20
        </code>
        ) para este produto exato. Garante que vendas com códigos alternativos sejam somadas a este
        produto sem agrupar em categorias genéricas.
      </p>

      {/* Lista de apelidos cadastrados */}
      {apelidos.length === 0 ? (
        <div className="p-3 rounded-lg border border-dashed border-border bg-white text-center text-xs text-muted-foreground">
          Nenhum apelido cadastrado ainda para este produto.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {apelidos.map((item, idx) => (
            <div
              key={`${item.canal}-${item.sku_externo}-${idx}`}
              className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-border/70 text-xs shadow-2xs hover:border-purple-200 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Badge
                  variant="outline"
                  className="text-[10px] font-semibold border-purple-200 bg-purple-50 text-purple-800 shrink-0"
                >
                  {getNomeCanal(item.canal)}
                </Badge>
                <div className="truncate font-mono font-bold text-foreground">
                  {item.sku_externo}
                </div>
              </div>

              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleRemover(item.canal, item.sku_externo)}
                  title="Remover apelido"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Formulário de adição rápida */}
      {!readOnly && (
        <div className="pt-2 border-t border-border/60 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-4">
              <Select value={novoCanal} onValueChange={setNovoCanal}>
                <SelectTrigger className="h-8 text-xs bg-white">
                  <SelectValue placeholder="Canal / Loja..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs">
                    Qualquer Canal (Global)
                  </SelectItem>
                  {canaisDisponiveis.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-6">
              <Input
                placeholder="Código do Bling (ex: B197, RPatrulha-20)..."
                value={novoSkuExterno}
                onChange={(e) => {
                  setNovoSkuExterno(e.target.value)
                  if (erro) setErro(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAdicionar()
                  }
                }}
                className="h-8 text-xs font-mono bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAdicionar}
                className="h-8 w-full text-xs font-bold gap-1 border-purple-200 text-purple-800 hover:bg-purple-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar</span>
              </Button>
            </div>
          </div>

          {erro && (
            <p className="text-[11px] text-destructive flex items-center gap-1 font-medium">
              <AlertCircle className="h-3 w-3" />
              <span>{erro}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
