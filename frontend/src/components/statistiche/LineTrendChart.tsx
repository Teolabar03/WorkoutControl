import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChartTooltip } from "@/components/statistiche/ChartTooltip"
import { dataIt } from "@/lib/format"

export function LineTrendChart({
  labels,
  valori,
  unita,
  dataAsse = true,
}: {
  labels: string[]
  valori: number[]
  unita?: string
  /** false quando le label non sono date ISO (es. "dd/mm" già formattate). */
  dataAsse?: boolean
}) {
  const dati = labels.map((label, i) => ({
    label: dataAsse ? dataIt(label) : label,
    valore: valori[i],
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={dati} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip content={<ChartTooltip unita={unita} />} cursor={{ stroke: "var(--color-border)" }} />
        <Line
          type="monotone"
          dataKey="valore"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={dati.length <= 20}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
