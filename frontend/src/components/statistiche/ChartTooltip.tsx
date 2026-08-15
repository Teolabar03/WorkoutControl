interface ChartTooltipProps {
  active?: boolean
  payload?: { value?: number | string }[]
  label?: string
  unita?: string
}

export function ChartTooltip({ active, payload, label, unita }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const valore = payload[0]?.value
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">
        {valore}
        {unita ? ` ${unita}` : ""}
      </p>
    </div>
  )
}
