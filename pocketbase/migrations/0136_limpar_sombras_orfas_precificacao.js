/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // =========================================================================
    // 0136: Limpeza idempotente de sombras órfãs em prec_produtos
    // Regra:
    // - Qualquer registro em 'prec_produtos' com origem_id preenchido cuja
    //   entidade não exista mais em 'produtos' é uma sombra órfã de produto composto excluído.
    // - Se a sombra possuir cenários de precificação aprovados ou vínculos de canal,
    //   ela é desativada (status='inativo') para preservar o histórico e links caso seja recriada.
    // - Se não possuir cenários aprovados nem vínculos, ela é removida (incluindo 'R-Folha').
    // - O produto base em 'produtos_base' (ex: 'Rosto Folha' revenda) permanece 100% intacto.
    // - Produtos vivos em 'produtos' permanecem 100% intactos.
    // =========================================================================
    try {
      const precs = app.findRecordsByFilter('prec_produtos', "origem_id != ''", '', 5000, 0)
      let removidos = 0
      let desativados = 0

      for (let i = 0; i < precs.length; i++) {
        const prec = precs[i]
        const origemId = prec.getString('origem_id')
        if (!origemId) continue

        let prodVivo = null
        try {
          prodVivo = app.findRecordById('produtos', origemId)
        } catch (_) {
          prodVivo = null
        }

        // Se o produto composto não existe mais em 'produtos', é uma sombra órfã
        if (!prodVivo) {
          // 1. Checar cenários de precificação aprovados
          let temAprovados = false
          try {
            const precificacoes = app.findRecordsByFilter(
              'prec_precificacoes',
              "produto = '" + prec.id + "'",
              '',
              100,
              0,
            )
            for (let j = 0; j < precificacoes.length; j++) {
              const p = precificacoes[j]
              if (p.getString('status') === 'aprovada' || p.getFloat('preco_aprovado') > 0) {
                temAprovados = true
                break
              }
            }
          } catch (_) {}

          // 2. Checar vínculos de canal na matriz
          let temMatriz = false
          try {
            const mats = app.findRecordsByFilter(
              'prec_matriz_classificacoes',
              "produto = '" + prec.id + "'",
              '',
              10,
              0,
            )
            if (mats && mats.length > 0) {
              temMatriz = true
            }
          } catch (_) {}

          if (temAprovados || temMatriz) {
            // Preservar vínculos desativando
            if (prec.getString('status') !== 'inativo') {
              prec.set('status', 'inativo')
              app.save(prec)
              desativados++
            }
          } else {
            // Sem vínculos nem cenários: remoção completa da sombra
            app.delete(prec)
            removidos++
          }
        }
      }

      console.log(
        '0136_limpar_sombras_orfas_precificacao concluída com sucesso: ' +
          removidos +
          ' removidos, ' +
          desativados +
          ' desativados.',
      )
    } catch (e) {
      console.warn('0136_limpar_sombras_orfas_precificacao aviso:', e)
    }
  },
  () => {
    // Migração de limpeza não requer rollback estrutural
  },
)
