import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChartTooltip } from "@/components/statistiche/ChartTooltip"

export function BarTrendChart({
  labels,
  valori,
  unita,
  coloreBarra,
}: {
  labels: string[]
  valori: number[]
  unita?: string
  /** Colore per-barra (es. soglie di aderenza); default: primary per tutte. */
  coloreBarra?: (valore: number) => string
}) {
  const dati = labels.map((label, i) => ({ label, valore: valori[i] }))

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
        <Bar dataKey="valore" radius={[4, 4, 0, 0]} maxBarSize={40} fill="var(--color-primary)">
          {coloreBarra &&
            dati.map((d, i) => <Cell key={i} fill={coloreBarra(d.valore)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
