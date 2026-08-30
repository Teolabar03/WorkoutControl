import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/** "In corso": il giorno corrente non è finito, quindi il suo dato è parziale.
 *
 * Sta in un componente solo perché la dicitura e il tratteggio siano identici
 * ovunque — grafici, schede pasto, riepiloghi. Il tratteggio è lo stesso segno
 * che le barre usano per la colonna di oggi: si impara una volta.
 */
export function PastigliaInCorso({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-dashed text-muted-foreground", className)}
      title="Giornata non ancora conclusa: il dato è parziale"
    >
      In corso
    </Badge>
  )
}
