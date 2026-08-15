import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { parseNumeroIt, numeroIt } from "@/lib/format"
import type { EsercizioScheda, ModificaEsercizioScheda } from "@/api/schede"

export function ModificaEsercizioDialog({
  voce,
  onOpenChange,
  onSalva,
}: {
  voce: EsercizioScheda | null
  onOpenChange: (aperto: boolean) => void
  onSalva: (dati: ModificaEsercizioScheda) => void
}) {
  const [serieTarget, setSerieTarget] = useState("")
  const [repTarget, setRepTarget] = useState("")
  const [durataTarget, setDurataTarget] = useState("")
  const [pesoSuggerito, setPesoSuggerito] = useState("")
  const [timerRecupero, setTimerRecupero] = useState("")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (voce) {
      setSerieTarget(String(voce.serie_target))
      setRepTarget(voce.rep_target?.toString() ?? "")
      setDurataTarget(voce.durata_target_sec?.toString() ?? "")
      setPesoSuggerito(voce.peso_suggerito_kg ? numeroIt(voce.peso_suggerito_kg) : "")
      setTimerRecupero(voce.timer_recupero_secondi?.toString() ?? "")
      setNote(voce.note)
    }
  }, [voce])

  if (!voce) return null
  const aTempo = voce.esercizio.a_tempo

  return (
    <Dialog open={voce !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{voce.esercizio.nome}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="voce-serie">Serie</Label>
            <Input id="voce-serie" inputMode="numeric" value={serieTarget} onChange={(e) => setSerieTarget(e.target.value)} />
          </div>
          {aTempo ? (
            <div className="space-y-1.5">
              <Label htmlFor="voce-durata">Durata (sec)</Label>
              <Input id="voce-durata" inputMode="numeric" value={durataTarget} onChange={(e) => setDurataTarget(e.target.value)} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="voce-rep">Ripetizioni</Label>
              <Input id="voce-rep" inputMode="numeric" value={repTarget} onChange={(e) => setRepTarget(e.target.value)} />
            </div>
          )}
          {voce.esercizio.usa_peso && (
            <div className="space-y-1.5">
              <Label htmlFor="voce-peso">Peso suggerito (kg)</Label>
              <Input id="voce-peso" inputMode="decimal" value={pesoSuggerito} onChange={(e) => setPesoSuggerito(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="voce-timer">Timer recupero (sec)</Label>
            <Input id="voce-timer" inputMode="numeric" placeholder="default" value={timerRecupero} onChange={(e) => setTimerRecupero(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="voce-note">Note tecniche</Label>
            <Input id="voce-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={() =>
              onSalva({
                serie_target: Number(serieTarget) || voce.serie_target,
                rep_target: aTempo ? null : parseNumeroIt(repTarget),
                durata_target_sec: aTempo ? parseNumeroIt(durataTarget) : null,
                peso_suggerito_kg: parseNumeroIt(pesoSuggerito),
                timer_recupero_secondi: parseNumeroIt(timerRecupero),
                note,
              })
            }
          >
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
