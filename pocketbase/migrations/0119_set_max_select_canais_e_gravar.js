migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('orcamentos')
    const field = col.fields.getByName('canais_comparados')
    // PocketBase RelationField tem a propriedade maxSelect
    // Se maxSelect for 1, o PocketBase converte o array para um único ID string ao salvar!
    // Para aceitar múltiplos IDs, maxSelect DEVE ser > 1 (ex: 20 ou 99)
    field.maxSelect = 20
    app.save(col)

    // Agora grava os canais como array nos registros existentes
    const rec1 = app.findRecordById('orcamentos', 'ku62nblv0yg1bvi')
    rec1.set('canais_comparados', ['nnnk28chx9llzmm', 'ixleboajfvbhbyy'])
    app.save(rec1)

    const rec2 = app.findRecordById('orcamentos', '4qgwnkfbuasncvh')
    rec2.set('canais_comparados', ['nnnk28chx9llzmm', 'ixleboajfvbhbyy'])
    app.save(rec2)
  },
  (app) => {},
)
