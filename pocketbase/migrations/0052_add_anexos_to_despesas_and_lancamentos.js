migrate(
  (app) => {
    // 1. Campo de anexo da conta a pagar (boleto, fatura, foto da conta) no compromisso
    try {
      const colComp = app.findCollectionByNameOrId('despesas_compromisso')
      if (!colComp.fields.getByName('anexo_conta')) {
        colComp.fields.add(
          new FileField({
            name: 'anexo_conta',
            type: 'file',
            maxSelect: 1,
            maxSize: 15728640, // 15MB
            mimeTypes: [
              'image/jpeg',
              'image/png',
              'image/webp',
              'image/gif',
              'image/heic',
              'image/heif',
              'application/pdf',
            ],
          }),
        )
        app.save(colComp)
      }
    } catch (e) {
      console.log('Erro ao adicionar anexo_conta em despesas_compromisso:', e)
    }

    // 2. Campo de comprovante de pagamento na ocorrência (quando é dada a baixa)
    try {
      const colOcorr = app.findCollectionByNameOrId('despesas_ocorrencias')
      if (!colOcorr.fields.getByName('comprovante_pagamento')) {
        colOcorr.fields.add(
          new FileField({
            name: 'comprovante_pagamento',
            type: 'file',
            maxSelect: 1,
            maxSize: 15728640, // 15MB
            mimeTypes: [
              'image/jpeg',
              'image/png',
              'image/webp',
              'image/gif',
              'image/heic',
              'image/heif',
              'application/pdf',
            ],
          }),
        )
        app.save(colOcorr)
      }
    } catch (e) {
      console.log('Erro ao adicionar comprovante_pagamento em despesas_ocorrencias:', e)
    }

    // 3. Campo de comprovante no lançamento financeiro gerado pela baixa (se aplicável)
    try {
      const colLanc = app.findCollectionByNameOrId('lancamentos')
      if (!colLanc.fields.getByName('comprovante')) {
        colLanc.fields.add(
          new FileField({
            name: 'comprovante',
            type: 'file',
            maxSelect: 1,
            maxSize: 15728640, // 15MB
            mimeTypes: [
              'image/jpeg',
              'image/png',
              'image/webp',
              'image/gif',
              'image/heic',
              'image/heif',
              'application/pdf',
            ],
          }),
        )
        app.save(colLanc)
      }
    } catch (e) {
      console.log('Erro ao adicionar comprovante em lancamentos:', e)
    }
  },
  (app) => {
    try {
      const colComp = app.findCollectionByNameOrId('despesas_compromisso')
      if (colComp.fields.getByName('anexo_conta')) {
        colComp.fields.removeByName('anexo_conta')
        app.save(colComp)
      }
    } catch (_) {}

    try {
      const colOcorr = app.findCollectionByNameOrId('despesas_ocorrencias')
      if (colOcorr.fields.getByName('comprovante_pagamento')) {
        colOcorr.fields.removeByName('comprovante_pagamento')
        app.save(colOcorr)
      }
    } catch (_) {}

    try {
      const colLanc = app.findCollectionByNameOrId('lancamentos')
      if (colLanc.fields.getByName('comprovante')) {
        colLanc.fields.removeByName('comprovante')
        app.save(colLanc)
      }
    } catch (_) {}
  },
)
