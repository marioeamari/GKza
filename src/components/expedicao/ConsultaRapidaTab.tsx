import { useState } from 'react'
import { Calculator, Sparkles, Check, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { KitTema, KitModelo, KitRegra, ResultadoComposicao } from '@/types/separacaoKits'
import { calcularComposicaoKit } from '@/lib/separacaoCalculo'
import { ModeloSeparacaoCard } from './ModeloSeparacaoCard'

interface ConsultaRapidaTabProps {
  temas: KitTema[]
  modelos: KitModelo[]
  regras: KitRegra[]
}

export function ConsultaRapidaTab({ temas, modelos, regras }: ConsultaRapidaTabProps) {
  const [temaSelecionadoId, setTemaSelecionadoId] = useState<string>(temas[0]?.id || '')
  const [quantidade, setQuantidade] = useState<string>('30')
  const [resultado, setResultado] = useState<ResultadoComposicao | null>(null)
  const [itensSeparados, setItensSeparados] = useState<Record<string, boolean>>({})

  const handleCalcular = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const qtdNum = parseInt(quantidade, 10)
    if (isNaN(qtdNum) || qtdNum <= 0) return

    const tema = temas.find((t) => t.id === temaSelecionadoId)
    if (!tema) return

    const modelosDoTema = modelos.filter((m) => m.tema === tema.id)
    const regrasDoTema = regras.filter((r) => r.tema === tema.id)

    const res = calcularComposicaoKit({
      tema,
      modelos: modelosDoTema,
      quantidadeTotal: qtdNum,
      regrasDoTema,
    })

    setResultado(res)
    setItensSeparados({})
  }

  const toggleItemSeparado = (codigo: string) => {
    setItensSeparados((prev) => ({
      ...prev,
      [codigo]: !prev[codigo],
    }))
  }

  const temaAtual = temas.find((t) => t.id === temaSelecionadoId)
  const modelosAtivosQtd = modelos.filter((m) => m.tema === temaSelecionadoId && m.ativo).length

  return (
    <div className="space-y-6">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
              <Calculator className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-lg font-bold">Simulador e Consulta Rápida</CardTitle>
              <CardDescription>
                Calcule instantaneamente a separação exata sem precisar vincular a um pedido. Útil
                para conferência de estoque, montagem preventiva e treinamento.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCalcular} className="grid gap-4 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-6 space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                1. Selecione o Tema do Produto
              </Label>
              <Select value={temaSelecionadoId} onValueChange={setTemaSelecionadoId}>
                <SelectTrigger className="h-12 text-sm font-semibold">
                  <SelectValue placeholder="Selecione um tema..." />
                </SelectTrigger>
                <SelectContent>
                  {temas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome} {!t.ativo && '(Inativo)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-3 space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                2. Quantidade Total Comprada
              </Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="Ex: 30"
                className="h-12 text-base font-bold"
              />
            </div>

            <div className="sm:col-span-3">
              <Button
                type="submit"
                size="lg"
                className="w-full h-12 bg-primary font-black text-white hover:bg-primary/90 shadow-sm"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                CALCULAR COMPOSIÇÃO
              </Button>
            </div>
          </form>

          {temaAtual && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Tema: <strong>{temaAtual.nome}</strong>
              </span>
              <span>•</span>
              <span>
                Modelos cadastrados ativos: <strong>{modelosAtivosQtd}</strong>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resultados da Consulta */}
      {resultado && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-primary/40 bg-white font-bold text-primary"
                >
                  Regra utilizada: {resultado.origem.toUpperCase()}
                </Badge>
                <span className="text-xs font-semibold text-muted-foreground">
                  {resultado.descricaoRegra}
                </span>
              </div>
              <h2 className="mt-1 text-xl font-black text-foreground">
                Total a separar: {resultado.totalGeral} unidades em {resultado.itens.length} modelos
              </h2>
            </div>
          </div>

          {resultado.avisos.length > 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-700" />
              <AlertTitle className="text-amber-900 font-bold">Observações do Cálculo</AlertTitle>
              <AlertDescription className="text-amber-800 text-xs">
                <ul className="list-inside list-disc space-y-0.5">
                  {resultado.avisos.map((aviso, idx) => (
                    <li key={idx}>{aviso}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Cards de modelos na consulta rápida */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resultado.itens.map((item) => (
              <ModeloSeparacaoCard
                key={item.codigo}
                item={{
                  ...item,
                  separado: itensSeparados[item.codigo] ?? false,
                }}
                onToggleSeparado={() => toggleItemSeparado(item.codigo)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
