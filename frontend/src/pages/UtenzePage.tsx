import { useEffect, useState, type FormEvent } from "react"
import { Link, Navigate } from "react-router-dom"
import { ArrowLeft, Copy, KeyRound, Pencil, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { usePermessi } from "@/hooks/useAuth"
import {
  useCreaUtente,
  useCreaWorkout,
  useEliminaUtente,
  useEliminaWorkout,
  useGeneraToken,
  useModificaUtente,
  useRinominaWorkout,
  useUtentiElenco,
  useWorkoutElenco,
} from "@/hooks/useUtenze"
import { RUOLI, etichettaRuolo } from "@/lib/ruoli"
import type { Ruolo, Utente, WorkoutInfo } from "@/api/auth"
import type { DatiUtente } from "@/api/utenze"

async function copia(testo: string) {
  try {
    await navigator.clipboard.writeText(testo)
    toast.success("Copiato.")
  } catch {
    toast.error("Copia non riuscita: seleziona il testo a mano.")
  }
}

export function UtenzePage() {
  const { admin, utente } = usePermessi()
  if (!admin) return <Navigate to="/impostazioni" replace />

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <Link
          to="/impostazioni"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Impostazioni
        </Link>
        <h1 className="font-heading text-2xl font-semibold">Utenze</h1>
        <p className="text-sm text-muted-foreground">
          Le utenze collegate allo stesso workout vedono gli stessi dati; workout diversi restano
          indipendenti. La libreria esercizi è condivisa da tutti.
        </p>
      </div>

      <SezioneUtenze io={utente} />
      <SezioneWorkout />
    </div>
  )
}

