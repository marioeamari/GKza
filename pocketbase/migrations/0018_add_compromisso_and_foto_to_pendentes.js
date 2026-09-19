/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const pendentesCol = app.findCollectionByNameOrId('telegram_registros_pendentes')
    const compromissosCol = app.findCollectionByNameOrId('despesas_compromisso')

    // 1. Campo de relação compromisso_gerado
    if (!pendentesCol.fields.getByName('compromisso_gerado')) {
      pendentesCol.fields.add(
        new RelationField({
          name: 'compromisso_gerado',
          type: 'relation',
          collectionId: compromissosCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    // 2. Campo de arquivo comprovante_foto (se vier foto ou anexo)
    if (!pendentesCol.fields.getByName('comprovante_foto')) {
      pendentesCol.fields.add(
        new FileField({
          name: 'comprovante_foto',
          type: 'file',
          maxSelect: 1,
          maxSize: 10485760, // 10MB
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        }),
      )
    }

    // 3. Campo comprovante_foto_url (caso tenhamos URL direta do Telegram ou externa)
    if (!pendentesCol.fields.getByName('comprovante_foto_url')) {
      pendentesCol.fields.add(
        new TextField({
          name: 'comprovante_foto_url',
          type: 'text',
          required: false,
        }),
      )
    }

    app.save(pendentesCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('telegram_registros_pendentes')
      col.fields.removeByName('compromisso_gerado')
      col.fields.removeByName('comprovante_foto')
      col.fields.removeByName('comprovante_foto_url')
      app.save(col)
    } catch (_) {}
  },
)
