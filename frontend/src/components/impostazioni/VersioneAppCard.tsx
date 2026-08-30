import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { statoApp, type StatoApp } from "@/lib/aggiornamenti"

/** Versione dell'app e, quando serve, l'APK da installare a mano.
 *
 *  Compare solo dentro l'APK: da browser `statoApp` restituisce null e la
 *  scheda non si disegna, perche' li' non c'e' niente da aggiornare a mano.
 *
 *  Il bundle web si aggiorna da solo e in silenzio, quindi nel caso normale
 *  questa scheda e' solo informativa. Il bottone spunta unicamente quando
 *  cambia la parte nativa: li' serve un APK nuovo, e Android non lascia
 *  installarlo senza un tap.
 */
export function VersioneAppCard() {
  const [stato, setStato] = useState<StatoApp | null>(null)

  useEffect(() => {
    let vivo = true
    statoApp().then((s) => {
      if (vivo) setStato(s)
    })
    return () => {
      vivo = false
    }
  }, [])

  if (!stato) return null

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">Versione app</h2>
        <Badge variant="secondary">
          {stato.versioneWeb === "builtin" ? "di fabbrica" : stato.versioneWeb}
        </Badge>
      </div>

      {stato.apkUrl ? (
        <>
          <p className="text-sm text-muted-foreground">
            È uscita una versione che cambia anche la parte nativa dell'app: questa non si aggiorna da
            sola. Scarica l'APK e aprilo per installarlo sopra quello attuale.
          </p>
          <a
            href={stato.apkUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Scarica l'APK
          </a>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          L'app si aggiorna da sola: le novità vengono scaricate in background e sono attive alla
          riapertura successiva.
        </p>
      )}
    </div>
  )
}
