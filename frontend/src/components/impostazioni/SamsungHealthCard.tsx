import { useEffect, useState, type FormEvent } from "react"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { dataIt } from "@/lib/format"
import { useImpostazioni, useModificaImpostazioni } from "@/hooks/useImpostazioni"
import { useStatoSalute } from "@/hooks/useSalute"

/** I target giornalieri: stesse chiavi lato API, etichette per l'interfaccia. */
const TARGET = [
  { chiave: "target_kcal", etichetta: "Calorie (kcal)" },
  { chiave: "target_proteine_g", etichetta: "Proteine (g)" },
  { chiave: "target_carboidrati_g", etichetta: "Carboidrati (g)" },
  { chiave: "target_grassi_g", etichetta: "Grassi (g)" },
  { chiave: "target_sonno_minuti", etichetta: "Sonno (minuti)" },
] as const

type ChiaveTarget = (typeof TARGET)[number]["chiave"]

/** Pannello di collegamento a Samsung Health, sempre presente in Impostazioni.
 *
 * È l'unico pezzo dell'integrazione visibile anche da scollegati: senza, non ci
 * sarebbe modo di sapere quale URL incollare nell'app del telefono, e la
 * sincronizzazione non potrebbe partire.
 */
export function SamsungHealthCard() {
  const { data: stato } = useStatoSalute()
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

  function salvaTarget(e: FormEvent) {
    e.preventDefault()
    const dati: Partial<Record<ChiaveTarget, number>> = {}
    for (const { chiave } of TARGET) dati[chiave] = Math.round(Number(valori[chiave] || 0))
    modifica.mutate(dati)
  }

  async function copiaUrl() {
    if (!stato) return
    try {
      await navigator.clipboard.writeText(stato.url_webhook)
      toast.success("URL copiato.")
    } catch {
      // Il browser può negare la clipboard (contesto non sicuro, permesso
      // rifiutato): l'URL resta comunque leggibile e selezionabile a mano.
      toast.error("Copia non riuscita: seleziona l'URL a mano.")
    }
  }

  if (!stato) return null

  const etichettaStato = !stato.ingest_attivo
    ? "Non configurato"
    : stato.collegata
      ? "Collegato"
      : "In attesa di dati"

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Samsung Health</h2>
        <Badge variant={stato.collegata ? "secondary" : "outline"}>{etichettaStato}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Samsung non permette al server di leggere i dati da solo: è il telefono a spedirli qui. Ci pensa
        l'app <span className="font-medium text-foreground">HC Webhook</span>, che legge sonno, peso e
        alimentazione da Health Connect e li manda a questo indirizzo ogni ora.
      </p>

      {!stato.ingest_attivo && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          La ricezione è spenta: manca <code>WORKOUT_INGEST_TOKEN</code> nel file <code>.env</code> del
          server. Scegli un token lungo a caso, mettilo lì e riavvia l'app: è la password con cui il
          telefono si identifica.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="salute-url">URL da incollare nell'app</Label>
        <div className="flex gap-2">
          <Input id="salute-url" readOnly value={stato.url_webhook} className="font-mono text-xs" />
          <Button type="button" variant="outline" size="icon" onClick={copiaUrl} aria-label="Copia URL">
            <Copy className="size-4" />
          </Button>
        </div>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>In Samsung Health, attiva la condivisione di Sonno, Peso e Nutrizione con Health Connect.</li>
        <li>Installa HC Webhook e concedigli gli stessi tre permessi.</li>
        <li>
          Incolla l'URL qui sopra e aggiungi l'header <code>Authorization: Bearer &lt;token&gt;</code>,
          con il token del server.
        </li>
      </ol>

      {stato.collegata && (
        <>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {[
              { etichetta: "Sonno", valore: stato.ultimo_sonno },
              { etichetta: "Pasti", valore: stato.ultimo_pasto },
              { etichetta: "Peso", valore: stato.ultimo_peso },
            ].map((voce) => (
              <div key={voce.etichetta} className="rounded-md border border-border p-2">
                <p className="text-xs text-muted-foreground">{voce.etichetta}</p>
                <p className="tabular-nums">{voce.valore ? dataIt(voce.valore) : "—"}</p>
              </div>
            ))}
          </div>

          <form onSubmit={salvaTarget} className="space-y-3 border-t border-border pt-4">
            <div>
              <h3 className="font-medium">Obiettivi giornalieri</h3>
              <p className="text-sm text-muted-foreground">
                Disegnati come linea di riferimento nei grafici della sezione Salute. Lascia vuoto quelli
                che non ti interessano.
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
        </>
      )}
    </div>
  )
}
