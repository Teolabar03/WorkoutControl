import { useState } from "react"
import { Play, Square, Trophy, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { numeroIt, parseNumeroIt, tempoMmss } from "@/lib/format"
import { useEliminaSerieAttiva, useRegistraSerie } from "@/hooks/useSessioneAttiva"
import { useCountUpTimer } from "@/hooks/useCountUpTimer"
import type { BloccoAttivo } from "@/api/sessioni"

export function ExerciseBlock({
  sessioneId,
  blocco,
  onSerieRegistrata,
}: {
  sessioneId: number
  blocco: BloccoAttivo
  onSerieRegistrata: (timerSecondi: number, nuovoPr: boolean) => void
}) {
  const { voce } = blocco
  const esercizio = voce.esercizio

  const registra = useRegistraSerie(sessioneId)
  const elimina = useEliminaSerieAttiva(sessioneId)
  const cronometro = useCountUpTimer()

  const [peso, setPeso] = useState(voce.peso_suggerito_kg ? numeroIt(voce.peso_suggerito_kg) : "")
  const [reps, setReps] = useState(voce.rep_target?.toString() ?? "")
  const [durata, setDurata] = useState(voce.durata_target_sec?.toString() ?? "")
  const [nota, setNota] = useState("")
  const [festeggia, setFesteggia] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const fatte = blocco.serie.length
  const completo = fatte >= voce.serie_target

  function registraSerie() {
    setErrore(null)
    registra.mutate(
      {
        esercizio_scheda_id: voce.id,
        peso_kg: esercizio.usa_peso ? parseNumeroIt(peso) : null,
        ripetizioni: !esercizio.a_tempo ? parseNumeroIt(reps) : null,
        durata_secondi: esercizio.a_tempo ? parseNumeroIt(durata) : null,
        note: nota.trim(),
      },
      {
        onSuccess: (risultato) => {
          setNota("")
          if (risultato.nuovo_pr) {
            setFesteggia(true)
            setTimeout(() => setFesteggia(false), 2500)
          }
          onSerieRegistrata(risultato.timer_secondi || voce.timer_effettivo, risultato.nuovo_pr)
        },
        onError: (err) => setErrore(err instanceof Error ? err.message : "Errore."),
      }
    )
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      registraSerie()
    }
  }

  function toggleCronometro() {
    if (cronometro.attivo) {
      const secondiFatti = cronometro.ferma()
      setDurata(String(secondiFatti))
    } else {
      setDurata("")
      cronometro.avvia()
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-shadow",
        completo ? "border-primary/50" : "border-border",
        festeggia && "ring-2 ring-accent motion-reduce:ring-0"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-heading text-lg font-semibold">{esercizio.nome}</h3>
          <p className="text-xs text-muted-foreground">
            {fatte}/{voce.serie_target} serie
            {blocco.record ? ` · record ${blocco.record}` : ""}
          </p>
        </div>
        {completo && <Trophy className="size-5 shrink-0 text-primary" aria-hidden="true" />}
      </div>

      {blocco.serie.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {blocco.serie.map((s) => (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                s.is_pr ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"
              )}
            >
              <span className="font-medium text-foreground">{s.numero_serie}</span>
              {s.peso_kg ? `${numeroIt(s.peso_kg)}kg × ` : ""}
              {s.durata_secondi ? `${s.durata_secondi}s` : s.ripetizioni}
              {s.is_pr ? " · PR" : ""}
              <button
                type="button"
                onClick={() => elimina.mutate(s.id)}
                aria-label={`Elimina serie ${s.numero_serie}`}
                className="-my-2 ml-0.5 rounded-full p-2 hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {esercizio.usa_peso && (
          <div className="w-20">
            <Input
              inputMode="decimal"
              placeholder="kg"
              aria-label="Peso"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        )}
        {esercizio.a_tempo ? (
          <div className="flex items-end gap-1">
            <div className="w-20">
              <Input
                inputMode="numeric"
                placeholder="sec"
                aria-label="Durata in secondi"
                value={cronometro.attivo ? tempoMmss(cronometro.secondi) : durata}
                onChange={(e) => setDurata(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={cronometro.attivo}
              />
            </div>
            <Button
              type="button"
              variant={cronometro.attivo ? "destructive" : "outline"}
              size="icon"
              onClick={toggleCronometro}
              aria-label={cronometro.attivo ? "Ferma cronometro" : "Avvia cronometro"}
              className={cn(!cronometro.attivo && "bg-transparent")}
            >
              {cronometro.attivo ? (
                <Square className="size-4 motion-safe:animate-pulse motion-reduce:animate-none" />
              ) : (
                <Play className="size-4" />
              )}
            </Button>
          </div>
        ) : (
          <div className="w-20">
            <Input
              inputMode="numeric"
              placeholder="reps"
              aria-label="Ripetizioni"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        )}
        <div className="min-w-[120px] flex-1">
          <Input
            placeholder="Nota (facoltativa)"
            aria-label="Nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Button onClick={registraSerie} disabled={registra.isPending}>
          Registra
        </Button>
      </div>

      {errore && <p className="mt-2 text-sm text-destructive">{errore}</p>}
    </div>
  )
}
