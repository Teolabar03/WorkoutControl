import { useRef } from "react"
import { Copy, Upload } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { dataIt } from "@/lib/format"
import { useImportaExport, useStatoSalute } from "@/hooks/useSalute"

/** Pannello di collegamento a Samsung Health, sempre presente in Impostazioni.
 *
 * È l'unico pezzo dell'integrazione visibile anche da scollegati: senza, non ci
 * sarebbe modo di sapere quale URL incollare nell'app del telefono, e la
 * sincronizzazione non potrebbe partire.
 */
export function SamsungHealthCard() {
  const { data: stato } = useStatoSalute()
  const importa = useImportaExport()
  const selettoreFile = useRef<HTMLInputElement>(null)

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

      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="font-medium">Storico dal file di export</h3>
        <p className="text-sm text-muted-foreground">
          La sincronizzazione copre solo le ultime 48 ore: il passato arriva da qui. In Samsung Health,
          "Il mio profilo → Impostazioni → Scarica dati personali", poi carica lo ZIP. Si importano sonno,
          peso e alimentazione; reimportare lo stesso file non duplica niente.
        </p>
        <input
          ref={selettoreFile}
          type="file"
          accept=".zip,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importa.mutate(file)
            // Azzerato subito: senza, ricaricare lo stesso file non scatenerebbe
            // un nuovo evento change e il pulsante sembrerebbe rotto.
            e.target.value = ""
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => selettoreFile.current?.click()}
          disabled={importa.isPending}
        >
          <Upload className="size-4" />
          {importa.isPending ? "Importazione in corso…" : "Carica export Samsung Health"}
        </Button>
      </div>

      {stato.collegata && (
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-4 text-sm">
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
      )}
    </div>
  )
}
