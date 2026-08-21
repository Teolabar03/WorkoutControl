import { useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChartCard } from "@/components/statistiche/ChartCard"
import { BarTrendChart } from "@/components/statistiche/BarTrendChart"
import { MetricTile } from "@/components/statistiche/MetricTile"
import { MacroChart } from "@/components/salute/MacroChart"
import { TargetProgress } from "@/components/nutrizione/TargetProgress"
import { GiornoPasti } from "@/components/nutrizione/GiornoPasti"
import { dataIt, etichettaBreve, media, numeroIt } from "@/lib/format"
import { rangeObiettivo, statoObiettivo } from "@/lib/obiettivi"
import { useAppContext } from "@/hooks/useAppContext"
import { useImpostazioni } from "@/hooks/useImpostazioni"
import { usePasti, useSalute } from "@/hooks/useSalute"
import type { GiornoSalute, Pasto } from "@/api/salute"

const PERIODI = [30, 90]

export function NutrizionePage() {
  const { data: context, isPending } = useAppContext()
  const { data: impostazioni } = useImpostazioni()
  const [giorni, setGiorni] = useState(PERIODI[0])
  const { data: righe } = useSalute(giorni)
  const { data: pasti } = usePasti(giorni)

  if (isPending) return null
  if (!context?.nutrizione_disponibile) return <Navigate to="/calendario" replace />

  const cronologiche: GiornoSalute[] = [...(righe ?? [])].reverse()
  const conCibo = cronologiche.filter((g) => g.kcal !== null)

  // "Oggi" è il giorno che l'API considera tale, non quello del browser: se il
  // telefono deve ancora sincronizzare, la riga non c'è e i totali restano a zero.
  const oggi = context.oggi
  const giornoOggi = conCibo.find((g) => g.data === oggi)
  const mediaKcal = media(conCibo.map((g) => g.kcal as number))

  // Gli obiettivi sono intervalli, non numeri secchi: la tolleranza scelta in
  // Impostazioni li allarga, e tutto quello che li mostra parte da qui.
  const tolleranza = impostazioni?.target_tolleranza_pct ?? 0
  const rangeKcal = rangeObiettivo(impostazioni?.target_kcal ?? 0, tolleranza)
  const obiettivi = [
    { etichetta: "Calorie", valore: giornoOggi?.kcal ?? null, range: rangeKcal, unita: "kcal" },
    { etichetta: "Proteine", valore: giornoOggi?.proteine_g ?? null, range: rangeObiettivo(impostazioni?.target_proteine_g ?? 0, tolleranza), unita: "g" },
    { etichetta: "Carboidrati", valore: giornoOggi?.carboidrati_g ?? null, range: rangeObiettivo(impostazioni?.target_carboidrati_g ?? 0, tolleranza), unita: "g" },
    { etichetta: "Grassi", valore: giornoOggi?.grassi_g ?? null, range: rangeObiettivo(impostazioni?.target_grassi_g ?? 0, tolleranza), unita: "g" },
  ]
  const senzaObiettivi = obiettivi.every((o) => !o.range)

  // I pasti arrivano piatti: si raggruppano per giorno mantenendo l'ordine del
  // server, che li dà dal piu' recente.
  const perGiorno = new Map<string, Pasto[]>()
  for (const pasto of pasti ?? []) {
    const gruppo = perGiorno.get(pasto.data)
    if (gruppo) gruppo.push(pasto)
    else perGiorno.set(pasto.data, [pasto])
  }
  const giorniInLinea = rangeKcal
    ? conCibo.filter((g) => statoObiettivo(g.kcal as number, rangeKcal) === "dentro").length
    : null
  const mediaPasti = conCibo.length ? (pasti?.length ?? 0) / conCibo.length : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Nutrizione</h1>
        <div className="flex gap-2">
          {PERIODI.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={n === giorni ? "default" : "outline"}
              onClick={() => setGiorni(n)}
            >
              {n} giorni
            </Button>
          ))}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Oggi</h2>
          <p className="text-sm text-muted-foreground">
            {giornoOggi ? dataIt(oggi) : "Nessun pasto registrato oggi"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {obiettivi.map((o) => (
            <TargetProgress key={o.etichetta} {...o} />
          ))}
        </div>
        {senzaObiettivi && (
          <p className="text-sm text-muted-foreground">
            Gli obiettivi giornalieri si impostano in{" "}
            <Link to="/impostazioni" className="font-medium text-primary underline-offset-4 hover:underline">
              Impostazioni
            </Link>
            .
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile
          etichetta="Media calorie"
          valore={mediaKcal === null ? "—" : numeroIt(Math.round(mediaKcal))}
          nota={`su ${conCibo.length} giorni`}
        />
        <MetricTile
          etichetta="Giorni tracciati"
          valore={String(conCibo.length)}
          nota={`ultimi ${giorni} giorni`}
        />
        <MetricTile
          etichetta="Giorni in linea"
          valore={giorniInLinea === null ? "—" : `${giorniInLinea}/${conCibo.length}`}
          nota={giorniInLinea === null ? "nessun obiettivo" : "calorie nel range"}
        />
        <MetricTile
          etichetta="Media proteine"
          valore={(() => {
            const m = media(conCibo.map((g) => g.proteine_g ?? 0))
            return m === null ? "—" : `${numeroIt(Math.round(m))} g`
          })()}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard titolo="Calorie" vuoto={conCibo.length === 0}>
          <BarTrendChart
            labels={conCibo.map((g) => etichettaBreve(g.data))}
            valori={conCibo.map((g) => Math.round(g.kcal as number))}
            unita="kcal"
            target={impostazioni?.target_kcal || undefined}
            targetMin={rangeKcal?.min}
            targetMax={rangeKcal?.max}
          />
        </ChartCard>

        <ChartCard titolo="Macronutrienti" vuoto={conCibo.length === 0}>
          <MacroChart
            dati={conCibo.map((g) => ({
              label: etichettaBreve(g.data),
              proteine: Math.round(g.proteine_g ?? 0),
              carboidrati: Math.round(g.carboidrati_g ?? 0),
              grassi: Math.round(g.grassi_g ?? 0),
            }))}
          />
        </ChartCard>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Pasti</h2>
          <p className="text-sm tabular-nums text-muted-foreground">
            {mediaPasti === null
              ? "—"
              : `${numeroIt(Math.round(mediaPasti * 10) / 10)} pasti al giorno in media`}
          </p>
        </div>
        {perGiorno.size === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Nessun pasto registrato negli ultimi {giorni} giorni.
          </p>
        ) : (
          <div className="space-y-3">
            {[...perGiorno.entries()].map(([data, pastiDelGiorno]) => (
              <GiornoPasti
                key={data}
                data={data}
                pasti={pastiDelGiorno}
                rangeKcal={rangeKcal}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
