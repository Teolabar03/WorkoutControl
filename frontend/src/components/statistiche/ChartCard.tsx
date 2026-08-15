import type { ReactNode } from "react"

export function ChartCard({
  titolo,
  azioni,
  children,
  vuoto,
  extra,
}: {
  titolo: string
  azioni?: ReactNode
  children: ReactNode
  vuoto?: boolean
  extra?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{titolo}</h2>
        {azioni}
      </div>
      {vuoto ? (
        <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Ancora nessun dato.
        </p>
      ) : (
        <div className="h-48 w-full">{children}</div>
      )}
      {extra}
    </div>
  )
}
