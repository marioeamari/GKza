import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import { TriagemCarregando, TriagemGrade } from '@/components/triagem/TriagemCards'
import { TriagemDetalheDialog } from '@/components/triagem/TriagemDetalheDialog'
import { carregarFontesTriagem } from '@/services/triagem'
import {
  avaliarProdutoTriagem,
  ordenarPorAtraso,
  resumirTriagem,
  type TriagemAvaliacao,
} from '@/lib/triagemModelo'
import { urlImagemProdutoTriagem } from '@/lib/triagemImagem'
import { useToast } from '@/hooks/use-toast'

/**
 * Triagem de Produtos — painel visual SOMENTE LEITURA que mostra, por
 * produto/SKU, em qual das 7 etapas do sistema o produto está. O usuário
 * esquece onde parou quando interrompe o cadastro; esta tela responde isso.
 * Não altera nenhum módulo: tudo calculado das coleções existentes.
 */
export default function TriagemProdutosPage() {
  const [avaliacoes, setAvaliacoes] = useState<TriagemAvaliacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionado, setSelecionado] = useState<TriagemAvaliacao | null>(null)
  const { toast } = useToast()

  const carregar = async () => {
    setCarregando(true)
    try {
      const { produtos, fontes } = await carregarFontesTriagem()
      const lista = produtos.map((p) => avaliarProdutoTriagem(p, fontes))
      setAvaliacoes(ordenarPorAtraso(lista))
    } catch (e) {
      console.error('Falha ao carregar triagem', e)
      toast({
        title: 'Erro ao carregar a triagem',
        description: 'Verifique a conexão e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resumo = useMemo(() => resumirTriagem(avaliacoes), [avaliacoes])

  const textoResumo = resumo.total
    ? `${resumo.integrados} de ${resumo.total} produtos 100% integrados` +
      (resumo.pararamEtapa
        ? ` · ${resumo.pararamEtapa.quantidade} pararam na etapa ${resumo.pararamEtapa.nome}`
        : '')
    : ''
  const linhaSemCenarios = resumo.semNenhumCenario
    ? `${resumo.semNenhumCenario} produto(s) ainda sem nenhum cenário de preço`
    : ''

  return (
    <div className="container mx-auto space-y-4 p-4">
      <PageHeader
        title="Triagem de Produtos"
        description={
          textoResumo || 'Painel de integração das 7 etapas por produto/SKU (somente leitura)'
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={carregar}
          disabled={carregando}
          aria-label="Recarregar triagem"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          Recarregar
        </Button>
      </PageHeader>

      {linhaSemCenarios && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {linhaSemCenarios}
        </p>
      )}

      {carregando ? (
        <TriagemCarregando />
      ) : (
        <TriagemGrade
          avaliacoes={avaliacoes}
          onAbrir={setSelecionado}
          getUrlImagem={urlImagemProdutoTriagem}
        />
      )}

      <TriagemDetalheDialog
        avaliacao={selecionado}
        onClose={() => setSelecionado(null)}
        getUrlImagem={urlImagemProdutoTriagem}
      />
    </div>
  )
}
