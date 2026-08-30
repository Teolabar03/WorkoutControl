import {
  Bar,
  BarChart,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ChartTooltip } from "@/components/statistiche/ChartTooltip"

export function BarTrendChart({
  labels,
  valori,
  unita,
  coloreBarra,
  target,
  targetMin,
  targetMax,
  indiceInCorso,
}: {
  labels: string[]
  valori: number[]
  unita?: string
  /** Colore per-barra (es. soglie di aderenza); default: primary per tutte. */
  coloreBarra?: (valore: number) => string
  /** Obiettivo giornaliero da tracciare come linea; assente o 0 = non impostato. */
  target?: number
  /** Estremi della fascia "in linea" attorno al target. Passandoli, l'obiettivo
   *  si disegna come banda invece che come linea sola: è la stessa tolleranza
   *  che governa le barre in Nutrizione, e i due devono raccontare la stessa
   *  cosa. Senza, il componente si comporta esattamente come prima. */
  targetMin?: number
  targetMax?: number
  /** Indice della barra che rappresenta un giorno non ancora finito: si disegna
   *  scarica e tratteggiata. Il dato c'è ed è vero, ma è parziale, e una barra
   *  piena come le altre farebbe leggere come un crollo quello che è solo un
   *  pomeriggio non ancora passato. */
  indiceInCorso?: number
}) {
  const dati = labels.map((label, i) => ({ label, valore: valori[i] }))
  const conFascia = !!targetMin && !!targetMax && targetMax > targetMin
  // Le Cell servono se almeno una barra va trattata diversamente dalle altre.
  const perBarra = !!coloreBarra || indiceInCorso !== undefined

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dati} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
          minTickGap={16}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          content={<ChartTooltip unita={unita} />}
          cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
        />
        {conFascia && (
          <ReferenceArea
            y1={targetMin}
            y2={targetMax}
            fill="var(--color-accent)"
            fillOpacity={0.12}
            stroke="none"
          />
        )}
        {!!target && (
          <ReferenceLine
            y={target}
            stroke="var(--color-accent)"
            strokeDasharray="4 4"
            label={{
              value: `obiettivo ${target}`,
              position: "insideTopRight",
              // Sopra la fascia il verde su verde non si legge: lì l'etichetta
              // passa al colore del testo, e a dire "obiettivo" resta la banda.
              fill: conFascia ? "var(--color-foreground)" : "var(--color-accent)",
              fontSize: 11,
            }}
          />
        )}
        <Bar dataKey="valore" radius={[4, 4, 0, 0]} maxBarSize={40} fill="var(--color-primary)">
          {perBarra &&
            dati.map((d, i) => {
              const riempimento = coloreBarra ? coloreBarra(d.valore) : "var(--color-primary)"
              const inCorso = i === indiceInCorso
              return (
                <Cell
                  key={i}
                  fill={riempimento}
                  fillOpacity={inCorso ? 0.35 : 1}
                  stroke={inCorso ? riempimento : undefined}
                  strokeDasharray={inCorso ? "3 3" : undefined}
                />
              )
            })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
