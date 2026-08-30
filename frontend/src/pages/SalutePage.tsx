import { useState } from "react"
import { Navigate } from "react-router-dom"
import { ChartCard } from "@/components/statistiche/ChartCard"
import { BarTrendChart } from "@/components/statistiche/BarTrendChart"
import { MetricTile } from "@/components/statistiche/MetricTile"
import { CardMetricaSalute } from "@/components/salute/CardMetricaSalute"
import { RiepilogoOggi } from "@/components/salute/RiepilogoOggi"
import { SelettorePeriodo } from "@/components/common/SelettorePeriodo"
import { etichettaBreve, media, oreEMinuti } from "@/lib/format"
import { rangeObiettivo } from "@/lib/obiettivi"
import { contieneOggi, etichettaPeriodo, periodoPreset } from "@/lib/periodo"
import { useAppContext } from "@/hooks/useAppContext"
import { useImpostazioni } from "@/hooks/useImpostazioni"
import { useMetricheSalute, useSalute } from "@/hooks/useSalute"
import type { GiornoSalute } from "@/api/salute"

export function SalutePage() {
  const { data: context, isPending } = useAppContext()

  // La sezione esiste solo con la sincronizzazione attiva: chi arriva qui con
  // l'URL a mano (o dopo aver svuotato i dati) torna da dove è venuto invece
  // di trovare una pagina di grafici vuoti.
  if (isPending) return null
  if (!context?.salute_collegata) return <Navigate to="/calendario" replace />

  // Il corpo della pagina nasce già sapendo qual è "oggi" secondo il server, che
  // è quello che decide il periodo di partenza e cosa va nel riepilogo: farlo
  // partire con la data del browser e correggerla dopo voleva dire una prima
  // interrogazione buttata a ogni caricamento.
  return <SaluteCaricata oggi={context.oggi} />
}

function SaluteCaricata({ oggi }: { oggi: string }) {
  const { data: impostazioni } = useImpostazioni()
  const [periodo, setPeriodo] = useState(() => periodoPreset(30, oggi))

  const { data: righe } = useSalute(periodo)
  const { data: metriche } = useMetricheSalute(periodo)
  // Oggi si interroga a parte, non si pesca dal periodo: così il riepilogo in
  // cima resta pieno anche quando si va a guardare un mese dell'anno scorso.
  const { data: righeOggi } = useSalute({ dal: oggi, al: oggi })
  const { data: metricheOggi } = useMetricheSalute({ dal: oggi, al: oggi })

  // Il server ordina dal più recente; i grafici vogliono il tempo che scorre
  // da sinistra a destra.
  const cronologiche: GiornoSalute[] = [...(righe ?? [])].reverse()
  const conSonno = cronologiche.filter((g) => g.sonno_minuti > 0)
  const durate = conSonno.map((g) => g.sonno_minuti)

  const mediaSonno = media(durate)
  // Il peso non sta qui: ha una sezione sua, con altezza, BMI e storico
  // modificabile. Ripeterlo voleva dire due grafici della stessa cosa, da due
  // fonti diverse.
  const inOre = (minuti: number) => Number((minuti / 60).toFixed(1))
  const rangeSonno = rangeObiettivo(
    impostazioni?.target_sonno_minuti ?? 0,
    impostazioni?.target_tolleranza_pct ?? 0
  )

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Salute</h1>

      <RiepilogoOggi
        oggi={oggi}
        giorno={(righeOggi ?? [])[0]}
        metriche={metricheOggi ?? []}
        // Il ripiego "ultima notte registrata" vale solo se il periodo arriva a
        // oggi: guardando l'agosto scorso, la sua ultima notte non è l'ultima
        // che si ha, ed esibirla al posto di stanotte sarebbe una bugia.
        ultimaNotte={contieneOggi(periodo, oggi) ? conSonno.at(-1) : undefined}
      />

      {/* Da qui in giù si parla solo del periodo scelto. La riga di intestazione
          lo dice a chiare lettere, perché tutti i numeri sotto sono medie e
          totali di quell'intervallo e non del giorno corrente. */}
      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-heading text-lg font-semibold">Andamento</h2>
          <p className="text-sm text-muted-foreground">{etichettaPeriodo(periodo)}</p>
        </div>

        <SelettorePeriodo valore={periodo} onChange={setPeriodo} oggi={oggi} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricTile
            etichetta="Sonno medio"
            valore={mediaSonno === null ? "—" : oreEMinuti(mediaSonno)}
            nota={`${conSonno.length} ${conSonno.length === 1 ? "notte" : "notti"} nel periodo`}
          />
          <MetricTile
            etichetta="Notte più lunga"
            valore={durate.length ? oreEMinuti(Math.max(...durate)) : "—"}
          />
          <MetricTile
            etichetta="Notte più corta"
            valore={durate.length ? oreEMinuti(Math.min(...durate)) : "—"}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ChartCard titolo="Ore di sonno" vuoto={conSonno.length === 0}>
            <BarTrendChart
              labels={conSonno.map((g) => etichettaBreve(g.data))}
              valori={conSonno.map((g) => inOre(g.sonno_minuti))}
              unita="ore"
              target={rangeSonno ? inOre(rangeSonno.target) : undefined}
              targetMin={rangeSonno ? inOre(rangeSonno.min) : undefined}
              targetMax={rangeSonno ? inOre(rangeSonno.max) : undefined}
            />
          </ChartCard>

          {/* Le metriche generiche: l'elenco arriva dal server e contiene solo
              quelle che hanno davvero dei valori, quindi qui non c'è niente da
              decidere — si disegna quello che c'è. */}
          {(metriche ?? []).map((m) => (
            <CardMetricaSalute key={m.tipo} metrica={m} oggi={oggi} />
          ))}
        </div>
      </section>
    </div>
  )
}
