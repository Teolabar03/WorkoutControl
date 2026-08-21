import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

interface GiornoMacro {
  label: string
  proteine: number
  carboidrati: number
  grassi: number
}

/** Barre impilate dei tre macronutrienti in grammi.
 *
 * Impilate e non affiancate perché la domanda interessante è "com'è composta la
 * giornata", non "quanti grammi di grassi in assoluto": l'altezza totale dà il
 * colpo d'occhio sulla quantità, le fasce sulla proporzione.
 */
export function MacroChart({ dati }: { dati: GiornoMacro[] }) {
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
          cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
          contentStyle={{
            backgroundColor: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "0.375rem",
            fontSize: "0.75rem",
          }}
          formatter={(valore, nome) => [`${valore} g`, nome]}
        />
        <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
        <Bar dataKey="proteine" stackId="macro" name="Proteine" fill="var(--color-primary)" maxBarSize={40} />
        <Bar dataKey="carboidrati" stackId="macro" name="Carboidrati" fill="var(--color-accent)" maxBarSize={40} />
        <Bar
          dataKey="grassi"
          stackId="macro"
          name="Grassi"
          fill="var(--color-muted-foreground)"
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
