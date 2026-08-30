import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PRESET_GIORNI, periodoPreset, presetAttivo, type Periodo } from "@/lib/periodo"

/** Scelta del periodo osservato: scorciatoie a durata fissa più gli estremi a mano.
 *
 * I due campi data sono la scelta vera — i preset compilano solo i campi al
 * posto tuo, per il caso frequente. Gli estremi non vengono mai lasciati
 * rovesciati: spostare un capo oltre l'altro trascina anche l'altro, perché un
 * intervallo impossibile qui diventa un 422 dell'API tre righe più in là.
 */
export function SelettorePeriodo({
  valore,
  onChange,
  oggi,
}: {
  valore: Periodo
  onChange: (p: Periodo) => void
  /** Il giorno corrente secondo il server: nessun campo può andare oltre. */
  oggi: string
}) {
  const attivo = presetAttivo(valore, oggi)

  const cambiaDal = (dal: string) => {
    if (!dal) return
    onChange({ dal, al: dal > valore.al ? dal : valore.al })
  }
  const cambiaAl = (al: string) => {
    if (!al) return
    onChange({ dal: al < valore.dal ? al : valore.dal, al })
  }

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <div className="flex gap-2">
        {PRESET_GIORNI.map((n) => (
          <Button
            key={n}
            size="sm"
            variant={n === attivo ? "default" : "outline"}
            onClick={() => onChange(periodoPreset(n, oggi))}
          >
            {n} giorni
          </Button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="periodo-dal" className="text-xs text-muted-foreground">
            Dal
          </Label>
          <Input
            id="periodo-dal"
            type="date"
            className="w-[9.5rem]"
            value={valore.dal}
            max={oggi}
            onChange={(e) => cambiaDal(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="periodo-al" className="text-xs text-muted-foreground">
            Al
          </Label>
          <Input
            id="periodo-al"
            type="date"
            className="w-[9.5rem]"
            value={valore.al}
            max={oggi}
            onChange={(e) => cambiaAl(e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
