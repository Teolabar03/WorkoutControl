import { useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChartCard } from "@/components/statistiche/ChartCard"
import { BarTrendChart } from "@/components/statistiche/BarTrendChart"
import { MetricTile } from "@/components/statistiche/MetricTile"
import { MacroChart } from "@/components/salute/MacroChart"
import { TargetProgress } from "@/components/nutrizione/TargetProgress"
import { GiornoPasti } from "@/components/nutrizione/GiornoPasti"
import { PastigliaInCorso } from "@/components/common/PastigliaInCorso"
import { SelettorePeriodo } from "@/components/common/SelettorePeriodo"
import { dataIt, etichettaBreve, media, numeroIt, oraIt } from "@/lib/format"
import { rangeObiettivo, statoObiettivo } from "@/lib/obiettivi"
import { etichettaPeriodo, giorniPeriodo, periodoPreset } from "@/lib/periodo"
import { useAppContext } from "@/hooks/useAppContext"
import { useImpostazioni } from "@/hooks/useImpostazioni"
import { usePasti, useSalute } from "@/hooks/useSalute"
import type { GiornoSalute, Pasto } from "@/api/salute"

/** Quante giornate di pasti si aprono per volta.
 *
 * L'elenco copre il periodo scelto, ma a 90 giorni sono 90 schede: si parte da
 * una settimana e il resto si chiede. Il dettaglio pasto per pasto serve sui
 * giorni vicini, per quelli lontani bastano i grafici. */
const GIORNI_PER_BLOCCO = 7

export function NutrizionePage() {
  const { data: context, isPending } = useAppContext()

  if (isPending) return null
  if (!context?.nutrizione_disponibile) return <Navigate to="/calendario" replace />

  // "Oggi" è il giorno che l'API considera tale, non quello del browser: è il
  // server a tenere il calendario, e la pagina nasce già sapendolo.
  return <NutrizioneCaricata oggi={context.oggi} />
}

