import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Pencil, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SortableEsercizioRow } from "@/components/schede/SortableEsercizioRow"
import { AggiungiEsercizioForm } from "@/components/schede/AggiungiEsercizioForm"
import { ModificaEsercizioDialog } from "@/components/schede/ModificaEsercizioDialog"
import {
  useAggiungiEsercizio,
  useModificaEsercizioScheda,
  useRiordinaEsercizi,
  useRimuoviEsercizioScheda,
  useScheda,
} from "@/hooks/useSchede"
import { useAvviaSessione } from "@/hooks/useSessioni"
import type { EsercizioScheda } from "@/api/schede"

export function SchedaDettaglioPage() {
  const { schedaId } = useParams<{ schedaId: string }>()
  const id = Number(schedaId)
  const navigate = useNavigate()

  const { data: scheda } = useScheda(id)
  const avvia = useAvviaSessione()
  const aggiungi = useAggiungiEsercizio(id)
  const riordina = useRiordinaEsercizi(id)
  const modificaEsercizio = useModificaEsercizioScheda(id)
  const rimuovi = useRimuoviEsercizioScheda(id)

  const [inModifica, setInModifica] = useState<EsercizioScheda | null>(null)
  const [ordineOttimistico, setOrdineOttimistico] = useState<EsercizioScheda[] | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  if (!scheda) return null

  const esercizi = ordineOttimistico ?? scheda.esercizi ?? []

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !scheda?.esercizi) return

    const indiceAttivo = scheda.esercizi.findIndex((v) => v.id === active.id)
    const indiceSopra = scheda.esercizi.findIndex((v) => v.id === over.id)
    const nuovoOrdine = arrayMove(scheda.esercizi, indiceAttivo, indiceSopra)

    setOrdineOttimistico(nuovoOrdine)
    riordina.mutate(
      nuovoOrdine.map((v) => v.id),
      { onSettled: () => setOrdineOttimistico(null) }
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold">{scheda.nome}</h1>
            {!scheda.attiva && <Badge variant="outline">Archiviata</Badge>}
          </div>
          {scheda.obiettivo && <Badge variant="secondary" className="mt-1">{scheda.obiettivo}</Badge>}
          {scheda.descrizione && <p className="mt-2 max-w-prose text-sm text-muted-foreground">{scheda.descrizione}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/schede/${id}/modifica`)}>
            <Pencil className="size-4" /> Modifica
          </Button>
          <Button onClick={() => avvia.mutate(id)} disabled={avvia.isPending}>
            <Play className="size-4" /> Avvia
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 font-heading text-lg font-semibold">Esercizi</h2>

        {esercizi.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nessun esercizio ancora: aggiungine uno dalla libreria qui sotto.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={esercizi.map((v) => v.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {esercizi.map((voce) => (
                  <SortableEsercizioRow
                    key={voce.id}
                    voce={voce}
                    onModifica={() => setInModifica(voce)}
                    onRimuovi={() => rimuovi.mutate(voce.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <AggiungiEsercizioForm
          esclusi={new Set(esercizi.map((v) => v.esercizio.id))}
          inCorso={aggiungi.isPending}
          onAggiungi={(dati) => aggiungi.mutate(dati)}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Non trovi l'esercizio che cerchi?{" "}
        <Link to="/libreria" className="text-primary hover:underline">
          Aggiungilo alla libreria
        </Link>
        .
      </p>

      <ModificaEsercizioDialog
        voce={inModifica}
        onOpenChange={(aperto) => !aperto && setInModifica(null)}
        onSalva={(dati) => {
          if (!inModifica) return
          modificaEsercizio.mutate(
            { voceId: inModifica.id, dati },
            { onSuccess: () => setInModifica(null) }
          )
        }}
      />
    </div>
  )
}
