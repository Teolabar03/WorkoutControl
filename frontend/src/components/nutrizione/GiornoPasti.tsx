import { PastigliaInCorso } from "@/components/common/PastigliaInCorso"
import { cn } from "@/lib/utils"
import { dataIt, numeroIt, oraIt } from "@/lib/format"
import {
  ETICHETTA_STATO,
  TESTO_STATO,
  statoObiettivo,
  type RangeObiettivo,
} from "@/lib/obiettivi"
import type { Pasto } from "@/api/salute"

/** Una giornata di pasti: intestazione con i totali, poi una riga per pasto.
 *
 * Il dettaglio esiste perché il totale del giorno non dice dove sono finite le
 * calorie: 2400 kcal spalmate su tre pasti e 2400 concentrate in uno sono la
 * stessa riga in un grafico e due giornate diverse nella realtà.
 */
export function GiornoPasti({
  data,
  pasti,
  rangeKcal,
  inCorso,
}: {
  data: string
  pasti: Pasto[]
  rangeKcal: RangeObiettivo | null
  /** Il giorno corrente: al posto del giudizio sull'obiettivo va un promemoria
   *  che la giornata non è finita. Marcare "Sotto" una giornata alle undici del
   *  mattino è vero e inutile insieme — manca ancora quasi tutto da mangiare. */
  inCorso?: boolean
}) {
  const totale = (campo: keyof Pasto) =>
    pasti.reduce((somma, p) => somma + ((p[campo] as number | null) ?? 0), 0)

  const kcal = totale("kcal")
  const stato = rangeKcal && !inCorso ? statoObiettivo(kcal, rangeKcal) : null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-heading text-base font-semibold">{dataIt(data)}</h3>
        <div className="flex items-baseline gap-2">
          {inCorso && <PastigliaInCorso />}
          {stato && (
            <span className={cn("text-xs font-medium", TESTO_STATO[stato])}>
              {ETICHETTA_STATO[stato]}
            </span>
          )}
          <span className="font-heading text-lg font-semibold tabular-nums">
            {numeroIt(Math.round(kcal))}
            <span className="ml-1 text-xs font-normal text-muted-foreground">kcal</span>
          </span>
        </div>
      </div>

      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
        {pasti.length} {pasti.length === 1 ? "pasto" : "pasti"} · P{" "}
        {numeroIt(Math.round(totale("proteine_g")))} g · C{" "}
        {numeroIt(Math.round(totale("carboidrati_g")))} g · G{" "}
        {numeroIt(Math.round(totale("grassi_g")))} g
      </p>

      <ul className="mt-3 divide-y divide-border">
        {pasti.map((p) => (
          <li key={p.id} className="py-2 first:pt-0 last:pb-0">
            {/* Su schermo stretto le macro vanno a capo sotto il nome invece di
                comprimersi in colonne illeggibili: qui si guarda dal telefono. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium">{p.nome || "Pasto"}</span>
              <span className="text-sm tabular-nums">
                {p.kcal === null ? "—" : `${numeroIt(Math.round(p.kcal))} kcal`}
                <span className="ml-2 text-xs text-muted-foreground">{oraIt(p.inizio)}</span>
              </span>
            </div>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {macro(p).join(" · ") || "Nessun macronutriente registrato"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Le macro valorizzate del pasto. Fibre e zuccheri compaiono solo se ci sono:
 *  li porta l'export di Samsung Health, non la sincronizzazione oraria, e una
 *  fila di trattini sarebbe solo rumore. */
function macro(p: Pasto): string[] {
  const voci: [string, number | null, string][] = [
    ["P", p.proteine_g, "g"],
    ["C", p.carboidrati_g, "g"],
    ["G", p.grassi_g, "g"],
    ["Fibre", p.fibre_g, "g"],
    ["Zuccheri", p.zuccheri_g, "g"],
  ]
  return voci
    .filter(([, valore]) => valore !== null)
    .map(([sigla, valore, unita]) => `${sigla} ${numeroIt(Math.round(valore as number))} ${unita}`)
}
