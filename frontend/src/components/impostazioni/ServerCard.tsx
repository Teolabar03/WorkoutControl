import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ConfigurazioneServerPage } from "@/pages/ConfigurazioneServerPage"
import { leggiOrigin, nativo } from "@/lib/server"

/** L'indirizzo del server scelto al primo avvio, e come cambiarlo.
 *
 *  Compare solo dentro l'APK: da browser l'API sta sullo stesso host che ha
 *  servito la pagina e non c'e' niente da configurare.
 *
 *  Senza questa scheda l'indirizzo si sceglierebbe una volta sola e per
 *  sempre: chi sposta l'app su un altro server, o cambia il dominio, si
 *  ritroverebbe un'app che non raggiunge piu' niente e nessun posto in cui
 *  correggerla se non svuotando i dati dell'app da Android.
 */
export function ServerCard() {
  const [origin, setOrigin] = useState(leggiOrigin)
  const [modifica, setModifica] = useState(false)

  if (!nativo()) return null

  if (modifica) {
    return (
      <ConfigurazioneServerPage
        origineIniziale={origin ?? ""}
        onAnnulla={() => setModifica(false)}
        onSalvato={(nuovo) => {
          setOrigin(nuovo)
          setModifica(false)
          // Ricarica invece di aggiornare la cache: le query gia' in memoria
          // contengono i dati del server precedente, e la sessione di login
          // vale per quello vecchio. Stesso ragionamento del logout.
          window.location.reload()
        }}
      />
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="font-heading text-lg font-semibold">Server</h2>
      <p className="break-all text-sm text-muted-foreground">{origin}</p>
      <p className="text-sm text-muted-foreground">
        L'installazione a cui l'app manda i dati. Cambiarlo ti fa rientrare con le credenziali del
        server nuovo.
      </p>
      <Button size="sm" variant="outline" onClick={() => setModifica(true)}>
        Cambia server
      </Button>
    </div>
  )
}
