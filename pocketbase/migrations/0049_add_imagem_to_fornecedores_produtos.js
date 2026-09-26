migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('fornecedores_produtos')
      if (!col.fields.getByName('imagem')) {
        col.fields.add(
          new FileField({
            name: 'imagem',
            type: 'file',
            maxSelect: 1,
            maxSize: 5242880, // 5MB
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
          }),
        )
        app.save(col)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('fornecedores_produtos')
      if (col.fields.getByName('imagem')) {
        col.fields.removeByName('imagem')
        app.save(col)
      }
    } catch (_) {}
  },
)
