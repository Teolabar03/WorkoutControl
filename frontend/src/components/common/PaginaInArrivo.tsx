export function PaginaInArrivo({ titolo, fase }: { titolo: string; fase: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="font-heading text-2xl font-semibold">{titolo}</h1>
      <p className="text-muted-foreground">Arriva nella {fase} della migrazione.</p>
    </div>
  )
}
