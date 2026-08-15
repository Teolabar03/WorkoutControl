import { ChartCard } from "@/components/statistiche/ChartCard"
import { LineTrendChart } from "@/components/statistiche/LineTrendChart"
import { BarTrendChart } from "@/components/statistiche/BarTrendChart"
import { MetricTile } from "@/components/statistiche/MetricTile"
import { ProgressioneCard } from "@/components/statistiche/ProgressioneCard"
import { PrTable } from "@/components/statistiche/PrTable"
import { dataIt, numeroIt } from "@/lib/format"
import {
  useAderenza,
  useFrequenza,
  useRiepilogo,
  useRipetizioni,
  useVolume,
  usePr,
} from "@/hooks/useStatistiche"

function coloreAderenza(valore: number): string {
  if (valore < 70) return "var(--color-destructive)"
  if (valore < 90) return "var(--color-warning)"
  return "var(--color-primary)"
}

export function StatistichePage() {
  const { data: riepilogo } = useRiepilogo()
  const { data: volume } = useVolume()
  const { data: ripetizioni } = useRipetizioni()
  const { data: frequenza } = useFrequenza()
  const { data: aderenza } = useAderenza()
  const { data: prAttuali } = usePr(false)

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Statistiche</h1>

      {riepilogo && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile etichetta="Allenamenti totali" valore={String(riepilogo.totale_sessioni)} />
          <MetricTile etichetta="Ultimi 30 giorni" valore={String(riepilogo.sessioni_30_giorni)} />
          <MetricTile
            etichetta="Volume totale"
            valore={`${numeroIt(riepilogo.volume_totale_kg)} kg`}
          />
          <MetricTile
            etichetta="Ultima sessione"
            valore={riepilogo.ultima_sessione ? dataIt(riepilogo.ultima_sessione) : "—"}
            nota={
              riepilogo.durata_media_min ? `${riepilogo.durata_media_min} min in media` : undefined
            }
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard titolo="Volume nel tempo" vuoto={!volume || volume.labels.length === 0}>
          {volume && <LineTrendChart labels={volume.labels} valori={volume.valori} unita="kg" />}
        </ChartCard>

        <ChartCard
          titolo="Ripetizioni nel tempo"
          vuoto={!ripetizioni || ripetizioni.labels.length === 0}
        >
          {ripetizioni && (
            <LineTrendChart labels={ripetizioni.labels} valori={ripetizioni.valori} unita="rip." />
          )}
        </ChartCard>

        <ChartCard titolo="Frequenza settimanale" vuoto={!frequenza}>
          {frequenza && <BarTrendChart labels={frequenza.labels} valori={frequenza.valori} />}
        </ChartCard>

        <ChartCard
          titolo="Aderenza alla scheda"
          vuoto={!aderenza || aderenza.sessioni.labels.length === 0}
          extra={
            aderenza?.riepilogo && (
              <p className="mt-2 border-t border-border pt-2 text-sm text-muted-foreground">
                Media ultime {aderenza.riepilogo.n_sessioni} sessioni:{" "}
                <span className="font-medium text-foreground">
                  {numeroIt(aderenza.riepilogo.media)}%
                </span>
              </p>
            )
          }
        >
          {aderenza && (
            <BarTrendChart
              labels={aderenza.sessioni.labels.map((l) => dataIt(l))}
              valori={aderenza.sessioni.valori}
              unita="%"
              coloreBarra={coloreAderenza}
            />
          )}
        </ChartCard>
      </div>

      <ProgressioneCard />

      <PrTable titolo="Record personali attuali" record={prAttuali ?? []} />
    </div>
  )
}
