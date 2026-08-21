import { ChartCard } from "@/components/statistiche/ChartCard"
import { BarTrendChart } from "@/components/statistiche/BarTrendChart"
import { LineTrendChart } from "@/components/statistiche/LineTrendChart"
import { dataIt, etichettaBreve, numeroIt } from "@/lib/format"
import type { MetricaSalute } from "@/api/salute"

/** Una metrica qualsiasi arrivata da Health Connect.
 *
 * Il componente non sa che metrica sta disegnando, e non deve saperlo: nome,
 * unità e decimali arrivano dal server insieme ai dati. È questo che permette a
 * un tipo nuovo — i passi il giorno in cui il telefono comincia a mandarli — di
 * comparire senza toccare il frontend.
 */
export function CardMetricaSalute({ metrica }: { metrica: MetricaSalute }) {
  const { giorni, unita, decimali, aggregazione } = metrica
  const suffisso = unita ? ` ${unita}` : ""

  // Le quantità accumulate in una giornata (passi, calorie, distanza) si
  // leggono come barre: sono blocchi indipendenti, uno per giorno. Le misure
  // di uno stato — battito, saturazione, massa grassa — sono una curva, perché
  // quello che conta è come si muove.
  const aBarre = aggregazione === "somma"

  return (
    <ChartCard
      titolo={metrica.etichetta}
      vuoto={giorni.length === 0}
      azioni={
        <span className="font-heading text-lg font-semibold tabular-nums">
          {numeroIt(metrica.ultimo_valore)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{unita}</span>
        </span>
      }
      extra={
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">
          Media {numeroIt(round(metrica.media, decimali))}
          {suffisso} · ultimo dato {dataIt(metrica.ultima_data)}
        </p>
      }
    >
      {aBarre ? (
        <BarTrendChart
          labels={giorni.map((g) => etichettaBreve(g.data))}
          valori={giorni.map((g) => g.valore)}
          unita={unita}
        />
      ) : (
        <LineTrendChart
          labels={giorni.map((g) => g.data)}
          valori={giorni.map((g) => g.valore)}
          unita={unita}
        />
      )}
    </ChartCard>
  )
}

function round(valore: number, decimali: number): number {
  const fattore = 10 ** decimali
  return Math.round(valore * fattore) / fattore
}
