import { useState, useMemo } from 'react'
import {
  Copy,
  MessageCircle,
  FileDown,
  Globe,
  RefreshCw,
  ExternalLink,
  Check,
  Power,
  ShieldCheck,
  Send,
} from 'lucide-react'
import { OrcamentoRecord } from '@/types/orcamento'
import {
  gerarTextoWhatsappOrcamento,
  criarLinkWhatsapp,
  formatarMoedaBR,
  normalizarCanaisExpandidos,
  normalizarOrcamentoRecord,
} from '@/lib/precificacao/orcamentoCalculo'
import { imprimirOuBaixarOrcamentoPDF } from '@/lib/precificacao/orcamentoPdf'
import { orcamentosService } from '@/services/orcamentos'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/hooks/use-toast'

interface OrcamentoSaidasPanelProps {
  orcamento: OrcamentoRecord
  onAtualizar?: (novoOrcamento: OrcamentoRecord) => void
}

export function OrcamentoSaidasPanel({ orcamento, onAtualizar }: OrcamentoSaidasPanelProps) {
  const [copiadoTexto, setCopiadoTexto] = useState(false)
  const [copiadoLink, setCopiadoLink] = useState(false)
  const [regenerandoToken, setRegenerandoToken] = useState(false)
  const [alternandoStatusLink, setAlternandoStatusLink] = useState(false)

  const orcamentoNormalizado = useMemo(() => {
    return normalizarOrcamentoRecord(orcamento)
  }, [orcamento])

  const canais = useMemo(() => {
    return normalizarCanaisExpandidos(orcamentoNormalizado.expand?.canais_comparados)
  }, [orcamentoNormalizado.expand?.canais_comparados])

  const itens = useMemo(() => {
    const rawItens = Array.isArray(orcamentoNormalizado.expand?.itens)
      ? orcamentoNormalizado.expand.itens
      : []
    return rawItens.map((it) => ({
      modelo_nome: it?.modelo_nome || 'Item',
      tema_nome: it?.tema_nome,
      cor: it?.cor,
      quantidade: it?.quantidade || 1,
      precos_canais: it?.precos_canais,
      fretes_canais: it?.fretes_canais,
    }))
  }, [orcamentoNormalizado.expand?.itens])

  const textoWhatsapp = useMemo(() => {
    return gerarTextoWhatsappOrcamento({
      titulo: orcamento.titulo,
      tema_nome: orcamento.tema_nome,
      cor: orcamento.cor,
      canais,
      itens,
      totaisPorCanal: orcamento.totais_por_canal,
      validade_data: orcamento.validade_data,
    })
  }, [orcamentoNormalizado, canais, itens])

  const linkPublico = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/orcamento/p/${orcamento.public_token || ''}`
  }, [orcamento.public_token])

  const linkWhatsappWaMe = useMemo(() => {
    return criarLinkWhatsapp(orcamento.cliente_whatsapp, textoWhatsapp)
  }, [orcamento.cliente_whatsapp, textoWhatsapp])

  const handleCopiarTexto = async () => {
    try {
      await navigator.clipboard.writeText(textoWhatsapp)
      setCopiadoTexto(true)
      toast({
        title: 'Texto copiado!',
        description: 'Texto formatado para WhatsApp copiado para a área de transferência.',
      })
      setTimeout(() => setCopiadoTexto(false), 2000)
    } catch {
      toast({
        title: 'Erro ao copiar',
        description: 'Selecione o texto e copie manualmente.',
        variant: 'destructive',
      })
    }
  }

  const handleCopiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkPublico)
      setCopiadoLink(true)
      toast({
        title: 'Link copiado!',
        description: 'Link público do orçamento copiado para a área de transferência.',
      })
      setTimeout(() => setCopiadoLink(false), 2000)
    } catch {
      toast({
        title: 'Erro ao copiar',
        description: 'Copie a URL manualmente.',
        variant: 'destructive',
      })
    }
  }

  const handleRegenerarToken = async () => {
    try {
      setRegenerandoToken(true)
      const res = await orcamentosService.regenerarTokenPublico(orcamento.id)
      const atualizado = {
        ...orcamento,
        public_token: res.public_token,
        link_publico_ativo: true,
      }
      onAtualizar?.(atualizado)
      toast({
        title: 'Link regenerado!',
        description: 'O link antigo foi revogado com segurança e um novo token foi criado.',
      })
    } catch (err: any) {
      toast({
        title: 'Falha ao regenerar link',
        description: err.message || 'Erro inesperado.',
        variant: 'destructive',
      })
    } finally {
      setRegenerandoToken(false)
    }
  }

  const handleToggleLinkAtivo = async (ativo: boolean) => {
    try {
      setAlternandoStatusLink(true)
      await orcamentosService.toggleLinkPublico(orcamento.id, ativo)
      const atualizado = {
        ...orcamento,
        link_publico_ativo: ativo,
      }
      onAtualizar?.(atualizado)
      toast({
        title: ativo ? 'Link ativado' : 'Link desativado',
        description: ativo
          ? 'O orçamento agora pode ser visualizado pelo link público.'
          : 'O acesso público foi suspenso temporariamente.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar link',
        description: err.message || 'Erro inesperado.',
        variant: 'destructive',
      })
    } finally {
      setAlternandoStatusLink(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">3 Formas de Envio ao Cliente</h2>
          <p className="text-xs text-muted-foreground">
            Escolha como enviar esta cotação: Mensagem no WhatsApp, Documento PDF ou Link Web
          </p>
        </div>
        <Badge variant="outline" className="text-xs border-primary/30 text-primary font-bold">
          {orcamento.codigo}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* OPÇÃO 1: TEXTO WHATSAPP */}
        <Card className="border-border/80 shadow-xs flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                <MessageCircle className="w-5 h-5" />
              </div>
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 text-[10px]">
                Mais Rápido
              </Badge>
            </div>
            <CardTitle className="text-base font-bold text-foreground mt-2">
              1. Mensagem de WhatsApp
            </CardTitle>
            <CardDescription className="text-xs">
              Formato idêntico ao modelo com quebras por canal e fretes
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 flex-1 flex flex-col justify-between">
            <div className="relative">
              <pre className="p-3 bg-muted/60 rounded-xl text-xs font-mono text-foreground whitespace-pre-wrap max-h-56 overflow-y-auto border border-border/60">
                {textoWhatsapp}
              </pre>
            </div>

            <div className="space-y-2 pt-2">
              <Button
                variant="outline"
                className="w-full justify-center text-xs font-semibold"
                onClick={handleCopiarTexto}
              >
                {copiadoTexto ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-emerald-600" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar Texto WhatsApp
                  </>
                )}
              </Button>

              <Button
                asChild
                className="w-full justify-center text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              >
                <a href={linkWhatsappWaMe} target="_blank" rel="noopener noreferrer">
                  <Send className="w-4 h-4 mr-2" />
                  Abrir no WhatsApp Web/App
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* OPÇÃO 2: PDF CLIENT-SIDE */}
        <Card className="border-border/80 shadow-xs flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-orange-50 text-primary border border-orange-200/60">
                <FileDown className="w-5 h-5" />
              </div>
              <Badge variant="secondary" className="bg-orange-100 text-primary text-[10px]">
                Formal & Impresso
              </Badge>
            </div>
            <CardTitle className="text-base font-bold text-foreground mt-2">
              2. PDF para Download
            </CardTitle>
            <CardDescription className="text-xs">
              Layout profissional A4 com tabela completa e totais destacados
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-200/40 text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground">Conteúdo gerado no PDF:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Cabeçalho com logo ERP GKza e código {orcamento.codigo}</li>
                <li>Dados do cliente e prazo de validade</li>
                <li>Tabela comparativa por canais com subtotais e fretes</li>
                <li>Totais por canal em destaque no rodapé</li>
              </ul>
            </div>

            <Button
              className="w-full justify-center text-xs font-bold bg-primary hover:bg-primary/90 text-white shadow-xs"
              onClick={() => imprimirOuBaixarOrcamentoPDF(orcamento)}
            >
              <FileDown className="w-4 h-4 mr-2" />
              Baixar / Imprimir PDF Agora
            </Button>
          </CardContent>
        </Card>

        {/* OPÇÃO 3: LINK PÚBLICO */}
        <Card className="border-border/80 shadow-xs flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60">
                <Globe className="w-5 h-5" />
              </div>
              <Badge
                variant={orcamento.link_publico_ativo ? 'default' : 'secondary'}
                className={
                  orcamento.link_publico_ativo
                    ? 'bg-blue-600 text-white text-[10px]'
                    : 'bg-slate-200 text-slate-700 text-[10px]'
                }
              >
                {orcamento.link_publico_ativo ? 'Link Ativo' : 'Link Inativo'}
              </Badge>
            </div>
            <CardTitle className="text-base font-bold text-foreground mt-2">
              3. Link Público de Leitura
            </CardTitle>
            <CardDescription className="text-xs">
              Página sem login acessada apenas via token único e seguro
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="p-2.5 bg-muted/60 rounded-xl border border-border/60 text-xs flex items-center justify-between">
                <span className="font-mono truncate mr-2 text-foreground/80">{linkPublico}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 shrink-0"
                  onClick={handleCopiarLink}
                >
                  {copiadoLink ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>

              {/* Controle de ativação do link */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <Power
                    className={`w-4 h-4 ${orcamento.link_publico_ativo ? 'text-emerald-600' : 'text-muted-foreground'}`}
                  />
                  <span className="text-xs font-semibold text-foreground">
                    Permitir acesso público
                  </span>
                </div>
                <Switch
                  checked={Boolean(orcamento.link_publico_ativo)}
                  onCheckedChange={handleToggleLinkAtivo}
                  disabled={alternandoStatusLink}
                />
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>viewRule pública restrita a este token (sem expor outras coleções).</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs font-medium"
                  asChild
                  disabled={!orcamento.link_publico_ativo}
                >
                  <a href={linkPublico} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Abrir Página
                  </a>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs font-medium border-slate-300"
                  onClick={handleRegenerarToken}
                  disabled={regenerandoToken}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 mr-1.5 ${regenerandoToken ? 'animate-spin' : ''}`}
                  />
                  Regenerar Link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
