import { MetricTile } from "@/components/statistiche/MetricTile"
import { dataIt, numeroIt, oraIt, oreEMinuti } from "@/lib/format"
import type { GiornoSalute, MetricaSalute } from "@/api/salute"

/** Come sta andando oggi, tenuto separato dai trend del periodo.
 *
 * Prima questi numeri stavano sparsi dentro le schede di andamento — "ultima
 * notte" accanto alla media delle notti, l'ultimo valore in cima al grafico dei
 * novanta giorni — e non si capiva mai se un numero fosse di stamattina o di
 * tre mesi. Qui c'è solo oggi; sotto, nella pagina, c'è solo il periodo.
 *
 * Il blocco non dipende dal periodo scelto: si può guardare l'agosto scorso nei
 * grafici e avere comunque i passi di stamattina in cima.
 */
export function RiepilogoOggi({
  oggi,
  giorno,
  metriche,
  ultimaNotte,
}: {
  oggi: string
  /** La riga di oggi, se il telefono ha già sincronizzato qualcosa. */
  giorno?: GiornoSalute
  /** Le metriche con un valore oggi: l'elenco lo filtra già il server. */
  metriche: MetricaSalute[]
  /** L'ultima notte registrata nel periodo, per non lasciare la casella vuota
   *  quando il sonno di stanotte non è ancora arrivato. */
  ultimaNotte?: GiornoSalute
}) {
  const sonnoDiOggi = giorno && giorno.sonno_minuti > 0 ? giorno : undefined
  const fasi = Object.entries(sonnoDiOggi?.fasi ?? {})
  const nienteDiOggi = !sonnoDiOggi && metriche.length === 0

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Oggi</h2>
        <p className="text-sm text-muted-foreground">{dataIt(oggi)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MetricTile
          etichetta="Sonno di stanotte"
          valore={sonnoDiOggi ? oreEMinuti(sonnoDiOggi.sonno_minuti) : "—"}
          nota={
            sonnoDiOggi
              ? finestra(sonnoDiOggi)
              : ultimaNotte
                ? `ultima notte ${dataIt(ultimaNotte.data)}: ${oreEMinuti(ultimaNotte.sonno_minuti)}`
                : "nessuna notte registrata"
          }
        />

        {/* Le metriche non sono note in anticipo: si disegna quello che il
            telefono ha mandato oggi, con l'etichetta che dà il server. */}
        {metriche.map((m) => (
          <MetricTile
            key={m.tipo}
            etichetta={m.etichetta}
            valore={`${numeroIt(m.ultimo_valore)}${m.unita ? ` ${m.unita}` : ""}`}
            nota={m.aggregazione === "somma" ? "totale finora" : "ultima rilevazione"}
          />
        ))}
      </div>

      {fasi.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 font-heading text-base font-semibold">Fasi della notte</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {fasi.map(([fase, minuti]) => (
              <MetricTile key={fase} etichetta={fase} valore={oreEMinuti(minuti)} />
            ))}
          </div>
        </div>
      )}

      {nienteDiOggi && (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Dal telefono non è ancora arrivato niente per oggi. La sincronizzazione
          gira una volta all'ora.
        </p>
      )}
    </section>
  )
}

/** "dalle 23:40 alle 07:05", quando il telefono manda anche gli orari. */
function finestra(giorno: GiornoSalute): string | undefined {
  if (!giorno.sonno_inizio || !giorno.sonno_fine) return undefined
  return `dalle ${oraIt(giorno.sonno_inizio)} alle ${oraIt(giorno.sonno_fine)}`
}
