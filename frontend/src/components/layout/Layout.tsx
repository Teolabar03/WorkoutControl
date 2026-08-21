import { Outlet } from "react-router-dom"
import { useAppContext } from "@/hooks/useAppContext"
import { TopBar } from "@/components/layout/TopBar"
import { SessioneBanner } from "@/components/layout/SessioneBanner"

export function Layout() {
  const { data: context } = useAppContext()

  return (
    <div className="min-h-svh bg-background">
      <TopBar
        aiDisponibile={context?.ai_disponibile ?? false}
        saluteCollegata={context?.salute_collegata ?? false}
      />
      <SessioneBanner sessione={context?.sessione_corrente ?? null} />
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}
