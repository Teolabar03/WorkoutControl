import { useState, type FormEvent } from "react"
import { useNavigate, useParams } from "react-router-dom"
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
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { ExerciseBlock } from "@/components/sessione/ExerciseBlock"
import { RestTimer } from "@/components/sessione/RestTimer"
import { useDettaglioSessione, useTerminaSessione } from "@/hooks/useSessioneAttiva"
import { useEliminaSessione } from "@/hooks/useSessioni"
import { useRestTimer } from "@/hooks/useRestTimer"
import { useStopwatch } from "@/hooks/useStopwatch"

export function SessioneAttivaPage() {
  const { sessioneId } = useParams<{ sessioneId: string }>()
  const id = Number(sessioneId)
  const navigate = useNavigate()

  const { data } = useDettaglioSessione(id)
  const timer = useRestTimer(id)
  const termina = useTerminaSessione(id)
  const elimina = useEliminaSessione()

  const [dialogoAperto, setDialogoAperto] = useState(false)
  const [durata, setDurata] = useState("")
  const [energia, setEnergia] = useState("")
  const [sonno, setSonno] = useState("")
  const [umore, setUmore] = useState("")
  const [note, setNote] = useState("")
  const [zonaDolore, setZonaDolore] = useState("")

  const stopwatch = useStopwatch(data?.sessione.iniziata_alle ?? new Date().toISOString())

  if (!data) return null
  const { sessione, blocchi } = data

  function handleTermina(e: FormEvent) {
    e.preventDefault()
    termina.mutate(
      {
        durata_minuti: durata ? Number(durata) : null,
        energia: energia ? Number(energia) : null,
        sonno: sonno ? Number(sonno) : null,
        umore: umore ? Number(umore) : null,
        note_generali: note,
        nota_dolore: zonaDolore.trim() ? { zona_corporea: zonaDolore.trim() } : null,
      },
      {
        onSuccess: () => navigate(`/calendario/${sessione.data}`),
      }
    )
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{sessione.nome_scheda}</h1>
          <p className="font-heading text-3xl font-semibold tabular-nums text-primary">
            {stopwatch.testo}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button onClick={() => setDialogoAperto(true)}>Termina allenamento</Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                Annulla sessione
              </Button>
            }
            titolo="Eliminare questo allenamento?"
            descrizione="Tutte le serie registrate andranno perse. L'operazione non è reversibile."
            onConferma={() => elimina.mutate(id, { onSuccess: () => navigate("/calendario") })}
          />
        </div>
      </div>

      {blocchi.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Questo è un allenamento libero: non ha una scheda con esercizi predefiniti.
        </p>
      ) : (
        <div className="space-y-4">
          {blocchi.map((blocco) => (
            <ExerciseBlock
              key={blocco.voce.id}
              sessioneId={id}
              blocco={blocco}
              onSerieRegistrata={(timerSecondi) => timer.avvia(timerSecondi)}
            />
          ))}
        </div>
      )}

      <RestTimer
        visibile={timer.visibile}
        secondiRimanenti={timer.secondiRimanenti}
        finito={timer.finito}
        onFerma={timer.ferma}
        onPiuTrenta={timer.piuTrenta}
      />

      <Dialog open={dialogoAperto} onOpenChange={setDialogoAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Termina allenamento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTermina} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fine-durata">Durata (min)</Label>
              <Input
                id="fine-durata"
                inputMode="numeric"
                placeholder={`${Math.max(1, Math.round(stopwatch.trascorsiSecondi / 60))} (calcolata)`}
                value={durata}
                onChange={(e) => setDurata(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="fine-energia">Energia 1-5</Label>
                <Input id="fine-energia" inputMode="numeric" value={energia} onChange={(e) => setEnergia(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fine-sonno">Sonno 1-5</Label>
                <Input id="fine-sonno" inputMode="numeric" value={sonno} onChange={(e) => setSonno(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fine-umore">Umore 1-5</Label>
                <Input id="fine-umore" inputMode="numeric" value={umore} onChange={(e) => setUmore(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fine-note">Note generali</Label>
              <Textarea id="fine-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fine-dolore">Dolore da segnalare (facoltativo)</Label>
              <Input
                id="fine-dolore"
                placeholder="es. spalla destra"
                value={zonaDolore}
                onChange={(e) => setZonaDolore(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogoAperto(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={termina.isPending}>
                Salva e termina
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
