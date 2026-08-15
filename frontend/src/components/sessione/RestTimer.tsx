import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function formatta(secondi: number) {
  const m = Math.floor(secondi / 60)
  const s = secondi % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export function RestTimer({
  visibile,
  secondiRimanenti,
  finito,
  onFerma,
  onPiuTrenta,
}: {
  visibile: boolean
  secondiRimanenti: number
  finito: boolean
  onFerma: () => void
  onPiuTrenta: () => void
}) {
  if (!visibile) return null
  const inScadenza = secondiRimanenti <= 10 && !finito

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 shadow-lg transition-colors",
        finito
          ? "border-primary bg-primary text-primary-foreground"
          : inScadenza
            ? "border-warning bg-warning text-warning-foreground"
            : "border-border bg-card text-card-foreground"
      )}
      role="timer"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">
            {finito ? "Recupero finito" : "Recupero"}
          </p>
          <p
            className={cn(
              "font-heading text-3xl font-semibold tabular-nums",
              inScadenza && "motion-safe:animate-pulse motion-reduce:animate-none"
            )}
          >
            {finito ? "0:00" : formatta(secondiRimanenti)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onPiuTrenta} className="bg-transparent">
            <Plus className="size-4" /> 30s
          </Button>
          <Button variant="outline" size="sm" onClick={onFerma} className="bg-transparent" aria-label="Ferma timer">
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
