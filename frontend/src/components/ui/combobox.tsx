import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface OpzioneCombobox {
  valore: string
  etichetta: string
  /** Riga secondaria (es. gruppo muscolare): si vede sotto e vale nella ricerca. */
  dettaglio?: string
}

/** Minuscolo e senza accenti, cosi' "panca" trova anche "Pancá" e "PANCA". */
function normalizza(testo: string): string {
  return testo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

const ordineAlfabetico = new Intl.Collator("it", { sensitivity: "base", numeric: true })

/**
 * Tendina con campo di ricerca, per gli elenchi che crescono (esercizi,
 * schede, workout). Le voci sono in ordine alfabetico e si filtrano scrivendo:
 * ogni parola digitata deve comparire nel nome o nel dettaglio, in qualunque
 * ordine. Le `opzioniFisse` restano in cima, fuori dall'ordinamento (es.
 * "Allenamento libero").
 *
 * Per gli elenchi corti e fissi (gravita' 1-5, ruoli) resta `Select`: li'
 * cercare non serve e l'ordine ha un significato.
 */
export function Combobox({
  valore,
  onChange,
  opzioni,
  opzioniFisse = [],
  segnaposto = "Scegli…",
  segnapostoRicerca = "Cerca…",
  testoVuoto = "Nessun risultato.",
  size = "default",
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
}: {
  valore: string
  onChange: (valore: string) => void
  opzioni: OpzioneCombobox[]
  opzioniFisse?: OpzioneCombobox[]
  segnaposto?: string
  segnapostoRicerca?: string
  testoVuoto?: string
  size?: "sm" | "default"
  disabled?: boolean
  className?: string
  id?: string
  "aria-label"?: string
}) {
  const [aperto, setAperto] = React.useState(false)
  const [ricerca, setRicerca] = React.useState("")
  const [attiva, setAttiva] = React.useState(0)
  const listaRef = React.useRef<HTMLDivElement>(null)
  const idLista = React.useId()

  const ordinate = React.useMemo(
    () => [...opzioni].sort((a, b) => ordineAlfabetico.compare(a.etichetta, b.etichetta)),
    [opzioni]
  )

  const visibili = React.useMemo(() => {
    const parole = normalizza(ricerca).split(/\s+/).filter(Boolean)
    const tutte = [...opzioniFisse, ...ordinate]
    if (parole.length === 0) return tutte
    return tutte.filter((o) => {
      const testo = normalizza(`${o.etichetta} ${o.dettaglio ?? ""}`)
      return parole.every((p) => testo.includes(p))
    })
  }, [ricerca, opzioniFisse, ordinate])

  const scelta = [...opzioniFisse, ...opzioni].find((o) => o.valore === valore)

  function cambiaApertura(nuovo: boolean) {
    setAperto(nuovo)
    if (nuovo) {
      setRicerca("")
      const indice = [...opzioniFisse, ...ordinate].findIndex((o) => o.valore === valore)
      setAttiva(Math.max(0, indice))
    }
  }

  function scegli(o: OpzioneCombobox) {
    onChange(o.valore)
    setAperto(false)
  }

  // La voce evidenziata da tastiera resta sempre in vista.
  React.useEffect(() => {
    if (!aperto) return
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${attiva}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [attiva, aperto])

  function gestisciTasti(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setAttiva((i) => Math.min(i + 1, visibili.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setAttiva((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const o = visibili[attiva]
      if (o) scegli(o)
    }
  }

  return (
    <PopoverPrimitive.Root open={aperto} onOpenChange={cambiaApertura} modal>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          data-size={size}
          data-placeholder={scelta ? undefined : ""}
          className={cn(
            "flex w-fit cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-input bg-input/40 py-2 pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none select-none hover:bg-input/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] dark:bg-input/30 dark:hover:bg-input/50",
            className
          )}
        >
          <span className="line-clamp-1 min-w-0">{scelta?.etichetta ?? segnaposto}</span>
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          // Il focus va al campo di ricerca, non alla prima voce: si apre e si scrive.
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).querySelector("input")?.focus()
          }}
          className="z-50 flex max-h-[min(var(--radix-popover-content-available-height),22rem)] w-(--radix-popover-trigger-width) min-w-56 flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              role="combobox"
              aria-expanded
              aria-controls={idLista}
              aria-activedescendant={visibili[attiva] ? `${idLista}-${attiva}` : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:h-9 sm:text-sm"
              placeholder={segnapostoRicerca}
              value={ricerca}
              onChange={(e) => {
                setRicerca(e.target.value)
                setAttiva(0)
              }}
              onKeyDown={gestisciTasti}
            />
          </div>
          <div
            ref={listaRef}
            id={idLista}
            role="listbox"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
          >
            {visibili.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">{testoVuoto}</p>
            ) : (
              visibili.map((o, i) => (
                <div
                  key={o.valore}
                  id={`${idLista}-${i}`}
                  role="option"
                  aria-selected={o.valore === valore}
                  data-indice={i}
                  data-attiva={i === attiva ? "" : undefined}
                  onPointerMove={() => setAttiva(i)}
                  // mousedown e non click: il campo di ricerca non perde il focus
                  // prima che la scelta venga registrata.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => scegli(o)}
                  className="relative flex min-h-11 w-full cursor-pointer flex-col justify-center rounded-md py-1 pr-8 pl-1.5 text-sm select-none data-attiva:bg-accent data-attiva:text-accent-foreground sm:min-h-8"
                >
                  <span className="line-clamp-1">{o.etichetta}</span>
                  {o.dettaglio && (
                    <span className="line-clamp-1 text-xs text-muted-foreground in-data-attiva:text-accent-foreground/80">
                      {o.dettaglio}
                    </span>
                  )}
                  {o.valore === valore && (
                    <CheckIcon className="pointer-events-none absolute right-2 size-4" aria-hidden />
                  )}
                </div>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