function NutrizioneCaricata({ oggi }: { oggi: string }) {
  const { data: impostazioni } = useImpostazioni()
  const [periodo, setPeriodo] = useState(() => periodoPreset(30, oggi))
  const [giorniVisibili, setGiorniVisibili] = useState(GIORNI_PER_BLOCCO)

  // Cambiare periodo richiude l'elenco: restare a quaranta giornate aperte dopo
  // essere passati a una finestra di sette è una posizione senza senso.
  useEffect(() => setGiorniVisibili(GIORNI_PER_BLOCCO), [periodo.dal, periodo.al])

  const { data: righe } = useSalute(periodo)
  const { data: pasti } = usePasti(periodo)
  // Oggi si interroga a parte, non si pesca dal periodo: il blocco in cima deve
  // restare pieno anche mentre nei grafici si guarda un mese passato.
  const { data: righeOggi } = useSalute({ dal: oggi, al: oggi })
  const { data: pastiOggi } = usePasti({ dal: oggi, al: oggi })

  const cronologiche: GiornoSalute[] = [...(righe ?? [])].reverse()
  const conCibo = cronologiche.filter((g) => g.kcal !== null)
  const giornoOggi = (righeOggi ?? [])[0]

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
  const ultimoPastoOggi = (pastiOggi ?? []).at(-1)

  // I pasti arrivano piatti: si raggruppano per giorno mantenendo l'ordine del
  // server, che li dà dal piu' recente.
  const perGiorno = new Map<string, Pasto[]>()
  for (const pasto of pasti ?? []) {
    const gruppo = perGiorno.get(pasto.data)
    if (gruppo) gruppo.push(pasto)
    else perGiorno.set(pasto.data, [pasto])
  }
  const giorni = [...perGiorno.entries()]
  const mancanti = Math.max(0, giorni.length - giorniVisibili)

  const mediaKcal = media(conCibo.map((g) => g.kcal as number))
  const giorniInLinea = rangeKcal
    ? conCibo.filter((g) => statoObiettivo(g.kcal as number, rangeKcal) === "dentro").length
    : null
  const mediaPasti = conCibo.length ? (pasti?.length ?? 0) / conCibo.length : null

  // La giornata di oggi entra nei conti del periodo come tutte le altre, ma è
  // l'unica ancora aperta: nei grafici la sua colonna è tratteggiata e sotto le
  // medie una riga lo dice, altrimenti una media abbassata da mezza giornata si
  // legge come un peggioramento.
  const indiceOggi = conCibo.findIndex((g) => g.data === oggi)
  const oggiNelPeriodo = indiceOggi >= 0

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Nutrizione</h1>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg font-semibold">Oggi</h2>
            <PastigliaInCorso />
          </div>
          <p className="text-sm text-muted-foreground">{dataIt(oggi)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {obiettivi.map((o) => (
            <TargetProgress key={o.etichetta} {...o} />
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {ultimoPastoOggi
            ? `${pastiOggi?.length} ${pastiOggi?.length === 1 ? "pasto" : "pasti"} finora · ultimo alle ${oraIt(ultimoPastoOggi.inizio)}`
            : "Nessun pasto registrato oggi."}
        </p>

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

      {/* Da qui in giù si parla solo del periodo scelto: medie, totali, storico.
          Il confine è esplicito perché era proprio la mescolanza fra "quanto ho
          mangiato stamattina" e "come sono andati tre mesi" a rendere
          illeggibile questa pagina. */}
      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-heading text-lg font-semibold">Andamento</h2>
          <p className="text-sm text-muted-foreground">{etichettaPeriodo(periodo)}</p>
        </div>

        <SelettorePeriodo valore={periodo} onChange={setPeriodo} oggi={oggi} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            etichetta="Media calorie"
            valore={mediaKcal === null ? "—" : numeroIt(Math.round(mediaKcal))}
            nota={`su ${contaGiorni(conCibo.length)} con pasti`}
          />
          <MetricTile
            etichetta="Giorni tracciati"
            valore={String(conCibo.length)}
            nota={`su ${contaGiorni(giorniPeriodo(periodo))} nel periodo`}
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

        {oggiNelPeriodo && (
          <p className="text-xs text-muted-foreground">
            Oggi è compreso nel periodo e conta come una giornata intera, pur
            essendo ancora in corso: nei grafici la sua colonna è tratteggiata.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <ChartCard titolo="Calorie" vuoto={conCibo.length === 0}>
            <BarTrendChart
              labels={conCibo.map((g) => etichettaBreve(g.data))}
              valori={conCibo.map((g) => Math.round(g.kcal as number))}
              unita="kcal"
              target={impostazioni?.target_kcal || undefined}
              targetMin={rangeKcal?.min}
              targetMax={rangeKcal?.max}
              indiceInCorso={oggiNelPeriodo ? indiceOggi : undefined}
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
              indiceInCorso={oggiNelPeriodo ? indiceOggi : undefined}
            />
          </ChartCard>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Pasti</h2>
          <p className="text-sm tabular-nums text-muted-foreground">
            {mediaPasti === null
              ? "—"
              : `${numeroIt(Math.round(mediaPasti * 10) / 10)} pasti al giorno in media`}
          </p>
        </div>
        {giorni.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Nessun pasto registrato nel periodo scelto.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {giorni.slice(0, giorniVisibili).map(([data, pastiDelGiorno]) => (
                <GiornoPasti
                  key={data}
                  data={data}
                  pasti={pastiDelGiorno}
                  rangeKcal={rangeKcal}
                  inCorso={data === oggi}
                />
              ))}
            </div>
            {mancanti > 0 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setGiorniVisibili((n) => n + GIORNI_PER_BLOCCO)}
              >
                Mostra altri {Math.min(GIORNI_PER_BLOCCO, mancanti)} giorni
                <span className="ml-1 text-muted-foreground">({mancanti} rimanenti)</span>
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/** "30 giorni" / "1 giorno". */
function contaGiorni(n: number): string {
  return `${n} ${n === 1 ? "giorno" : "giorni"}`
}
