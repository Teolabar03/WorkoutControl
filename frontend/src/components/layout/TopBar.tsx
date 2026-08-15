import { NavLink } from "react-router-dom"
import {
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  LogOut,
  NotebookPen,
  Scale,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useLogout } from "@/hooks/useAuth"

interface NavItem {
  to: string
  label: string
  icon: typeof CalendarDays
}

function navItems(aiDisponibile: boolean): NavItem[] {
  const base: NavItem[] = [
    { to: "/calendario", label: "Calendario", icon: CalendarDays },
    { to: "/schede", label: "Schede", icon: ClipboardList },
    { to: "/statistiche", label: "Statistiche", icon: BarChart3 },
  ]
  if (aiDisponibile) base.push({ to: "/chat", label: "Assistente AI", icon: Bot })
  base.push(
    { to: "/peso", label: "Peso", icon: Scale },
    { to: "/diario", label: "Diario", icon: NotebookPen }
  )
  return base
}

export function TopBar({ aiDisponibile }: { aiDisponibile: boolean }) {
  const logout = useLogout()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex h-14 items-center gap-4 px-3 sm:px-6">
        <NavLink
          to="/calendario"
          className="flex shrink-0 items-center gap-2 font-heading text-lg font-semibold tracking-tight"
        >
          <Dumbbell className="size-5 text-primary" aria-hidden="true" />
          WorkoutTracker
        </NavLink>

        <nav
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:gap-2"
          aria-label="Navigazione principale"
        >
          {navItems(aiDisponibile).map((item) => (
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
    </header>
  )
}
