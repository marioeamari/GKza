/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const itensCol = app.findCollectionByNameOrId('orcamento_itens')

    // 1. Adicionar campo 'composicao' (json) em orcamento_itens se não existir
    if (!itensCol.fields.getByName('composicao')) {
      itensCol.fields.add(
        new JSONField({
          name: 'composicao',
          required: false,
          maxSize: 2000000,
        }),
      )
      app.save(itensCol)
    }

    // 2. Migrar itens existentes:
    // Para cada item atual onde 'composicao' é nulo ou vazio, cria a composição inicial baseada
    // nos dados do modelo/tema/quantidade já presentes no registro.
    try {
      const itensExistentes = app.findRecordsByFilter(
        'orcamento_itens',
        'composicao = null || composicao = "" || composicao = "[]"',
        'created',
        500,
        0,
      )
      for (const item of itensExistentes) {
        const modeloId = item.get('modelo') || ''
        const modeloNome = item.get('modelo_nome') || 'Item'
        const modeloCodigo = item.get('modelo_codigo') || ''
        const temaId = item.get('tema') || ''
        const temaNome = item.get('tema_nome') || ''
        const cor = item.get('cor') || ''
        const quantidade = Number(item.get('quantidade')) || 1
        const fotoUrl = item.get('foto_url') || ''
        const imagemAnexo = item.get('imagem_anexo') || ''
        const tipoItem = item.get('tipo_item') || 'cadastrado'

        const entradaComposicao = {
          id: 'comp_' + Math.random().toString(36).substring(2, 9),
          tipo:
            tipoItem === 'personalizado'
              ? 'personalizado'
              : temaId || modeloId
                ? 'cadastrado'
                : 'cadastrado',
          tema: temaId || undefined,
          tema_nome: temaNome || undefined,
          modelo: modeloId || undefined,
          modelo_nome: modeloNome,
          modelo_codigo: modeloCodigo || undefined,
          descricao: item.get('descricao') || undefined,
          foto_url: fotoUrl || undefined,
          imagem_anexo: imagemAnexo || undefined,
          cor: cor || undefined,
          quantidade: quantidade,
        }

        item.set('composicao', JSON.stringify([entradaComposicao]))
        app.save(item)
      }
    } catch (err) {
      console.log('Aviso ao migrar composicao de itens existentes:', err)
    }
  },
  (app) => {
    const itensCol = app.findCollectionByNameOrId('orcamento_itens')
    if (itensCol.fields.getByName('composicao')) {
      itensCol.fields.removeByName('composicao')
      app.save(itensCol)
    }
  },
)
