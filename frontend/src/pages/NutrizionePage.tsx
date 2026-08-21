import { useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChartCard } from "@/components/statistiche/ChartCard"
import { BarTrendChart } from "@/components/statistiche/BarTrendChart"
import { MetricTile } from "@/components/statistiche/MetricTile"
import { MacroChart } from "@/components/salute/MacroChart"
import { TargetProgress } from "@/components/nutrizione/TargetProgress"
import { dataIt, numeroIt } from "@/lib/format"
import { useAppContext } from "@/hooks/useAppContext"
import { useImpostazioni } from "@/hooks/useImpostazioni"
import { useSalute } from "@/hooks/useSalute"
import type { GiornoSalute } from "@/api/salute"

const PERIODI = [30, 90]

function etichettaBreve(iso: string) {
  return dataIt(iso).slice(0, 5)
}

function media(valori: number[]) {
  if (valori.length === 0) return null
  return valori.reduce((somma, v) => somma + v, 0) / valori.length
}

export function NutrizionePage() {
  const { data: context, isPending } = useAppContext()
  const { data: impostazioni } = useImpostazioni()
  const [giorni, setGiorni] = useState(PERIODI[0])
  const { data: righe } = useSalute(giorni)

  if (isPending) return null
  if (!context?.nutrizione_disponibile) return <Navigate to="/calendario" replace />

  const cronologiche: GiornoSalute[] = [...(righe ?? [])].reverse()
  const conCibo = cronologiche.filter((g) => g.kcal !== null)

  // "Oggi" è il giorno che l'API considera tale, non quello del browser: se il
  // telefono deve ancora sincronizzare, la riga non c'è e i totali restano a zero.
  const oggi = context.oggi
  const giornoOggi = conCibo.find((g) => g.data === oggi)
  const mediaKcal = media(conCibo.map((g) => g.kcal as number))

  const obiettivi = [
    { etichetta: "Calorie", valore: giornoOggi?.kcal ?? null, target: impostazioni?.target_kcal ?? 0, unita: "kcal" },
    { etichetta: "Proteine", valore: giornoOggi?.proteine_g ?? null, target: impostazioni?.target_proteine_g ?? 0, unita: "g" },
    { etichetta: "Carboidrati", valore: giornoOggi?.carboidrati_g ?? null, target: impostazioni?.target_carboidrati_g ?? 0, unita: "g" },
    { etichetta: "Grassi", valore: giornoOggi?.grassi_g ?? null, target: impostazioni?.target_grassi_g ?? 0, unita: "g" },
  ]
  const senzaObiettivi = obiettivi.every((o) => !o.target)

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
          etichetta="Ultimo giorno"
          valore={conCibo.length ? dataIt(conCibo.at(-1)!.data) : "—"}
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
    </div>
  )
}
