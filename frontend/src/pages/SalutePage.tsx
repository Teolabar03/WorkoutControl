import { useState } from "react"
import { Navigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChartCard } from "@/components/statistiche/ChartCard"
import { BarTrendChart } from "@/components/statistiche/BarTrendChart"
import { LineTrendChart } from "@/components/statistiche/LineTrendChart"
import { MetricTile } from "@/components/statistiche/MetricTile"
import { dataIt, numeroIt } from "@/lib/format"
import { useAppContext } from "@/hooks/useAppContext"
import { useImpostazioni } from "@/hooks/useImpostazioni"
import { useSalute } from "@/hooks/useSalute"
import type { GiornoSalute } from "@/api/salute"

const PERIODI = [30, 90]

/** "21/08" — sull'asse ci sta solo giorno e mese. */
function etichettaBreve(iso: string) {
  return dataIt(iso).slice(0, 5)
}

function media(valori: number[]) {
  if (valori.length === 0) return null
  return valori.reduce((somma, v) => somma + v, 0) / valori.length
}

function oreEMinuti(minuti: number) {
  return `${Math.floor(minuti / 60)}h ${String(Math.round(minuti % 60)).padStart(2, "0")}`
}

export function SalutePage() {
  const { data: context, isPending: contextInCaricamento } = useAppContext()
  const { data: impostazioni } = useImpostazioni()
  const [giorni, setGiorni] = useState(PERIODI[0])
  const { data: righe } = useSalute(giorni)

  // La sezione esiste solo con la sincronizzazione attiva: chi arriva qui con
  // l'URL a mano (o dopo aver svuotato i dati) torna da dove è venuto invece
  // di trovare una pagina di grafici vuoti.
  if (contextInCaricamento) return null
  if (!context?.salute_collegata) return <Navigate to="/calendario" replace />

  // Il server ordina dal più recente; i grafici vogliono il tempo che scorre
  // da sinistra a destra.
  const cronologiche: GiornoSalute[] = [...(righe ?? [])].reverse()
  const conSonno = cronologiche.filter((g) => g.sonno_minuti > 0)
  const conPeso = cronologiche.filter((g) => g.peso_kg !== null)

  const mediaSonno = media(conSonno.map((g) => g.sonno_minuti))
  const ultimaNotte = conSonno.at(-1)
  const targetSonnoOre = impostazioni?.target_sonno_minuti
    ? Number((impostazioni.target_sonno_minuti / 60).toFixed(1))
    : undefined

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Salute</h1>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile
          etichetta="Sonno medio"
          valore={mediaSonno === null ? "—" : oreEMinuti(mediaSonno)}
          nota={`${conSonno.length} notti`}
        />
        <MetricTile
          etichetta="Ultima notte"
          valore={ultimaNotte ? oreEMinuti(ultimaNotte.sonno_minuti) : "—"}
          nota={ultimaNotte ? dataIt(ultimaNotte.data) : undefined}
        />
        <MetricTile
          etichetta="Notte più lunga"
          valore={conSonno.length ? oreEMinuti(Math.max(...conSonno.map((g) => g.sonno_minuti))) : "—"}
          nota={`ultimi ${giorni} giorni`}
        />
        <MetricTile
          etichetta="Ultimo peso"
          valore={conPeso.length ? `${numeroIt(conPeso.at(-1)!.peso_kg!)} kg` : "—"}
          nota={conPeso.length ? dataIt(conPeso.at(-1)!.data) : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard titolo="Ore di sonno" vuoto={conSonno.length === 0}>
          <BarTrendChart
            labels={conSonno.map((g) => etichettaBreve(g.data))}
            valori={conSonno.map((g) => Number((g.sonno_minuti / 60).toFixed(1)))}
            unita="ore"
            target={targetSonnoOre}
          />
        </ChartCard>

        <ChartCard titolo="Peso corporeo" vuoto={conPeso.length === 0}>
          <LineTrendChart
            labels={conPeso.map((g) => g.data)}
            valori={conPeso.map((g) => g.peso_kg as number)}
            unita="kg"
          />
        </ChartCard>
      </div>

      {ultimaNotte && Object.keys(ultimaNotte.fasi).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-heading text-lg font-semibold">
            Fasi dell'ultima notte
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(ultimaNotte.fasi).map(([fase, minuti]) => (
              <MetricTile key={fase} etichetta={fase} valore={oreEMinuti(minuti)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
