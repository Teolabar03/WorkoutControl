import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useImpostazioni, useModificaImpostazioni } from "@/hooks/useImpostazioni"
import { etichettaRange, rangeObiettivo } from "@/lib/obiettivi"

/** Gli obiettivi giornalieri: stesse chiavi lato API, etichette per l'interfaccia. */
const TARGET = [
  { chiave: "target_kcal", etichetta: "Calorie (kcal)", unita: "kcal" },
  { chiave: "target_proteine_g", etichetta: "Proteine (g)", unita: "g" },
  { chiave: "target_carboidrati_g", etichetta: "Carboidrati (g)", unita: "g" },
  { chiave: "target_grassi_g", etichetta: "Grassi (g)", unita: "g" },
  { chiave: "target_sonno_minuti", etichetta: "Sonno (minuti)", unita: "min" },
] as const

const TOLLERANZA = "target_tolleranza_pct"

type ChiaveTarget = (typeof TARGET)[number]["chiave"] | typeof TOLLERANZA

/** Obiettivi giornalieri, sempre visibili in Impostazioni.
 *
 * Stanno qui e non nel pannello Samsung Health, con cui non c'entrano: sono
 * valori scelti a mano, e ha senso poterli fissare anche prima che arrivi il
 * primo dato — o se i pasti arrivano solo dall'export.
 */
export function ObiettiviCard() {
  const { data: impostazioni } = useImpostazioni()
  const modifica = useModificaImpostazioni()
  const [valori, setValori] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!impostazioni) return
    // Zero vuol dire "nessun obiettivo": il campo resta vuoto, non a "0".
    setValori({
      ...Object.fromEntries(
        TARGET.map(({ chiave }) => [chiave, impostazioni[chiave] ? String(impostazioni[chiave]) : ""])
      ),
      // La tolleranza non segue la regola "0 = non impostato": zero è una
      // scelta legittima (nessuna tolleranza) e il campo la deve mostrare.
      [TOLLERANZA]: String(impostazioni[TOLLERANZA] ?? 0),
    })
  }, [impostazioni])

  function salva(e: FormEvent) {
    e.preventDefault()
    const dati: Partial<Record<ChiaveTarget, number>> = {}
    for (const { chiave } of TARGET) dati[chiave] = Math.round(Number(valori[chiave] || 0))
    dati[TOLLERANZA] = Math.round(Number(valori[TOLLERANZA] || 0))
    modifica.mutate(dati)
  }

  return (
    <form onSubmit={salva} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Obiettivi giornalieri</h2>
        <p className="text-sm text-muted-foreground">
          Mostrati come traguardo nella sezione Nutrizione e come fascia di riferimento nei
          grafici. Lascia vuoti quelli che non ti interessano.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {TARGET.map(({ chiave, etichetta, unita }) => {
          // L'anteprima si calcola su quello che c'è nei campi adesso, non su
          // quello che è salvato: così si vede l'effetto della tolleranza
          // mentre la si cambia, senza dover salvare per scoprirlo.
          const range = rangeObiettivo(
            Number(valori[chiave] || 0),
            Number(valori[TOLLERANZA] || 0)
          )
          return (
            <div key={chiave} className="space-y-1.5">
              <Label htmlFor={`target-${chiave}`}>{etichetta}</Label>
              <Input
                id={`target-${chiave}`}
                inputMode="numeric"
                value={valori[chiave] ?? ""}
                onChange={(e) => setValori((v) => ({ ...v, [chiave]: e.target.value }))}
              />
              <p className="text-xs tabular-nums text-muted-foreground">
                {range ? etichettaRange(range, unita) : "—"}
              </p>
            </div>
          )
        })}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="target-tolleranza">Tolleranza (%)</Label>
        <Input
          id="target-tolleranza"
          inputMode="numeric"
          className="max-w-28"
          value={valori[TOLLERANZA] ?? ""}
          onChange={(e) => setValori((v) => ({ ...v, [TOLLERANZA]: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          Di quanto puoi scostarti restando &laquo;in linea&raquo;. Con 10 su un obiettivo di
          2300 kcal, va bene qualunque giornata fra 2070 e 2530. Metti 0 per pretendere il
          valore esatto.
        </p>
      </div>
      <Button type="submit" disabled={modifica.isPending}>
        Salva obiettivi
      </Button>
    </form>
  )
}
