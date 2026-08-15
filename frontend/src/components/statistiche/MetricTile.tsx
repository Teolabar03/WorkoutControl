export function MetricTile({
  etichetta,
  valore,
  nota,
}: {
  etichetta: string
  valore: string
  nota?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {etichetta}
      </p>
      <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">{valore}</p>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  )
}
