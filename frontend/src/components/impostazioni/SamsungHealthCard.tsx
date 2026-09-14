import { useRef } from "react"
import { Copy, KeyRound, RefreshCw, Upload } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { dataIt } from "@/lib/format"
import { useGeneraTokenSalute, useImportaExport, useStatoSalute } from "@/hooks/useSalute"

/** Pannello di collegamento a Samsung Health, sempre presente in Impostazioni.
 *
 * È l'unico pezzo dell'integrazione visibile anche da scollegati: senza, non ci
 * sarebbe modo di sapere quale URL incollare nell'app del telefono, e la
 * sincronizzazione non potrebbe partire.
 */
export function SamsungHealthCard() {
  const { data: stato } = useStatoSalute()
  const importa = useImportaExport()
  const generaToken = useGeneraTokenSalute()
  const selettoreFile = useRef<HTMLInputElement>(null)

  async function copia(testo: string, cosa: string) {
    try {
      await navigator.clipboard.writeText(testo)
      toast.success(`${cosa} copiato.`)
    } catch {
      // Il browser può negare la clipboard (contesto non sicuro, permesso
      // rifiutato): il testo resta comunque leggibile e selezionabile a mano.
      toast.error("Copia non riuscita: seleziona il testo a mano.")
    }
  }

  if (!stato) return null

  const token = stato.token

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
        <div className="space-y-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p>
            La ricezione è spenta: questo workout non ha ancora un token, la password con cui il
            telefono si identifica e che dice a quale workout vanno i dati.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => generaToken.mutate()}
            disabled={generaToken.isPending}
          >
            <KeyRound className="size-4" /> Genera il token
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="salute-url">URL da incollare nell'app</Label>
        <div className="flex gap-2">
          <Input id="salute-url" readOnly value={stato.url_webhook} className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => copia(stato.url_webhook, "URL")}
            aria-label="Copia URL"
          >
            <Copy className="size-4" />
          </Button>
        </div>
      </div>

      {token && (
        <div className="space-y-1.5">
          <Label htmlFor="salute-token">Token di questo workout</Label>
          <div className="flex gap-2">
            <Input id="salute-token" readOnly value={token} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={() => copia(token, "Token")} aria-label="Copia token">
              <Copy className="size-4" />
            </Button>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" size="icon" aria-label="Rigenera token">
                  <RefreshCw className="size-4" />
                </Button>
              }
              titolo="Rigenerare il token?"
              descrizione="Il telefono configurato con il token attuale smette di sincronizzare finché non inserisci quello nuovo in HC Webhook."
              testoConferma="Rigenera"
              onConferma={() => generaToken.mutate()}
            />
          </div>
        </div>
      )}

      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>In Samsung Health, attiva la condivisione di Sonno, Peso e Nutrizione con Health Connect.</li>
        <li>Installa HC Webhook e concedigli gli stessi tre permessi.</li>
        <li>
          Incolla l'URL qui sopra e aggiungi l'header <code>Authorization: Bearer &lt;token&gt;</code>,
          con il token di questo workout.
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
        <div className="space-y-2 border-t border-border pt-4 text-sm">
          <div className="grid grid-cols-3 gap-2">
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

          {/* Gli altri tipi di dato non sono un elenco fisso: dipendono dai
              permessi che l'app ponte ha ottenuto e da cosa Samsung Health
              riversa sull'hub. Mostrare quello che arriva davvero è l'unico
              modo per accorgersi che manca qualcosa. */}
          {stato.metriche.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {stato.metriche.map((m) => (
                <div key={m.tipo} className="rounded-md border border-border p-2">
                  <p className="text-xs text-muted-foreground">{m.etichetta}</p>
                  <p className="tabular-nums">
                    {m.ultima_data ? dataIt(m.ultima_data) : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
