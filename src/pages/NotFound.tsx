import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
          <SearchX className="h-8 w-8" />
        </span>
        <p className="micro-label mt-6">Erro 404</p>
        <h1 className="mt-2 text-3xl font-extrabold">Página não encontrada</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          O endereço pode ter mudado ou não existe.
        </p>
        <Button asChild className="mt-7">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao início
          </Link>
        </Button>
      </div>
    </main>
  )
}
