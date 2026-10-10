import { useState } from 'react'
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Sparkles,
  HelpCircle,
  Package,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import {
  parseShopeeColagem,
  ResultadoParseShopee,
  ItemLinhaImportada,
} from '@/lib/expedicaoShopeeParser'
import { separacaoKitsService } from '@/services/separacaoKits'
import type { PrecProdutoRecord } from '@/types/precificacao'
import type { KitTema } from '@/types/separacaoKits'

interface ImportarPedidosShopeeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalogoProdutos: PrecProdutoRecord[]
  temas: KitTema[]
  onImportadoSucesso?: () => void
}

export function ImportarPedidosShopeeModal({
  open,
  onOpenChange,
  catalogoProdutos,
  temas,
  onImportadoSucesso,
}: ImportarPedidosShopeeModalProps) {
  const [textoColado, setTextoColado] = useState('')
  const [resultadoParse, setResultadoParse] = useState<ResultadoParseShopee | null>(null)
  const [salvando, setSalvando] = useState(false)

  const handleAnalisar = () => {
    if (!textoColado.trim()) {
      setResultadoParse(null)
      return
    }
    const res = parseShopeeColagem(textoColado, catalogoProdutos, temas)
    setResultadoParse(res)
  }

  const handleConfirmarImportacao = async () => {
    if (!resultadoParse || resultadoParse.itens.length === 0) return

    setSalvando(true)
    let criados = 0
    let falhas = 0

    const hoje = new Date().toISOString().split('T')[0]

    for (const item of resultadoParse.itens) {
      try {
        await separacaoKitsService.createPedido({
          numero_pedido: item.numeroPedido,
          marketplace: 'Shopee',
          produto_nome: item.produtoNome,
          sku: item.sku || '',
          tema: item.temaId || temas[0]?.id || '',
          quantidade_total: item.quantidade,
          tipo_composicao: item.temPedidoEspecial ? 'personalizada' : 'padrao',
          status_separacao: 'aguardando',
          cliente_nome: item.clienteNome || '',
          observacoes: item.variacao ? `Variação: ${item.variacao}` : '',
          pedido_especial: item.pedidoEspecial || '',
          tem_pedido_especial: item.temPedidoEspecial,
          triagem_pedido_especial: item.triagemPedidoEspecial,
          origem_pedido_especial: 'colagem_shopee',
          data_expedicao: hoje,
          variacao_anuncio: item.variacao || '',
          produto_referencia: item.produtoEncontrado?.id || undefined,
          shopee_order_id: item.numeroPedido,
        })
        criados++
      } catch (err: any) {
        console.warn(`Erro ao criar pedido ${item.numeroPedido}:`, err)
        // Se já existia, tenta atualizar o pedido especial
        try {
          const existente = await separacaoKitsService.getPedidoByNumeroOuSku(item.numeroPedido)
          if (existente) {
            await separacaoKitsService.updatePedido(existente.id, {
              pedido_especial: item.pedidoEspecial || existente.pedido_especial,
              tem_pedido_especial: Boolean(item.pedidoEspecial) || existente.tem_pedido_especial,
              shopee_order_id: item.numeroPedido,
              variacao_anuncio: item.variacao || existente.variacao_anuncio,
            })
            criados++
          } else {
            falhas++
          }
        } catch {
          falhas++
        }
      }
    }

    setSalvando(false)
    toast({
      title: 'Importação Concluída!',
      description: `${criados} pedido(s) processado(s) com sucesso na expedição.${falhas > 0 ? ` (${falhas} falharam)` : ''}`,
    })

    setTextoColado('')
    setResultadoParse(null)
    onOpenChange(false)
    if (onImportadoSucesso) {
      onImportadoSucesso()
    }
  }

  const handleExemploShopee = () => {
    const exemplo = `241014ABCD01\tKIT-40-BLeve\tKit 40 Toalha Leve de Praia\tSortido 5 Modelos\t40\tMariana Costa\tCliente pediu apenas modelo 1 e 2 no chat
241014ABCD02\tKIT-TOALHA-MONICA-30\tKit Toalha de Rosto Mônica 30 un\tPadrão\t30\tJuliana Rios\t
241014ABCD03\tComboBLeveBBanhao\tCombo Toalha Leve + Toalha Banhão\tAzul/Branco\t2\tRicardo Alves\t`
    setTextoColado(exemplo)
    const res = parseShopeeColagem(exemplo, catalogoProdutos, temas)
    setResultadoParse(res)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Upload className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-black text-foreground">
                Importação / Colagem de Pedidos da Shopee
              </DialogTitle>
              <DialogDescription className="text-xs">
                Copie linhas da tabela do Seller Centre ou CSV e cole abaixo para criar os itens de
                expedição do dia.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* BOTÃO PARA CARREGAR EXEMPLO DE TESTE */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Formato flexível: Aceita cópia de tabela (Tab), CSV (; ou ,) ou texto livre com ID,
              SKU e Qtd.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExemploShopee}
              className="h-7 text-xs font-bold border-amber-300 bg-amber-50/60 text-amber-900 hover:bg-amber-100"
            >
              <Sparkles className="mr-1 h-3 w-3" />
              Preencher Exemplo Real
            </Button>
          </div>

          <Textarea
            value={textoColado}
            onChange={(e) => {
              setTextoColado(e.target.value)
              if (!e.target.value.trim()) {
                setResultadoParse(null)
              }
            }}
            onBlur={handleAnalisar}
            placeholder={`Cole aqui as linhas do painel da Shopee...\nExemplo:\n241014ABCD01\tKIT-40-BLeve\tKit 40 Toalha Leve\tSortido\t40\tCliente Nome\tEscolha no chat: modelo 1 e 2`}
            className="min-h-[140px] font-mono text-xs"
          />

          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAnalisar}
              disabled={!textoColado.trim()}
              className="font-bold text-xs"
            >
              Analisar Linhas Coladas
            </Button>
          </div>

          {/* PRÉVIA DOS ITENS PARSEADOS COM MATCHING DE KITS */}
          {resultadoParse && (
            <div className="space-y-3 rounded-2xl border-2 border-primary/20 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-foreground">
                    Itens Identificados ({resultadoParse.totalLinhas})
                  </span>
                  <Badge
                    variant="outline"
                    className="border-emerald-500 bg-emerald-50 text-emerald-800 text-[10px] font-bold"
                  >
                    ✓ {resultadoParse.reconhecidosCount} no catálogo
                  </Badge>
                  {resultadoParse.genericosCount > 0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-500 bg-amber-50 text-amber-800 text-[10px] font-bold"
                    >
                      ⚠ {resultadoParse.genericosCount} genéricos
                    </Badge>
                  )}
                  {resultadoParse.pedidosEspeciaisCount > 0 && (
                    <Badge className="bg-primary text-white text-[10px] font-black uppercase">
                      ★ {resultadoParse.pedidosEspeciaisCount} pedido especial
                    </Badge>
                  )}
                </div>
              </div>

              <div className="divide-y divide-border/60 max-h-64 overflow-y-auto pr-1">
                {resultadoParse.itens.map((item, idx) => (
                  <div key={idx} className="py-2.5 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[11px] font-bold">
                          #{item.numeroPedido}
                        </Badge>
                        <span className="font-bold text-xs text-foreground">
                          {item.produtoNome}
                        </span>
                        {item.sku && (
                          <span className="text-[11px] text-muted-foreground">({item.sku})</span>
                        )}
                      </div>
                      <Badge variant="secondary" className="font-black text-xs">
                        {item.quantidade} un
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {item.reconhecido ? (
                        <span className="inline-flex items-center text-emerald-700 font-semibold">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Kit/Produto reconhecido ({item.produtoEncontrado?.tipo})
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-amber-700 font-semibold">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Não reconhecido no catálogo prec_produtos (item genérico)
                        </span>
                      )}

                      {item.variacao && (
                        <span className="text-muted-foreground">
                          Variação: <strong>{item.variacao}</strong>
                        </span>
                      )}
                    </div>

                    {item.temPedidoEspecial && (
                      <div className="mt-1 rounded bg-amber-100/70 p-2 text-xs font-bold text-amber-950 border border-amber-300">
                        ★ Pedido Especial do Cliente: {item.pedidoEspecial}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
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
            onClick={handleConfirmarImportacao}
            disabled={salvando || !resultadoParse || resultadoParse.itens.length === 0}
            className="bg-primary font-black text-white hover:bg-primary/90"
          >
            {salvando
              ? 'Importando...'
              : `Confirmar e Criar ${resultadoParse?.itens.length || 0} Itens na Expedição`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
