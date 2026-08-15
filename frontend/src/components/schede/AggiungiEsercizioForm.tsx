import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLibreria } from "@/hooks/useSchede"
import type { NuovoEsercizioScheda } from "@/api/schede"

export function AggiungiEsercizioForm({
  esclusi,
  onAggiungi,
  inCorso,
}: {
  /** id già presenti nella scheda: filtrati dal picker per evitare doppioni. */
  esclusi: Set<number>
  onAggiungi: (dati: NuovoEsercizioScheda) => void
  inCorso?: boolean
}) {
  const { data: libreria } = useLibreria({ archiviato: false })
  const [esercizioId, setEsercizioId] = useState("")
  const [serieTarget, setSerieTarget] = useState("4")

  const disponibili = libreria?.filter((e) => !esclusi.has(e.id)) ?? []

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!esercizioId) return
    onAggiungi({ esercizio_libreria_id: Number(esercizioId), serie_target: Number(serieTarget) || 4 })
    setEsercizioId("")
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 pt-2">
      <div className="min-w-[200px] flex-1">
        <Select value={esercizioId} onValueChange={setEsercizioId}>
          <SelectTrigger className="w-full" aria-label="Scegli esercizio da aggiungere">
            <SelectValue placeholder="Aggiungi esercizio dalla libreria…" />
          </SelectTrigger>
          <SelectContent>
            {disponibili.map((e) => (
              <SelectItem key={e.id} value={e.id.toString()}>
                {e.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input
        className="w-20"
        inputMode="numeric"
        aria-label="Serie"
        value={serieTarget}
        onChange={(e) => setSerieTarget(e.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={!esercizioId || inCorso}>
        Aggiungi
      </Button>
    </form>
  )
}
