migrate(
  (app) => {
    // 1. Restaurar precificações de 'Toalha Leve de Praia' (id 'lsilkiq8w2apfre')
    // que foram invalidadas (status='desatualizada') indevidamente às 00:48:23 de 14/10/2026
    // após gravação de apelidos de SKU
    const idsParaRestaurar = ['lttlofqh4njpuj4', 'qntaxaei058jibs', 'fd9dejd899fm75l']
    for (const precId of idsParaRestaurar) {
      try {
        const prec = app.findRecordById('prec_precificacoes', precId)
        if (prec && prec.get('status') === 'desatualizada') {
          prec.set('status', 'aprovada')
          app.save(prec)
        }
      } catch (e) {
        console.log('Erro ao restaurar precificação ' + precId + ': ' + e)
      }
    }

    // 2. Corrigir sku_por_canal do produto 'lsilkiq8w2apfre':
    // Atualmente gravado como [{'canal':'nnnk28chx9llzmm','sku_externo':'B122, B197'}]
    // Separar em duas entradas individuais com trim: B122 e B197
    try {
      const prod = app.findRecordById('prec_produtos', 'lsilkiq8w2apfre')
      if (prod) {
        const skuPorCanalRaw = prod.get('sku_por_canal')
        let lista = []
        if (typeof skuPorCanalRaw === 'string') {
          try {
            lista = JSON.parse(skuPorCanalRaw)
          } catch {
            lista = []
          }
        } else if (Array.isArray(skuPorCanalRaw)) {
          lista = skuPorCanalRaw
        }

        const novaLista = []
        const vistos = new Set()

        for (const item of lista) {
          if (!item) continue
          const canal = item.canal || 'todos'
          const skuExterno = String(item.sku_externo || '')
          // Divide por vírgula, ponto-e-vírgula ou espaço
          const partes = skuExterno
            .split(/[,;\s]+/)
            .map((s) => s.trim())
            .filter(Boolean)

          if (partes.length === 0) continue

          for (const p of partes) {
            const chave = canal.toLowerCase() + '::' + p.toLowerCase()
            if (!vistos.has(chave)) {
              vistos.add(chave)
              novaLista.push({ canal, sku_externo: p })
            }
          }
        }

        prod.set('sku_por_canal', novaLista)
        app.save(prod)
      }
    } catch (e) {
      console.log('Erro ao normalizar sku_por_canal de lsilkiq8w2apfre: ' + e)
    }
  },
  (app) => {
    // Reverter restauração se necessário
    const idsParaReverter = ['lttlofqh4njpuj4', 'qntaxaei058jibs', 'fd9dejd899fm75l']
    for (const precId of idsParaReverter) {
      try {
        const prec = app.findRecordById('prec_precificacoes', precId)
        if (prec) {
          prec.set('status', 'desatualizada')
          app.save(prec)
        }
      } catch (e) {
        console.log('Erro ao reverter precificação ' + precId + ': ' + e)
      }
    }
  },
)
