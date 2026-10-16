import { useState, useEffect } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, ChevronsUpDown, Plus, Settings } from 'lucide-react'
import { precificacaoService } from '@/services/precificacao'
import { PrecCategoriaProdutoRecord } from '@/types/precificacao'
import { CategoriasProdutoDialog } from '@/components/precificacao/CategoriasProdutoDialog'

interface CategoriaAutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  permitirGerenciar?: boolean
}

export function CategoriaAutocompleteInput({
  value,
  onChange,
  placeholder = 'Selecione ou digite a categoria...',
  className = '',
  permitirGerenciar = true,
}: CategoriaAutocompleteInputProps) {
  const [open, setOpen] = useState(false)
  const [categorias, setCategorias] = useState<PrecCategoriaProdutoRecord[]>([])
  const [busca, setBusca] = useState('')
  const [dialogGerenciarAberto, setDialogGerenciarAberto] = useState(false)

  const carregarCategorias = async () => {
    try {
      const lista = await precificacaoService.listCategoriasProduto(true)
      setCategorias(lista)
    } catch {
      // fallback gracioso
    }
  }

  useEffect(() => {
    carregarCategorias()
  }, [])

  const filtradas = categorias.filter((c) =>
    c.nome.toLowerCase().includes(busca.toLowerCase().trim()),
  )

  const existeExata = categorias.some((c) => c.nome.toLowerCase() === busca.toLowerCase().trim())

  const categoriaAtualObj = categorias.find(
    (c) => c.nome.toLowerCase() === (value || '').toLowerCase().trim(),
  )

  const handleSelect = (nomeEscolhido: string) => {
    onChange(nomeEscolhido)
    setOpen(false)
    setBusca('')
  }

  const handleCriarNovaRapida = () => {
    if (!busca.trim()) return
    const nomeNovo = busca.trim()
    onChange(nomeNovo)
    setOpen(false)
    setBusca('')
    // Cadastrar em background na coleção oficial
    precificacaoService
      .createCategoriaProduto({ nome: nomeNovo, ordem: 99, ativo: true })
      .then(() => carregarCategorias())
      .catch(() => {})
  }

  return (
    <div className={`relative flex items-center gap-1.5 ${className}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal h-8 text-xs bg-white px-2.5"
          >
            <div className="flex items-center gap-2 truncate">
              {categoriaAtualObj?.cor && (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: categoriaAtualObj.cor }}
                />
              )}
              <span
                className={value ? 'text-foreground font-medium truncate' : 'text-muted-foreground'}
              >
                {value || placeholder}
              </span>
            </div>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[280px] p-2 text-xs" align="start">
          <div className="space-y-2">
            <Input
              placeholder="Buscar ou digitar categoria..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-7 text-xs"
              autoFocus
            />

            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filtradas.length === 0 && !busca.trim() && (
                <p className="text-[11px] text-muted-foreground text-center py-2">
                  Nenhuma categoria cadastrada.
                </p>
              )}

              {filtradas.map((cat) => {
                const isSelected = value?.toLowerCase() === cat.nome.toLowerCase()
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelect(cat.nome)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors text-xs ${
                      isSelected
                        ? 'bg-primary/10 text-primary font-bold'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: cat.cor || '#0284C7' }}
                      />
                      <span className="truncate">{cat.nome}</span>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                )
              })}

              {busca.trim() && !existeExata && (
                <button
                  type="button"
                  onClick={handleCriarNovaRapida}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-primary hover:bg-primary/10 text-xs font-semibold border-t border-border mt-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Usar &quot;{busca.trim()}&quot;</span>
                </button>
              )}
            </div>

            {value && (
              <div className="pt-1 border-t border-border flex justify-end">
                <button
                  type="button"
                  onClick={() => handleSelect('')}
                  className="text-[10px] text-muted-foreground hover:text-destructive underline"
                >
                  Limpar categoria
                </button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {permitirGerenciar && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => setDialogGerenciarAberto(true)}
          title="Gerenciar lista de categorias"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      )}

      {dialogGerenciarAberto && (
        <CategoriasProdutoDialog
          open={dialogGerenciarAberto}
          onOpenChange={setDialogGerenciarAberto}
          onCategoriaUpdated={carregarCategorias}
        />
      )}
    </div>
  )
}