function SezioneWorkout() {
  const { data: workout } = useWorkoutElenco()
  const crea = useCreaWorkout()
  const [nome, setNome] = useState("")

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    crea.mutate(nome.trim(), { onSuccess: () => setNome("") })
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Workout</h2>
        <p className="text-sm text-muted-foreground">
          Ogni workout ha i suoi dati e il suo token per Samsung Health.
        </p>
      </div>

      <ul className="divide-y divide-border">
        {workout?.map((w) => (
          <RigaWorkout key={w.id} workout={w} />
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border pt-4">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={80}
          placeholder="Nome del nuovo workout"
          aria-label="Nome del nuovo workout"
        />
        <Button type="submit" disabled={!nome.trim() || crea.isPending}>
          <Plus className="size-4" /> Crea
        </Button>
      </form>
    </section>
  )
}

function RigaWorkout({ workout }: { workout: WorkoutInfo }) {
  const rinomina = useRinominaWorkout()
  const elimina = useEliminaWorkout()
  const generaToken = useGeneraToken()
  const [nome, setNome] = useState<string | null>(null)

  const nUtenti = workout.n_utenti ?? 0
  const token = workout.ingest_token

  function salvaNome(e: FormEvent) {
    e.preventDefault()
    if (!nome?.trim()) return
    rinomina.mutate({ id: workout.id, nome: nome.trim() }, { onSuccess: () => setNome(null) })
  }

  return (
    <li className="space-y-3 py-4 first:pt-0">
      {nome === null ? (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{workout.nome}</p>
            <p className="text-xs text-muted-foreground">
              Codice {workout.id} · {nUtenti === 1 ? "1 utenza" : `${nUtenti} utenze`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setNome(workout.nome)}
              aria-label={`Rinomina ${workout.nome}`}
            >
              <Pencil className="size-4" />
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={nUtenti > 0}
                  title={nUtenti > 0 ? "Sposta o elimina prima le utenze collegate" : undefined}
                  aria-label={`Elimina ${workout.nome}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              }
              titolo={`Eliminare «${workout.nome}»?`}
              descrizione="Si può eliminare solo un workout senza utenze e senza dati. L'operazione non è reversibile."
              onConferma={() => elimina.mutate(workout.id)}
            />
          </div>
        </div>
      ) : (
        <form onSubmit={salvaNome} className="flex gap-2">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
            autoFocus
            aria-label="Nome del workout"
          />
          <Button type="submit" size="sm" disabled={!nome.trim() || rinomina.isPending}>
            Salva
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setNome(null)}>
            Annulla
          </Button>
        </form>
      )}

      {token ? (
        <div className="space-y-1.5">
          <Label htmlFor={`token-${workout.id}`} className="text-xs text-muted-foreground">
            Token Samsung Health
          </Label>
          <div className="flex gap-2">
            <Input id={`token-${workout.id}`} readOnly value={token} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={() => copia(token)} aria-label="Copia token">
              <Copy className="size-4" />
            </Button>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" size="icon" aria-label="Rigenera token">
                  <RefreshCw className="size-4" />
                </Button>
              }
              titolo="Rigenerare il token?"
              descrizione="Il telefono configurato con il token attuale smette di sincronizzare finché non inserisci quello nuovo in HC Webhook."
              testoConferma="Rigenera"
              onConferma={() => generaToken.mutate(workout.id)}
            />
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => generaToken.mutate(workout.id)}
          disabled={generaToken.isPending}
        >
          <KeyRound className="size-4" /> Attiva la sincronizzazione Samsung Health
        </Button>
      )}
    </li>
  )
}

function SezioneUtenze({ io }: { io: Utente | null }) {
  const { data: utenti } = useUtentiElenco()
  const { data: workout } = useWorkoutElenco()
  const elimina = useEliminaUtente()
  const [dialogo, setDialogo] = useState<Utente | "nuova" | null>(null)

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Utenze</h2>
        <Button size="sm" onClick={() => setDialogo("nuova")} disabled={!workout?.length}>
          <UserPlus className="size-4" /> Nuova utenza
        </Button>
      </div>

      <ul className="divide-y divide-border">
        {utenti?.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0 space-y-1.5">
              <p className="truncate font-medium">
                {u.username}
                {u.id === io?.id && <span className="font-normal text-muted-foreground"> (tu)</span>}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={u.admin ? "default" : "secondary"}>{etichettaRuolo(u.ruolo)}</Badge>
                <Badge variant="outline">{u.workout.nome}</Badge>
                {u.usa_assistente && <Badge variant="outline">Assistente AI</Badge>}
                {!u.attivo && <Badge variant="destructive">Disattivata</Badge>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => setDialogo(u)} aria-label={`Modifica ${u.username}`}>
                <Pencil className="size-4" />
              </Button>
              {u.id !== io?.id && (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Elimina ${u.username}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  }
                  titolo={`Eliminare «${u.username}»?`}
                  descrizione="Vengono cancellate l'utenza e le sue conversazioni con l'assistente. I dati del workout restano."
                  onConferma={() => elimina.mutate(u.id)}
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      <DialogoUtente
        aperto={dialogo !== null}
        utente={dialogo === "nuova" ? null : dialogo}
        workout={workout ?? []}
        io={io}
        onChiudi={() => setDialogo(null)}
      />
    </section>
  )
}

function DialogoUtente({
  aperto,
  utente,
  workout,
  io,
  onChiudi,
}: {
  aperto: boolean
  /** null = nuova utenza. */
  utente: Utente | null
  workout: WorkoutInfo[]
  io: Utente | null
  onChiudi: () => void
}) {
  const crea = useCreaUtente()
  const modifica = useModificaUtente()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [ruolo, setRuolo] = useState<Ruolo>("standard")
  const [workoutId, setWorkoutId] = useState("")
  const [ai, setAi] = useState(false)
  const [attivo, setAttivo] = useState(true)

  const sonoIo = utente !== null && utente.id === io?.id

  useEffect(() => {
    if (!aperto) return
    setUsername(utente?.username ?? "")
    setPassword("")
    setRuolo(utente?.ruolo ?? "standard")
    setWorkoutId(String(utente?.workout.id ?? workout[0]?.id ?? ""))
    setAi(utente?.ai_abilitata ?? false)
    setAttivo(utente?.attivo ?? true)
  }, [aperto, utente, workout])

  function salva(e: FormEvent) {
    e.preventDefault()
    const dati: DatiUtente = {
      username: username.trim(),
      ruolo,
      workout_id: Number(workoutId),
      ai_abilitata: ruolo !== "allenatore" && ai,
      attivo,
    }
    if (password) dati.password = password

    const opzioni = {
      onSuccess: (salvata: Utente) => {
        onChiudi()
        // Cambiare la propria utenza (workout, assistente) cambia cosa si vede
        // in tutta l'app: si riparte da capo invece di rincorrere ogni cache.
        if (salvata.id === io?.id) window.location.reload()
      },
    }
    if (utente) modifica.mutate({ id: utente.id, dati }, opzioni)
    else crea.mutate(dati, opzioni)
  }

  const descrizioneRuolo = RUOLI.find((r) => r.valore === ruolo)?.descrizione

  return (
    <Dialog open={aperto} onOpenChange={(a) => !a && onChiudi()}>
      <DialogContent>
        <form onSubmit={salva} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{utente ? `Modifica «${utente.username}»` : "Nuova utenza"}</DialogTitle>
            <DialogDescription>
              Il workout decide quali dati vede l'utenza, il ruolo cosa ci può fare.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="utenza-username">Nome utente</Label>
            <Input
              id="utenza-username"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={80}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="utenza-password">{utente ? "Nuova password" : "Password"}</Label>
            <Input
              id="utenza-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required={!utente}
              placeholder={utente ? "Lascia vuoto per non cambiarla" : "Almeno 8 caratteri"}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="utenza-ruolo">Ruolo</Label>
              <Select value={ruolo} onValueChange={(v) => setRuolo(v as Ruolo)} disabled={sonoIo}>
                <SelectTrigger id="utenza-ruolo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUOLI.map((r) => (
                    <SelectItem key={r.valore} value={r.valore}>
                      {r.etichetta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="utenza-workout">Workout</Label>
              <Select value={workoutId} onValueChange={setWorkoutId}>
                <SelectTrigger id="utenza-workout" className="w-full">
                  <SelectValue placeholder="Scegli un workout" />
                </SelectTrigger>
                <SelectContent>
                  {workout.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {descrizioneRuolo && <p className="-mt-2 text-xs text-muted-foreground">{descrizioneRuolo}</p>}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={ruolo !== "allenatore" && ai}
              disabled={ruolo === "allenatore"}
              onChange={(e) => setAi(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border accent-primary"
            />
            <span>
              Assistente AI
              <span className="block text-xs text-muted-foreground">
                {ruolo === "allenatore"
                  ? "Non disponibile per il ruolo allenatore."
                  : "Mostra la sezione Assistente AI a questa utenza."}
              </span>
            </span>
          </label>

          {utente && !sonoIo && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={attivo}
                onChange={(e) => setAttivo(e.target.checked)}
                className="mt-0.5 size-4 rounded border-border accent-primary"
              />
              <span>
                Utenza attiva
                <span className="block text-xs text-muted-foreground">
                  Un'utenza disattivata non può accedere, ma resta nell'elenco.
                </span>
              </span>
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onChiudi}>
              Annulla
            </Button>
            <Button type="submit" disabled={crea.isPending || modifica.isPending || !workoutId}>
              Salva
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
