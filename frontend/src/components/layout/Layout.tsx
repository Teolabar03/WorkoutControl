import { useEffect } from "react"
import { Outlet } from "react-router-dom"
import { Eye } from "lucide-react"
import { useAppContext } from "@/hooks/useAppContext"
import { fermaRecupero } from "@/lib/recupero"
import { usePermessi } from "@/hooks/useAuth"
import { TopBar } from "@/components/layout/TopBar"
import { SessioneBanner } from "@/components/layout/SessioneBanner"

export function Layout() {
  const { data: context } = useAppContext()

  // Rete di sicurezza per il timer di recupero: se il server dice che non c'e'
  // nessun allenamento aperto, nessun avviso deve restare in coda. Copre le
  // chiusure che la pagina della sessione non vede (da un altro dispositivo,
  // dal browser mentre l'APK e' in background, un annullamento perso).
  const nessunaSessione = context !== undefined && context.sessione_corrente === null
  useEffect(() => {
    if (nessunaSessione) fermaRecupero()
  }, [nessunaSessione])

  const { puoScrivere, utente } = usePermessi()

  return (
    <div className="min-h-svh bg-background">
      <TopBar
        aiDisponibile={context?.ai_disponibile ?? false}
        saluteCollegata={context?.salute_collegata ?? false}
        nutrizioneDisponibile={context?.nutrizione_disponibile ?? false}
      />
      {puoScrivere ? (
        <SessioneBanner sessione={context?.sessione_corrente ?? null} />
      ) : (
        utente && (
          // Senza, l'allenatore vedrebbe sparire pulsanti senza sapere perché.
          <p className="flex items-center justify-center gap-2 border-b border-border bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
            <Eye className="size-3.5 shrink-0" aria-hidden="true" />
            Sola lettura sui dati del workout «{utente.workout.nome}»
          </p>
        )
      )}
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}
