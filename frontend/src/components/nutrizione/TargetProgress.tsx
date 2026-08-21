import { cn } from "@/lib/utils"
import { numeroIt } from "@/lib/format"
import {
  COLORE_STATO,
  ETICHETTA_STATO,
  TESTO_STATO,
  etichettaRange,
  statoObiettivo,
  type RangeObiettivo,
} from "@/lib/obiettivi"

/** Quanto si è consumato oggi rispetto all'obiettivo, per un singolo valore.
 *
 * L'obiettivo è un intervallo, non un numero: la barra ha quindi tre stati —
 * sotto il minimo, dentro, oltre il massimo — e una fascia che mostra dove
 * cade la zona buona. Fermarsi a "sotto/sopra il target" farebbe sembrare
 * mancato un giorno a 2280 kcal su 2300, che mancato non è.
 *
 * Senza obiettivo impostato resta un numero e basta: una barra senza traguardo
 * non direbbe niente, e inventarne uno sarebbe peggio che ometterlo.
 */
export function TargetProgress({
  etichetta,
  valore,
  range,
  unita,
}: {
  etichetta: string
  valore: number | null
  range: RangeObiettivo | null
  unita: string
}) {
  const consumato = valore ?? 0

  if (!range) {
    return (
      <Guscio etichetta={etichetta}>
        <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
          {numeroIt(Math.round(consumato))}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{unita}</span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Nessun obiettivo impostato</p>
      </Guscio>
    )
  }

  const stato = statoObiettivo(consumato, range)
  // La scala arriva al massimo del range, non al centro: così la fascia buona
  // finisce al bordo destro e "pieno" vuol dire "arrivato in fondo all'intervallo".
  // Si lascia un margine del 15% perché uno sforamento resti visibile invece di
  // schiacciarsi contro il bordo.
  const scala = range.max * 1.15
  const larghezza = Math.min(100, Math.round((consumato / scala) * 100))
  const fasciaSinistra = (range.min / scala) * 100
  const fasciaLarghezza = ((range.max - range.min) / scala) * 100

  return (
    <Guscio etichetta={etichetta}>
      <p className={cn("text-xs font-medium tabular-nums", TESTO_STATO[stato])}>
        {ETICHETTA_STATO[stato]}
      </p>

      <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
        {numeroIt(Math.round(consumato))}
        <span className="ml-1 text-sm font-normal text-muted-foreground">
          / {etichettaRange(range, unita)}
        </span>
      </p>

      <div
        className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(consumato)}
        aria-valuemin={0}
        aria-valuemax={range.max}
        aria-label={`${etichetta}: ${Math.round(consumato)} ${unita}, obiettivo ${etichettaRange(range, unita)}`}
      >
        {/* La zona buona, sotto il riempimento: si vede dove si sta puntando
            anche quando la barra è ancora corta. */}
        <div
          className="absolute inset-y-0 bg-accent/20"
          style={{ left: `${fasciaSinistra}%`, width: `${fasciaLarghezza}%` }}
        />
        <div
          className={cn("relative h-full rounded-full transition-all", COLORE_STATO[stato])}
          style={{ width: `${larghezza}%` }}
        />
      </div>
    </Guscio>
  )
}

function Guscio({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {etichetta}
      </p>
      {children}
    </div>
  )
}
