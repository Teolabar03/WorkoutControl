import { Link } from "react-router-dom"
import { Copy, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Scheda } from "@/api/schede"

export function SchedaCard({
  scheda,
  onAvvia,
  onDuplica,
  avvioInCorso,
}: {
  scheda: Scheda
  onAvvia: () => void
  onDuplica: () => void
  avvioInCorso?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/schede/${scheda.id}`} className="font-heading text-lg font-semibold hover:underline">
          {scheda.nome}
        </Link>
        {!scheda.attiva && <Badge variant="outline">Archiviata</Badge>}
      </div>

      {scheda.obiettivo && <Badge variant="secondary" className="w-fit">{scheda.obiettivo}</Badge>}

      {scheda.descrizione && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{scheda.descrizione}</p>
      )}

      <p className="text-xs text-muted-foreground">
        {scheda.n_esercizi} esercizi · {scheda.n_allenamenti} allenamenti svolti
      </p>

      <div className="mt-auto flex gap-2 pt-1">
        <Button size="sm" onClick={onAvvia} disabled={avvioInCorso} className="flex-1">
          <Play className="size-4" /> Avvia
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to={`/schede/${scheda.id}`}>Apri</Link>
        </Button>
        <Button size="sm" variant="outline" onClick={onDuplica} aria-label="Duplica scheda">
          <Copy className="size-4" />
        </Button>
      </div>
    </div>
  )
}
