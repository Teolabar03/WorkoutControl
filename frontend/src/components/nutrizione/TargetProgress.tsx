import { cn } from "@/lib/utils"
import { numeroIt } from "@/lib/format"

/** Quanto si è consumato oggi rispetto all'obiettivo, per un singolo valore.
 *
 * Senza obiettivo impostato resta un numero e basta: una barra senza traguardo
 * non direbbe niente, e inventarne uno sarebbe peggio che ometterlo.
 */
export function TargetProgress({
  etichetta,
  valore,
  target,
  unita,
}: {
  etichetta: string
  valore: number | null
  target: number
  unita: string
}) {
  const consumato = valore ?? 0
  const quota = target > 0 ? consumato / target : 0
  // La barra si ferma al 100%, la percentuale no: sforare è un'informazione, e
  // va detta a parole invece che nascosta dietro una barra piena.
  const larghezza = Math.min(100, Math.round(quota * 100))
  const sforato = quota > 1

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {etichetta}
        </p>
        {target > 0 && (
          <p className={cn("text-xs tabular-nums", sforato ? "text-warning" : "text-muted-foreground")}>
            {Math.round(quota * 100)}%
          </p>
        )}
      </div>

      <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
        {numeroIt(Math.round(consumato))}
        <span className="ml-1 text-sm font-normal text-muted-foreground">
          {target > 0 ? `/ ${numeroIt(target)} ${unita}` : unita}
        </span>
      </p>

      {target > 0 ? (
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(consumato)}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-label={`${etichetta}: ${Math.round(consumato)} di ${target} ${unita}`}
        >
          <div
            className={cn("h-full rounded-full transition-all", sforato ? "bg-warning" : "bg-primary")}
            style={{ width: `${larghezza}%` }}
          />
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Nessun obiettivo impostato</p>
      )}
    </div>
  )
}
