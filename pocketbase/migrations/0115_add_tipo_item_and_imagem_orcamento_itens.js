migrate(
  (app) => {
    const itensCol = app.findCollectionByNameOrId('orcamento_itens')

    // 1. tipo_item: 'cadastrado' | 'personalizado'
    if (!itensCol.fields.getByName('tipo_item')) {
      itensCol.fields.add(
        new SelectField({
          name: 'tipo_item',
          required: false,
          values: ['cadastrado', 'personalizado'],
          maxSelect: 1,
        }),
      )
    }

    // 2. descricao: texto livre para itens personalizados ou detalhes adicionais
    if (!itensCol.fields.getByName('descricao')) {
      itensCol.fields.add(
        new TextField({
          name: 'descricao',
          required: false,
        }),
      )
    }

    // 3. imagem_anexo: upload de imagem direta por item (personalizado ou anexo)
    if (!itensCol.fields.getByName('imagem_anexo')) {
      itensCol.fields.add(
        new FileField({
          name: 'imagem_anexo',
          required: false,
          maxSelect: 1,
          maxSize: 15728640, // 15MB
          mimeTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/heic',
            'image/heif',
          ],
        }),
      )
    }

    // 4. foto_url: fallback/compatibilidade para armazenar URL ou prévia caso necessário
    if (!itensCol.fields.getByName('foto_url')) {
      itensCol.fields.add(
        new TextField({
          name: 'foto_url',
          required: false,
        }),
      )
    }

    app.save(itensCol)

    // 5. Migração de itens existentes:
    // Itens existentes viram 'cadastrado'
    app
      .db()
      .newQuery(`
        UPDATE orcamento_itens
        SET tipo_item = 'cadastrado'
        WHERE tipo_item IS NULL OR tipo_item = ''
      `)
      .execute()
  },
  (app) => {
    try {
      const itensCol = app.findCollectionByNameOrId('orcamento_itens')
      itensCol.fields.removeByName('tipo_item')
      itensCol.fields.removeByName('descricao')
      itensCol.fields.removeByName('imagem_anexo')
      itensCol.fields.removeByName('foto_url')
      app.save(itensCol)
    } catch (_) {}
  },
)
