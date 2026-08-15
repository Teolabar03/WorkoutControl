import { Minus, Play, Plus, Square, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { numeroIt, tempoMmss } from "@/lib/format"
import { useCountUpTimer } from "@/hooks/useCountUpTimer"
import type { EsercizioLibreria } from "@/api/schede"

export interface RigaForm {
  peso: string
  valore: string
  nota: string
}

export interface BloccoForm {
  chiave: string
  esercizioSchedaId: number | null
  esercizioLibreriaId: number
  esercizio: EsercizioLibreria
  saltato: boolean
  motivoSaltato: string
  righe: RigaForm[]
}

function StepperInput({
  value,
  onChange,
  placeholder,
  passo,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  passo: number
  ariaLabel: string
}) {
  function variazione(delta: number) {
    const attuale = parseFloat(value.replace(",", ".")) || 0
    onChange(numeroIt(Math.max(0, Math.round((attuale + delta) * 100) / 100)))
  }
  return (
    <div className="flex items-center">
      <Button type="button" variant="outline" size="icon-sm" className="rounded-r-none" onClick={() => variazione(-passo)} aria-label={`Diminuisci ${ariaLabel}`}>
        <Minus className="size-3" />
      </Button>
      <Input
        className="h-8 w-14 rounded-none border-x-0 text-center"
        inputMode="decimal"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button type="button" variant="outline" size="icon-sm" className="rounded-l-none" onClick={() => variazione(passo)} aria-label={`Aumenta ${ariaLabel}`}>
        <Plus className="size-3" />
      </Button>
    </div>
  )
}

function RigaEsercizio({
  esercizio,
  indice,
  riga,
  onCambia,
  onRimuovi,
}: {
  esercizio: EsercizioLibreria
  indice: number
  riga: RigaForm
  onCambia: (campo: keyof RigaForm, valore: string) => void
  onRimuovi: () => void
}) {
  const cronometro = useCountUpTimer()

  function toggleCronometro() {
    if (cronometro.attivo) {
      onCambia("valore", String(cronometro.ferma()))
    } else {
      onCambia("valore", "")
      cronometro.avvia()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-4 text-xs text-muted-foreground">{indice + 1}</span>
      {esercizio.usa_peso && (
        <StepperInput
          value={riga.peso}
          onChange={(v) => onCambia("peso", v)}
          placeholder="kg"
          passo={esercizio.tipo_carico === "peso" ? 0.5 : 1}
          ariaLabel={`Peso serie ${indice + 1}`}
        />
      )}
      {esercizio.a_tempo ? (
        <div className="flex items-center gap-1">
          <Input
            className="h-8 w-16 text-center"
            inputMode="numeric"
            placeholder="sec"
            aria-label={`Durata serie ${indice + 1}`}
            value={cronometro.attivo ? tempoMmss(cronometro.secondi) : riga.valore}
            onChange={(e) => onCambia("valore", e.target.value)}
            disabled={cronometro.attivo}
          />
          <Button
            type="button"
            variant={cronometro.attivo ? "destructive" : "outline"}
            size="icon-sm"
            onClick={toggleCronometro}
            aria-label={cronometro.attivo ? "Ferma cronometro" : "Avvia cronometro"}
            className={cn(!cronometro.attivo && "bg-transparent")}
          >
            {cronometro.attivo ? (
              <Square className="size-3.5 motion-safe:animate-pulse motion-reduce:animate-none" />
            ) : (
              <Play className="size-3.5" />
            )}
          </Button>
        </div>
      ) : (
        <StepperInput
          value={riga.valore}
          onChange={(v) => onCambia("valore", v)}
          placeholder="reps"
          passo={1}
          ariaLabel={`Ripetizioni serie ${indice + 1}`}
        />
      )}
      <Input
        className="h-8 min-w-[100px] flex-1"
        placeholder="Nota"
        aria-label={`Nota serie ${indice + 1}`}
        value={riga.nota}
        onChange={(e) => onCambia("nota", e.target.value)}
      />
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRimuovi} aria-label={`Rimuovi riga ${indice + 1}`}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

export function ManualBlockCard({
  blocco,
  onCambia,
}: {
  blocco: BloccoForm
  onCambia: (blocco: BloccoForm) => void
}) {
  const { esercizio } = blocco

  function aggiornaRiga(indice: number, campo: keyof RigaForm, valore: string) {
    const righe = blocco.righe.map((r, i) => (i === indice ? { ...r, [campo]: valore } : r))
    onCambia({ ...blocco, righe })
  }

  function aggiungiRiga() {
    onCambia({ ...blocco, righe: [...blocco.righe, { peso: "", valore: "", nota: "" }] })
  }

  function rimuoviRiga(indice: number) {
    onCambia({ ...blocco, righe: blocco.righe.filter((_, i) => i !== indice) })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-lg font-semibold">{esercizio.nome}</h3>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={blocco.saltato}
            onChange={(e) => onCambia({ ...blocco, saltato: e.target.checked })}
            className="size-4 rounded border-border accent-primary"
          />
          Saltato
        </label>
      </div>

      {blocco.saltato ? (
        <Input
          className="mt-3"
          placeholder="Motivo (facoltativo)"
          value={blocco.motivoSaltato}
          onChange={(e) => onCambia({ ...blocco, motivoSaltato: e.target.value })}
        />
      ) : (
        <div className="mt-3 space-y-2">
          {blocco.righe.map((riga, i) => (
            <RigaEsercizio
              key={i}
              esercizio={esercizio}
              indice={i}
              riga={riga}
              onCambia={(campo, valore) => aggiornaRiga(i, campo, valore)}
              onRimuovi={() => rimuoviRiga(i)}
            />
          ))}
          <Button type="button" variant="outline" size="sm" onClick={aggiungiRiga}>
            <Plus className="size-4" /> Riga
          </Button>
        </div>
      )}
    </div>
  )
}
