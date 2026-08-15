import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"
import type { MeseCalendario } from "@/api/calendario"

const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]

export function CalendarGrid({ mese, oggi }: { mese: MeseCalendario; oggi: string }) {
  const perGiorno = new Map(mese.giorni.map((g) => [g.data, g]))
  const meseStr = String(mese.mese).padStart(2, "0")

  const celle: { data: string | null; numero: number | null }[] = []
  for (let i = 0; i < mese.primo_giorno_settimana; i++) celle.push({ data: null, numero: null })
  for (let giorno = 1; giorno <= mese.giorni_nel_mese; giorno++) {
    celle.push({ data: `${mese.anno}-${meseStr}-${String(giorno).padStart(2, "0")}`, numero: giorno })
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {GIORNI_SETTIMANA.map((g) => (
          <div key={g} className="pb-1 text-center text-xs font-medium text-muted-foreground">
            {g}
          </div>
        ))}

        {celle.map((cella, i) => {
          if (!cella.data) return <div key={`vuota-${i}`} />

          const info = perGiorno.get(cella.data)
          const isOggi = cella.data === oggi
          const prima = info?.sessioni[0]
          const altre = (info?.sessioni.length ?? 0) - 1

          return (
            <Link
              key={cella.data}
              to={`/calendario/${cella.data}`}
              style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}
              className={cn(
                "animate-in fade-in relative flex aspect-square flex-col items-center justify-center gap-1 rounded-md border p-1 text-sm transition-colors duration-150 fill-mode-backwards motion-reduce:animate-none",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isOggi ? "border-primary" : "border-border"
              )}
            >
              {info?.ha_dolore && (
                <span
                  className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive"
                  aria-label="Dolore segnalato"
                />
              )}
              <span className={cn("tabular-nums", isOggi && "font-semibold text-primary")}>
                {cella.numero}
              </span>
              {prima && (
                <span
                  className={cn(
                    "w-full truncate rounded px-1 text-center text-[10px] leading-tight font-medium",
                    prima.completata ? "bg-primary/15 text-primary" : "bg-warning/20 text-warning"
                  )}
                >
                  {prima.nome_scheda}
                  {altre > 0 ? ` +${altre}` : ""}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded bg-primary/15" /> Completato
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded bg-warning/20" /> Incompleto
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-destructive" /> Dolore segnalato
        </span>
      </div>
    </div>
  )
}
