import { useState, type FormEvent } from "react"
import { Dumbbell, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { useLogin } from "@/hooks/useAuth"

export function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [mostraPassword, setMostraPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [errore, setErrore] = useState("")
  const login = useLogin()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrore("")
    login.mutate(
      { username, password, remember },
      {
        onError: (err) => {
          setErrore(err instanceof ApiError ? err.message : "Errore imprevisto.")
        },
      }
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-card p-6"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Dumbbell className="size-8 text-primary" aria-hidden="true" />
          <h1 className="font-heading text-xl font-semibold">WorkoutTracker</h1>
          <p className="text-sm text-muted-foreground">Accedi per continuare.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="login-username">Nome utente</Label>
          <Input
            id="login-username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={Boolean(errore)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <div className="relative">
            <Input
              id="login-password"
              type={mostraPassword ? "text" : "password"}
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errore)}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setMostraPassword((v) => !v)}
              aria-label={mostraPassword ? "Nascondi password" : "Mostra password"}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none"
            >
              {mostraPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-input"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Ricordami per 90 giorni
        </label>

        {errore && <p className="text-sm text-destructive">{errore}</p>}

        <Button type="submit" className="w-full" disabled={login.isPending || !username || !password}>
          {login.isPending ? "Accesso..." : "Accedi"}
        </Button>
      </form>
    </div>
  )
}
