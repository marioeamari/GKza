import { OrcamentoRecord } from '@/types/orcamento'
import {
  formatarMoedaBR,
  formatarDataBR,
  normalizarCanaisExpandidos,
  normalizarOrcamentoRecord,
} from '@/lib/precificacao/orcamentoCalculo'
import { getFileUrl } from '@/lib/pocketbase/files'

export function gerarHTMLParaImpressaoPDF(orcamentoRaw: OrcamentoRecord): string {
  const orcamento = normalizarOrcamentoRecord(orcamentoRaw)
  const canais = normalizarCanaisExpandidos(orcamento.expand?.canais_comparados)
  const itens = Array.isArray(orcamento.expand?.itens) ? orcamento.expand.itens : []
  const totais =
    orcamento.totais_por_canal &&
    typeof orcamento.totais_por_canal === 'object' &&
    !Array.isArray(orcamento.totais_por_canal)
      ? orcamento.totais_por_canal
      : {}

  const formatarData = (dt?: string) => {
    return formatarDataBR(dt)
  }

  // Imagem em destaque do tema/modelo no cabeçalho
  const temaExpandido = orcamento.expand?.tema
  const fotoTema = temaExpandido?.foto ? getFileUrl(temaExpandido, temaExpandido.foto) : ''
  const primeiroItemComFoto = itens.find(
    (it) =>
      it.imagem_anexo ||
      it.foto_url ||
      (it.expand as any)?.modelo?.foto ||
      (Array.isArray(it.composicao) && it.composicao.some((c) => c.foto_url || c.imagem_anexo)),
  )
  const primeiraFotoItem = primeiroItemComFoto
    ? primeiroItemComFoto.imagem_anexo
      ? getFileUrl(primeiroItemComFoto, primeiroItemComFoto.imagem_anexo)
      : primeiroItemComFoto.foto_url ||
        ((primeiroItemComFoto.expand as any)?.modelo?.foto
          ? getFileUrl(
              (primeiroItemComFoto.expand as any).modelo,
              (primeiroItemComFoto.expand as any).modelo.foto,
            )
          : primeiroItemComFoto.composicao?.find((c) => c.foto_url || c.imagem_anexo)?.foto_url)
    : ''
  const imagemDestaqueCabecalho = fotoTema || primeiraFotoItem

  const itensRows = itens
    .map((item, idx) => {
      const isPersonalizado = item.tipo_item === 'personalizado'
      const fotoModelo = (item.expand as any)?.modelo?.foto
        ? getFileUrl((item.expand as any).modelo, (item.expand as any).modelo.foto)
        : ''
      const fotoAnexo = item.imagem_anexo ? getFileUrl(item, item.imagem_anexo) : ''
      const imagemExibir = fotoAnexo || item.foto_url || fotoModelo

      // Miniaturas das demais imagens da composição ou modelo
      const miniaturasComposicao = (Array.isArray(item.composicao) ? item.composicao : [])
        .map((c) => c.foto_url || (c.imagem_anexo ? getFileUrl(item, c.imagem_anexo) : ''))
        .filter((url): url is string => Boolean(url && url !== imagemExibir))

      const precoCells = canais
        .map((canal) => {
          const precoObj = item.precos_canais?.[canal.id]
          const precoUnit = precoObj?.preco_unitario || 0
          const precoCheioGravado = precoObj?.preco_cheio
          const subtotalBase =
            precoCheioGravado !== undefined && precoCheioGravado > 0
              ? precoCheioGravado
              : Math.round(precoUnit * item.quantidade * 100) / 100
          const subtotal =
            precoObj?.preco_final !== undefined && Number(precoObj.preco_final) >= 0
              ? Number(precoObj.preco_final)
              : subtotalBase
          const descPct = Number(precoObj?.desconto_pct) || 0
          const valorDesc = Number(precoObj?.valor_desconto) || 0
          const freteObj = item.fretes_canais?.[canal.id]
          const frete = Number(freteObj?.valor_frete) || 0
          const modoFrete = freteObj?.modo_frete || 'pago_pelo_cliente'
          let freteHtml = ''
          if (modoFrete === 'frete_gratis') {
            freteHtml = `<div style="font-size: 11px; color: #059669; font-weight: 600;">Frete: Grátis</div>`
          } else if (frete > 0) {
            freteHtml = `<div style="font-size: 11px; color: #df5830;">+ Frete: ${formatarMoedaBR(frete)} (pago pelo cliente)</div>`
          }

          let descontoHtml = ''
          if (descPct > 0) {
            descontoHtml = `<div style="font-size: 10px; color: #d97706; font-weight: bold;">${descPct}% off (-${formatarMoedaBR(valorDesc)})</div>`
          }

          return `
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 13px;">
              <div><strong>${formatarMoedaBR(subtotal)}</strong></div>
              <div style="font-size: 11px; color: #6b7280;">(${formatarMoedaBR(precoUnit)}/un)</div>
              ${descontoHtml}
              ${freteHtml}
            </td>
          `
        })
        .join('')

      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              ${
                imagemExibir
                  ? `<img src="${imagemExibir}" alt="${item.modelo_nome}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb; flex-shrink: 0;" />`
                  : ''
              }
              <div>
                <div>
                  <strong>${item.modelo_nome}</strong>
                  ${item.modelo_codigo ? `<span style="font-size: 11px; color: #6b7280; margin-left: 4px;">(${item.modelo_codigo})</span>` : ''}
                  <span style="font-size: 9px; padding: 1px 4px; border-radius: 3px; margin-left: 4px; ${isPersonalizado ? 'background: #ede9fe; color: #6d28d9;' : 'background: #dcfce7; color: #15803d;'}">
                    ${isPersonalizado ? 'Personalizado' : 'Cadastrado'}
                  </span>
                </div>
                ${
                  item.descricao
                    ? `<div style="font-size: 11px; color: #4b5563; font-style: italic; margin-top: 1px;">${item.descricao}</div>`
                    : ''
                }
                ${
                  item.tema_nome || item.cor
                    ? `<div style="font-size: 11px; color: #4b5563; margin-top: 2px;">
                        ${item.tema_nome ? `Tema: <strong>${item.tema_nome}</strong>` : ''}
                        ${item.cor ? ` &bull; Cor: <strong>${item.cor}</strong>` : ''}
                      </div>`
                    : ''
                }
                ${
                  Array.isArray(item.composicao) && item.composicao.length > 0
                    ? `<div style="font-size: 11px; color: #4b5563; margin-top: 4px; padding-top: 3px; border-top: 1px dashed #e5e7eb;">
                        <span style="font-weight: 600; color: #6b7280; font-size: 10px; text-transform: uppercase;">Composição do Kit:</span>
                        <div style="margin-top: 2px;">
                          ${item.composicao
                            .map((c) => {
                              const cFoto =
                                c.foto_url ||
                                (c.imagem_anexo ? getFileUrl(item, c.imagem_anexo) : '')
                              return `
                                  <span style="display: inline-flex; align-items: center; gap: 4px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 3px; padding: 1px 5px; font-size: 10px; margin-right: 4px; margin-bottom: 2px;">
                                    ${cFoto ? `<img src="${cFoto}" alt="${c.modelo_nome || 'Item'}" style="width: 16px; height: 16px; object-fit: cover; border-radius: 2px;" />` : ''}
                                    <span><strong>${c.quantidade}x</strong> ${c.modelo_nome || c.descricao || 'Item'}${c.tema_nome ? ` (${c.tema_nome})` : ''}</span>
                                  </span>
                                `
                            })
                            .join('')}
                        </div>
                      </div>`
                    : ''
                }
                ${
                  miniaturasComposicao.length > 0
                    ? `<div style="display: flex; gap: 4px; margin-top: 4px; align-items: center;">
                        <span style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Fotos do Item:</span>
                        ${miniaturasComposicao
                          .slice(0, 5)
                          .map(
                            (imgUrl) =>
                              `<img src="${imgUrl}" alt="Foto adicional" style="width: 24px; height: 24px; object-fit: cover; border-radius: 3px; border: 1px solid #e5e7eb;" />`,
                          )
                          .join('')}
                      </div>`
                    : ''
                }
              </div>
            </div>
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 13px; font-weight: bold;">
            ${item.quantidade}
          </td>
          ${precoCells}
        </tr>
      `
    })
    .join('')

  const totalCols = canais
    .map((canal) => {
      const tot = totais[canal.id]
      const fretePagoCliente = tot?.total_fretes || 0
      const itensTotal = tot?.total_itens || 0
      const geral = tot?.total_geral || 0
      const temFreteGratisNoCanal = itens.some(
        (it) => it.fretes_canais?.[canal.id]?.modo_frete === 'frete_gratis',
      )
      return `
      <td style="padding: 10px; border-top: 2px solid #111827; text-align: right; font-size: 14px;">
        <div style="font-size: 11px; color: #6b7280;">Itens: ${formatarMoedaBR(itensTotal)}</div>
        ${fretePagoCliente > 0 ? `<div style="font-size: 11px; color: #df5830;">Frete: ${formatarMoedaBR(fretePagoCliente)} (pago pelo cliente)</div>` : ''}
        ${fretePagoCliente === 0 && temFreteGratisNoCanal ? `<div style="font-size: 11px; color: #059669; font-weight: 600;">Frete: Grátis</div>` : ''}
        <div style="font-size: 16px; font-weight: bold; color: #df5830; margin-top: 2px;">
          ${formatarMoedaBR(geral)}
        </div>
      </td>
    `
    })
    .join('')
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Orçamento ${orcamento.codigo} - ERP GKza</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 15mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1f2937;
          background: #fff;
          margin: 0;
          padding: 20px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 3px solid #df5830;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .logo-area h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          color: #df5830;
          letter-spacing: -0.5px;
        }
        .logo-area p {
          margin: 2px 0 0 0;
          font-size: 13px;
          color: #4b5563;
        }
        .orc-meta {
          text-align: right;
        }
        .orc-codigo {
          font-size: 18px;
          font-weight: bold;
          color: #111827;
        }
        .orc-data {
          font-size: 12px;
          color: #6b7280;
        }
        .grid-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-bottom: 25px;
          background-color: #f9fafb;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }
        .info-block h3 {
          margin: 0 0 4px 0;
          font-size: 11px;
          text-transform: uppercase;
          color: #6b7280;
          letter-spacing: 0.5px;
        }
        .info-block p {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #111827;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th {
          background-color: #f3f4f6;
          padding: 8px;
          font-size: 12px;
          text-align: left;
          color: #374151;
          font-weight: bold;
          border-bottom: 2px solid #d1d5db;
        }
        .destaque-canais {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-top: 25px;
          margin-bottom: 25px;
        }
        .card-canal {
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 15px;
          background: #fafafa;
        }
        .card-canal.highlight {
          border-color: #df5830;
          background: #fff8f6;
        }
        .card-canal-header {
          font-size: 14px;
          font-weight: bold;
          color: #111827;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 6px;
          margin-bottom: 8px;
        }
        .card-canal-total {
          font-size: 20px;
          font-weight: 800;
          color: #df5830;
        }
        .footer {
          margin-top: 30px;
          border-top: 1px solid #e5e7eb;
          padding-top: 15px;
          font-size: 12px;
          color: #6b7280;
          display: flex;
          justify-content: space-between;
        }
        @media print {
          body {
            padding: 0;
          }
          .no-print {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-area">
          <h1>ERP GKza</h1>
          <p>Proposta Comercial & Cotação de Preços</p>
        </div>
        <div class="orc-meta">
          <div class="orc-codigo">${orcamento.codigo}</div>
          <div class="orc-data">Data: ${formatarData(orcamento.data_orcamento)}</div>
          ${orcamento.validade_data ? `<div class="orc-data" style="color: #df5830; font-weight: bold;">Validade: ${formatarData(orcamento.validade_data)}</div>` : ''}
        </div>
      </div>

      ${
        imagemDestaqueCabecalho
          ? `
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 18px; padding: 10px 14px; background: #fff8f6; border: 1px solid #fed7aa; border-radius: 8px;">
          <img src="${imagemDestaqueCabecalho}" alt="Destaque Tema/Modelo" style="width: 56px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid #fdba74; flex-shrink: 0;" />
          <div>
            <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #df5830; letter-spacing: 0.5px;">Destaque Tema/Modelo</div>
            <div style="font-size: 14px; font-weight: bold; color: #111827;">${orcamento.tema_nome ? `Tema Selecionado: ${orcamento.tema_nome}` : orcamento.titulo || 'Tema e Modelo'}</div>
            ${orcamento.cor ? `<div style="font-size: 11px; color: #4b5563;">Variação / Cor: <strong>${orcamento.cor}</strong></div>` : ''}
          </div>
        </div>
      `
          : ''
      }

      <div class="grid-info">
        <div class="info-block">
          <h3>Cliente</h3>
          <p>${orcamento.cliente_nome}</p>
          ${orcamento.cliente_whatsapp ? `<div style="font-size: 12px; color: #4b5563;">WhatsApp: ${orcamento.cliente_whatsapp}</div>` : ''}
        </div>
        <div class="info-block">
          <h3>Detalhes do Pedido</h3>
          <p>${orcamento.titulo || 'Cotação Personalizada'}</p>
          <div style="font-size: 12px; color: #4b5563;">
            ${itens.length} ${itens.length === 1 ? 'item' : 'itens'} no orçamento
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item / Modelo</th>
            <th style="text-align: center; width: 60px;">Qtd</th>
            ${canais.map((c) => `<th style="text-align: right;">${c.nome}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${itensRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding: 10px; border-top: 2px solid #111827; font-weight: bold; font-size: 14px;">
              TOTAL POR CANAL
            </td>
            ${totalCols}
          </tr>
        </tfoot>
      </table>

      ${
        orcamento.observacoes
          ? `
        <div style="margin-top: 15px; padding: 12px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; font-size: 12px;">
          <strong>Observações:</strong> ${orcamento.observacoes}
        </div>
      `
          : ''
      }

      <div class="footer">
        <div>Documento gerado automaticamente pelo sistema ERP GKza.</div>
        <div>${orcamento.validade_data ? `Proposta válida até ${formatarData(orcamento.validade_data)}` : ''}</div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `
}

/**
 * Dispara o download/impressão do PDF abrindo a janela de impressão do navegador
 */
export function imprimirOuBaixarOrcamentoPDF(orcamento: OrcamentoRecord): void {
  const html = gerarHTMLParaImpressaoPDF(orcamento)
  const janela = window.open('', '_blank', 'width=850,height=1000')
  if (janela) {
    janela.document.open()
    janela.document.write(html)
    janela.document.close()
  } else {
    // Fallback via iframe oculto
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }
  }
}
