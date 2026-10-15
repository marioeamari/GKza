import { OrcamentoRecord } from '@/types/orcamento'
import {
  formatarMoedaBR,
  normalizarCanaisExpandidos,
  normalizarOrcamentoRecord,
} from '@/lib/precificacao/orcamentoCalculo'

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

  const itensRows = itens
    .map((item, idx) => {
      const precoCells = canais
        .map((canal) => {
          const precoUnit = item.precos_canais?.[canal.id]?.preco_unitario || 0
          const subtotal = Math.round(precoUnit * item.quantidade * 100) / 100
          const frete = item.fretes_canais?.[canal.id]?.valor_frete || 0
          return `
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 13px;">
              <div><strong>${formatarMoedaBR(subtotal)}</strong></div>
              <div style="font-size: 11px; color: #6b7280;">(${formatarMoedaBR(precoUnit)}/un)</div>
              ${frete > 0 ? `<div style="font-size: 11px; color: #df5830;">+ Frete ${formatarMoedaBR(frete)}</div>` : ''}
            </td>
          `
        })
        .join('')

      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">
            <div>
              <strong>${item.modelo_nome}</strong>
              ${item.modelo_codigo ? `<span style="font-size: 11px; color: #6b7280; margin-left: 4px;">(${item.modelo_codigo})</span>` : ''}
            </div>
            ${
              item.tema_nome || item.cor
                ? `<div style="font-size: 11px; color: #4b5563; margin-top: 2px;">
                    ${item.tema_nome ? `Tema: <strong>${item.tema_nome}</strong>` : ''}
                    ${item.cor ? ` &bull; Cor: <strong>${item.cor}</strong>` : ''}
                  </div>`
                : ''
            }
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
      const frete = tot?.total_fretes || 0
      const itensTotal = tot?.total_itens || 0
      const geral = tot?.total_geral || 0
      return `
        <td style="padding: 10px; border-top: 2px solid #111827; text-align: right; font-size: 14px;">
          <div style="font-size: 11px; color: #6b7280;">Itens: ${formatarMoedaBR(itensTotal)}</div>
          ${frete > 0 ? `<div style="font-size: 11px; color: #6b7280;">Frete: ${formatarMoedaBR(frete)}</div>` : ''}
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
            ${orcamento.tema_nome ? ` &bull; Tema geral: <strong>${orcamento.tema_nome}</strong>` : ''}
            ${orcamento.cor ? ` &bull; Cor: <strong>${orcamento.cor}</strong>` : ''}
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
