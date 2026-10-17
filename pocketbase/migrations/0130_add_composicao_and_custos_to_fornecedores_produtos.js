migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('fornecedores_produtos')

    // 1. Campo 'composicao' (JSON) para linhas analíticas de custos/insumos
    if (!col.fields.getByName('composicao')) {
      col.fields.add(
        new JSONField({
          name: 'composicao',
          maxSize: 5242880,
        }),
      )
    }

    // 2. Campo 'custo_adicional_embalagem' (Number)
    if (!col.fields.getByName('custo_adicional_embalagem')) {
      col.fields.add(
        new NumberField({
          name: 'custo_adicional_embalagem',
          min: 0,
        }),
      )
    }

    // 3. Campo 'custo_etiqueta' (Number)
    if (!col.fields.getByName('custo_etiqueta')) {
      col.fields.add(
        new NumberField({
          name: 'custo_etiqueta',
          min: 0,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('fornecedores_produtos')
    if (col.fields.getByName('composicao')) {
      col.fields.removeByName('composicao')
    }
    if (col.fields.getByName('custo_adicional_embalagem')) {
      col.fields.removeByName('custo_adicional_embalagem')
    }
    if (col.fields.getByName('custo_etiqueta')) {
      col.fields.removeByName('custo_etiqueta')
    }
    app.save(col)
  },
)
