import { ChartCard } from "@/components/statistiche/ChartCard"
import { BarTrendChart } from "@/components/statistiche/BarTrendChart"
import { LineTrendChart } from "@/components/statistiche/LineTrendChart"
import { PastigliaInCorso } from "@/components/common/PastigliaInCorso"
import { dataIt, etichettaBreve, numeroIt } from "@/lib/format"
import type { MetricaSalute } from "@/api/salute"

/** Una metrica qualsiasi arrivata da Health Connect.
 *
 * Il componente non sa che metrica sta disegnando, e non deve saperlo: nome,
 * unità e decimali arrivano dal server insieme ai dati. È questo che permette a
 * un tipo nuovo — i passi il giorno in cui il telefono comincia a mandarli — di
 * comparire senza toccare il frontend.
 *
 * In intestazione c'è la MEDIA del periodo, non l'ultimo valore: questa è una
 * scheda di andamento, e mettere in cima il dato di oggi — quasi sempre
 * parziale — significava far leggere come tendenza una mattinata. Il valore di
 * oggi ha il suo posto, il riepilogo in cima alla pagina.
 */
export function CardMetricaSalute({
  metrica,
  oggi,
}: {
  metrica: MetricaSalute
  /** Il giorno corrente: se cade nel periodo, la sua colonna va marcata. */
  oggi?: string
}) {
  const { giorni, unita, decimali, aggregazione } = metrica
  const suffisso = unita ? ` ${unita}` : ""

  // Le quantità accumulate in una giornata (passi, calorie, distanza) si
  // leggono come barre: sono blocchi indipendenti, uno per giorno. Le misure
  // di uno stato — battito, saturazione, massa grassa — sono una curva, perché
  // quello che conta è come si muove.
  const aBarre = aggregazione === "somma"

  const posizioneOggi = oggi ? giorni.findIndex((g) => g.data === oggi) : -1
  // Marcare la colonna ha senso su quello che si accumula: a metà giornata i
  // passi sono a metà, ma un battito medio è già un battito medio.
  const inCorso = posizioneOggi >= 0 && aBarre

  return (
    <ChartCard
      titolo={metrica.etichetta}
      vuoto={giorni.length === 0}
      azioni={
        <span className="font-heading text-lg font-semibold tabular-nums">
          {numeroIt(round(metrica.media, decimali))}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unita} in media
          </span>
        </span>
      }
      extra={
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-muted-foreground">
          <span>
            {giorni.length} {giorni.length === 1 ? "giorno" : "giorni"} con dati · ultimo{" "}
            {numeroIt(metrica.ultimo_valore)}
            {suffisso} il {dataIt(metrica.ultima_data)}
          </span>
          {inCorso && <PastigliaInCorso />}
        </p>
      }
    >
      {aBarre ? (
        <BarTrendChart
          labels={giorni.map((g) => etichettaBreve(g.data))}
          valori={giorni.map((g) => g.valore)}
          unita={unita}
          indiceInCorso={inCorso ? posizioneOggi : undefined}
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
