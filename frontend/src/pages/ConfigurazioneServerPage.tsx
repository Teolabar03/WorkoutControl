import { useState, type FormEvent } from "react"
import { Dumbbell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { normalizzaOrigin, provaOrigin, salvaOrigin } from "@/lib/server"

/** Primo avvio dell'app: a quale server parlare.
 *
 *  Compare solo dentro l'APK e solo finche' un indirizzo non e' stato scelto.
 *  Da browser non si vede mai, perche' li' l'API sta sullo stesso host che ha
 *  servito la pagina.
 *
 *  L'indirizzo viene provato prima di essere salvato: uno sbagliato spesso
 *  risponde lo stesso (e' semplicemente un altro sito) e salvarlo lascerebbe
 *  l'utente con errori incomprensibili su ogni schermata, senza un punto ovvio
 *  in cui rimediare.
 */
export function ConfigurazioneServerPage({
  origineIniziale = "",
  onSalvato,
  onAnnulla,
}: {
  origineIniziale?: string
  onSalvato: (origin: string) => void
  onAnnulla?: () => void
}) {
  const [indirizzo, setIndirizzo] = useState(origineIniziale)
  const [errore, setErrore] = useState("")
  const [verifica, setVerifica] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrore("")

    const origin = normalizzaOrigin(indirizzo)
    if (!origin) {
      setErrore("Indirizzo non valido. Dev'essere in https, che Android pretende.")
      return
    }

    setVerifica(true)
    const problema = await provaOrigin(origin)
    setVerifica(false)
    if (problema) {
      setErrore(problema)
      return
    }

    salvaOrigin(origin)
    onSalvato(origin)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-card p-6"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Dumbbell className="size-8 text-primary" aria-hidden="true" />
          <h1 className="font-heading text-xl font-semibold">WorkoutTracker</h1>
          <p className="text-sm text-muted-foreground">
            Indica dove gira la tua installazione. Te lo chiede una volta sola.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="server-indirizzo">Indirizzo del server</Label>
          <Input
            id="server-indirizzo"
            autoFocus
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://esempio.it/workout"
            value={indirizzo}
            onChange={(e) => setIndirizzo(e.target.value)}
            aria-invalid={Boolean(errore)}
          />
          <p className="text-sm text-muted-foreground">
            Lo stesso che apriresti dal browser, senza <code>/api</code> finale. Se l'app sta sotto un
            prefisso, includilo.
          </p>
        </div>

        {errore && <p className="text-sm text-destructive">{errore}</p>}

        <Button type="submit" className="w-full" disabled={verifica || !indirizzo.trim()}>
          {verifica ? "Verifica..." : "Verifica e salva"}
        </Button>

        {onAnnulla && (
          <Button type="button" variant="ghost" className="w-full" onClick={onAnnulla}>
            Annulla
          </Button>
        )}
      </form>
    </div>
  )
}
