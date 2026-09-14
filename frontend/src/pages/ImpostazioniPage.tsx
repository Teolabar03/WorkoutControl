import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { ChevronRight, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCambiaModello, useModelliAi, useAvviaOllama, useStatoOllama } from "@/hooks/useChat"
import { useCambiaModelloOllama, useImpostazioni, useModificaImpostazioni } from "@/hooks/useImpostazioni"
import { useAppContext } from "@/hooks/useAppContext"
import { usePermessi } from "@/hooks/useAuth"
import { AccountCard } from "@/components/impostazioni/AccountCard"
import { SamsungHealthCard } from "@/components/impostazioni/SamsungHealthCard"
import { ObiettiviCard } from "@/components/impostazioni/ObiettiviCard"
import { VersioneAppCard } from "@/components/impostazioni/VersioneAppCard"
import { ServerCard } from "@/components/impostazioni/ServerCard"

export function ImpostazioniPage() {
  const { admin, puoScrivere } = usePermessi()
  const { data: context } = useAppContext()
  const { data: impostazioni } = useImpostazioni()
  const modifica = useModificaImpostazioni()

  // Modello AI e Ollama valgono per tutta l'installazione: li gestisce l'admin,
  // e per gli altri non vale nemmeno la pena chiederli al server.
  const { data: catalogo } = useModelliAi(admin)
  const cambiaModello = useCambiaModello()

  const { data: statoOllama } = useStatoOllama(admin)
  const avviaOllama = useAvviaOllama()
  const cambiaModelloOllama = useCambiaModelloOllama()

  const [timer, setTimer] = useState("")
  const [nSessioni, setNSessioni] = useState("")
  const [attrezzatura, setAttrezzatura] = useState("")

  useEffect(() => {
    if (impostazioni) {
      setTimer(impostazioni.timer_default_sec.toString())
      setNSessioni(impostazioni.analisi_n_sessioni.toString())
      setAttrezzatura(impostazioni.attrezzatura_disponibile)
    }
  }, [impostazioni])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    modifica.mutate({
      timer_default_sec: Number(timer),
      analisi_n_sessioni: Number(nSessioni),
      attrezzatura_disponibile: attrezzatura,
    })
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Impostazioni</h1>

      {admin && (
        <Link
          to="/impostazioni/utenze"
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="flex items-center gap-3">
            <Users className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="block font-heading text-lg font-semibold">Utenze</span>
              <span className="block text-sm text-muted-foreground">Utenze, ruoli e workout</span>
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}

      <AccountCard />

      {/* Le preferenze sono dati del workout: l'allenatore le usa senza cambiarle. */}
      {puoScrivere && (
        <>
          <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold">Preferenze</h2>
            <div className="space-y-1.5">
              <Label htmlFor="imp-timer">Timer di recupero di default (5-900 sec)</Label>
              <Input id="imp-timer" inputMode="numeric" value={timer} onChange={(e) => setTimer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp-n">Allenamenti recenti nel contesto AI (1-100)</Label>
              <Input id="imp-n" inputMode="numeric" value={nSessioni} onChange={(e) => setNSessioni(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp-attrezzatura">Attrezzatura a disposizione</Label>
              <Textarea
                id="imp-attrezzatura"
                rows={4}
                maxLength={1000}
                value={attrezzatura}
                onChange={(e) => setAttrezzatura(e.target.value)}
                placeholder="Es. due manubri da 1.5 kg, due da 0.5 kg, un elastico, un tappetino"
              />
              <p className="text-sm text-muted-foreground">
                L'assistente AI la legge prima di rispondere: non ti consiglia attrezzi che non hai. Lascia vuoto se
                preferisci che la deduca dagli esercizi in libreria.
              </p>
            </div>
            <Button type="submit" disabled={modifica.isPending}>
              Salva
            </Button>
          </form>

          <ObiettiviCard />

          <SamsungHealthCard />
        </>
      )}

      <VersioneAppCard />

      <ServerCard />

      {admin && context?.ai_configurato && catalogo && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">Assistente AI</h2>
            <Badge variant="secondary">{catalogo.provider}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Modello attivo: {catalogo.modello_attivo}</p>

          <div className="space-y-1.5">
            <Label>Modello</Label>
            <Select
              value={catalogo.attivo || "auto"}
              onValueChange={(v) => cambiaModello.mutate(v === "auto" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Scelta automatica</SelectItem>
                {catalogo.gruppi.map((gruppo) => (
                  <SelectGroup key={gruppo.etichetta}>
                    <SelectLabel>{gruppo.etichetta}</SelectLabel>
                    {gruppo.modelli.map((m) => (
                      <SelectItem key={m.chiave} value={m.chiave}>
                        {m.etichetta}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {admin && statoOllama?.configurato && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">Ollama locale</h2>
            <Badge variant={statoOllama.server_attivo ? "secondary" : "outline"}>
              {statoOllama.server_attivo ? "Attivo" : "Spento"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {statoOllama.host} · {statoOllama.modello}
          </p>

          {!statoOllama.server_attivo && (
            <Button size="sm" variant="outline" onClick={() => avviaOllama.mutate()} disabled={avviaOllama.isPending}>
              Avvia Ollama
            </Button>
          )}

          {statoOllama.modelli_disponibili.length > 0 && (
            <div className="space-y-1.5">
              <Label>Modello locale</Label>
              <Select
                value={statoOllama.modello_scelto || "default"}
                onValueChange={(v) => cambiaModelloOllama.mutate(v === "default" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Predefinito ({statoOllama.modello_predefinito})</SelectItem>
                  {statoOllama.modelli_disponibili.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
