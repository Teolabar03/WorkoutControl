import { Link, useLocation } from "react-router-dom"
import { Circle } from "lucide-react"
import type { Sessione } from "@/api/sessioni"

export function SessioneBanner({ sessione }: { sessione: Sessione | null }) {
  const location = useLocation()
  if (!sessione || location.pathname === `/sessione/${sessione.id}`) return null

  return (
    <Link
      to={`/sessione/${sessione.id}`}
      className="flex items-center justify-center gap-2 bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Circle className="size-2 animate-pulse fill-current motion-reduce:animate-none" aria-hidden="true" />
      Allenamento in corso — riprendi
    </Link>
  )
}
