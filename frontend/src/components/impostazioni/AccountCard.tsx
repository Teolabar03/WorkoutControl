import { useState, type FormEvent } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCambiaPassword, usePermessi } from "@/hooks/useAuth"
import { etichettaRuolo } from "@/lib/ruoli"

/** L'utenza collegata: chi sei, su quale workout, e il cambio password. */
export function AccountCard() {
  const { utente } = usePermessi()
  const cambia = useCambiaPassword()
  const [attuale, setAttuale] = useState("")
  const [nuova, setNuova] = useState("")

  if (!utente) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    cambia.mutate(
      { attuale, nuova },
      {
        onSuccess: () => {
          setAttuale("")
          setNuova("")
        },
      }
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">La tua utenza</h2>
        <Badge variant="secondary">{etichettaRuolo(utente.ruolo)}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{utente.username}</span> · workout «
        {utente.workout.nome}»
      </p>

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="account-attuale">Password attuale</Label>
          <Input
            id="account-attuale"
            type="password"
            autoComplete="current-password"
            value={attuale}
            onChange={(e) => setAttuale(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="account-nuova">Nuova password</Label>
          <Input
            id="account-nuova"
            type="password"
            autoComplete="new-password"
            minLength={8}
            placeholder="Almeno 8 caratteri"
            value={nuova}
            onChange={(e) => setNuova(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          className="sm:col-span-2"
          disabled={!attuale || nuova.length < 8 || cambia.isPending}
        >
          Cambia password
        </Button>
      </form>
    </div>
  )
}
