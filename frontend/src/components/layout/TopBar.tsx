import { useEffect, useState } from "react"
import { NavLink } from "react-router-dom"
import {
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  Utensils,
  LogOut,
  Menu,
  NotebookPen,
  Scale,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useLogout } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { versioniInstallate, type VersioniInstallate } from "@/lib/aggiornamenti"

interface NavItem {
  to: string
  label: string
  icon: typeof CalendarDays
}

function navItems(
  aiDisponibile: boolean,
  saluteCollegata: boolean,
  nutrizioneDisponibile: boolean
): NavItem[] {
  const base: NavItem[] = [
    { to: "/calendario", label: "Calendario", icon: CalendarDays },
    { to: "/schede", label: "Schede", icon: ClipboardList },
    { to: "/statistiche", label: "Statistiche", icon: BarChart3 },
  ]
  if (aiDisponibile) base.push({ to: "/chat", label: "Assistente AI", icon: Bot })
  base.push(
    { to: "/peso", label: "Peso e altezza", icon: Scale },
    { to: "/diario", label: "Diario", icon: NotebookPen }
  )
  // Come per l'assistente AI: la voce compare solo quando c'è qualcosa da
  // vederci dentro, cioè dopo il primo dato ricevuto da Samsung Health.
  if (saluteCollegata) base.push({ to: "/salute", label: "Salute", icon: HeartPulse })
  // Condizione separata dal sonno: si puo' avere l'uno senza l'altra.
  if (nutrizioneDisponibile) base.push({ to: "/nutrizione", label: "Nutrizione", icon: Utensils })
  return base
}

export function TopBar({
  aiDisponibile,
  saluteCollegata,
  nutrizioneDisponibile,
}: {
  aiDisponibile: boolean
  saluteCollegata: boolean
  nutrizioneDisponibile: boolean
}) {
  const logout = useLogout()
  const [menuAperto, setMenuAperto] = useState(false)
  const [versioni, setVersioni] = useState<VersioniInstallate | null>(null)
  const items = navItems(aiDisponibile, saluteCollegata, nutrizioneDisponibile)

  // Solo dentro l'APK: da browser `versioniInstallate` restituisce null e il
  // piede del menu non si disegna, perche' li' la versione non significa
  // niente (la pagina e' sempre quella che il server ha appena servito).
  useEffect(() => {
    let vivo = true
    void versioniInstallate().then((v) => {
      if (vivo) setVersioni(v)
    })
    return () => {
      vivo = false
    }
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex h-14 items-center gap-4 px-3 sm:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 sm:hidden"
          onClick={() => setMenuAperto(true)}
          aria-label="Apri menu"
        >
          <Menu className="size-5" />
        </Button>

        <NavLink
          to="/calendario"
          className="flex shrink-0 items-center gap-2 font-heading text-lg font-semibold tracking-tight"
        >
          <Dumbbell className="size-5 text-primary" aria-hidden="true" />
          WorkoutTracker
        </NavLink>

        <nav
          className="hidden min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:flex sm:gap-2"
          aria-label="Navigazione principale"
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive ? "bg-muted text-foreground" : "text-muted-foreground"
                )
              }
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0 sm:gap-4">
          <NavLink
            to="/impostazioni"
            aria-label="Impostazioni"
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isActive && "bg-muted text-foreground"
              )
            }
          >
            <Settings className="size-5" aria-hidden="true" />
          </NavLink>

          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            aria-label="Esci"
            className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <LogOut className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <Sheet open={menuAperto} onOpenChange={setMenuAperto}>
        <SheetContent side="left" className="flex flex-col sm:hidden">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Dumbbell className="size-5 text-primary" aria-hidden="true" />
              WorkoutTracker
            </SheetTitle>
          </SheetHeader>
          <nav
            className="flex flex-col gap-1 overflow-y-auto px-4 pb-4"
            aria-label="Navigazione principale"
            onClick={(e) => (e.target as HTMLElement).closest("a") && setMenuAperto(false)}
          >
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground"
                  )
                }
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {versioni && (
            <div className="mt-auto border-t border-border px-4 pt-3 pb-1 text-xs text-muted-foreground">
              <p>App {versioni.app}</p>
              {/* "di fabbrica" = il bundle dentro l'APK, mai aggiornato: e'
                  il valore da cui si capisce che l'aggiornamento silenzioso
                  non e' ancora passato. */}
              <p>Web {versioni.web === "builtin" ? "di fabbrica" : versioni.web}</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </header>
  )
}
