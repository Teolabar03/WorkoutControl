import { Link } from "react-router-dom"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SchedaCard } from "@/components/schede/SchedaCard"
import { useDuplicaScheda, useSchedeElenco } from "@/hooks/useSchede"
import { useAvviaSessione } from "@/hooks/useSessioni"

export function SchedePage() {
  const { data: schede } = useSchedeElenco()
  const avvia = useAvviaSessione()
  const duplica = useDuplicaScheda()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Schede</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/libreria">Libreria esercizi</Link>
          </Button>
          <Button asChild>
            <Link to="/schede/nuova">
              <Plus className="size-4" /> Nuova scheda
            </Link>
          </Button>
        </div>
      </div>

      {schede && schede.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nessuna scheda ancora. Creane una per iniziare a tracciare gli allenamenti.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {schede?.map((scheda) => (
          <SchedaCard
            key={scheda.id}
            scheda={scheda}
            avvioInCorso={avvia.isPending}
            onAvvia={() => avvia.mutate(scheda.id)}
            onDuplica={() => duplica.mutate(scheda.id)}
          />
        ))}
      </div>
    </div>
  )
}
