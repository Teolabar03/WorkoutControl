import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useImpostazioni, useModificaImpostazioni } from "@/hooks/useImpostazioni"

/** Gli obiettivi giornalieri: stesse chiavi lato API, etichette per l'interfaccia. */
const TARGET = [
  { chiave: "target_kcal", etichetta: "Calorie (kcal)" },
  { chiave: "target_proteine_g", etichetta: "Proteine (g)" },
  { chiave: "target_carboidrati_g", etichetta: "Carboidrati (g)" },
  { chiave: "target_grassi_g", etichetta: "Grassi (g)" },
  { chiave: "target_sonno_minuti", etichetta: "Sonno (minuti)" },
] as const

type ChiaveTarget = (typeof TARGET)[number]["chiave"]

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
    setValori(
      Object.fromEntries(
        TARGET.map(({ chiave }) => [chiave, impostazioni[chiave] ? String(impostazioni[chiave]) : ""])
      )
    )
  }, [impostazioni])

  function salva(e: FormEvent) {
    e.preventDefault()
    const dati: Partial<Record<ChiaveTarget, number>> = {}
    for (const { chiave } of TARGET) dati[chiave] = Math.round(Number(valori[chiave] || 0))
    modifica.mutate(dati)
  }

  return (
    <form onSubmit={salva} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Obiettivi giornalieri</h2>
        <p className="text-sm text-muted-foreground">
          Mostrati come traguardo nella sezione Nutrizione e come linea di riferimento nei grafici.
          Lascia vuoti quelli che non ti interessano.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {TARGET.map(({ chiave, etichetta }) => (
          <div key={chiave} className="space-y-1.5">
            <Label htmlFor={`target-${chiave}`}>{etichetta}</Label>
            <Input
              id={`target-${chiave}`}
              inputMode="numeric"
              value={valori[chiave] ?? ""}
              onChange={(e) => setValori((v) => ({ ...v, [chiave]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <Button type="submit" disabled={modifica.isPending}>
        Salva obiettivi
      </Button>
    </form>
  )
}
