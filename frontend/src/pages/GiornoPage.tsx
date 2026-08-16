import { useState, type FormEvent } from "react"
import { Link, useParams } from "react-router-dom"
import { Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { dataIt, numeroIt } from "@/lib/format"
import { useGiorno } from "@/hooks/useCalendario"
import { useEliminaSessione, useModificaSessione } from "@/hooks/useSessioni"
import { useSchedeElenco } from "@/hooks/useSchede"
import type { Sessione } from "@/api/sessioni"

function SchedaModificaRapida({ sessione }: { sessione: Sessione }) {
  const { data: schede } = useSchedeElenco()
  const modifica = useModificaSessione()

  const [durata, setDurata] = useState(sessione.durata_minuti?.toString() ?? "")
  const [note, setNote] = useState(sessione.note_generali)
  const [schedaId, setSchedaId] = useState(sessione.scheda_id?.toString() ?? "0")

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    modifica.mutate({
      id: sessione.id,
      dati: {
        durata_minuti: durata ? Number(durata) : null,
        note_generali: note,
        scheda_id: schedaId === "0" ? null : Number(schedaId),
      },
    })
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-primary hover:underline">Modifica rapida</summary>
      <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-2 gap-2">
        <Input
          inputMode="numeric"
          placeholder="Durata (min)"
          value={durata}
          onChange={(e) => setDurata(e.target.value)}
        />
        <Select value={schedaId} onValueChange={setSchedaId}>
          <SelectTrigger className="w-full" aria-label="Scheda">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Allenamento libero</SelectItem>
            {schede?.map((s) => (
              <SelectItem key={s.id} value={s.id.toString()}>
                {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="col-span-2"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={modifica.isPending} className="col-span-2">
          Salva
        </Button>
      </form>
    </details>
  )
}

function SessioneCard({ sessione }: { sessione: Sessione }) {
  const elimina = useEliminaSessione()

  const perEsercizio = new Map<string, typeof sessione.serie>()
  for (const serie of sessione.serie ?? []) {
    const lista = perEsercizio.get(serie.esercizio.nome) ?? []
    lista.push(serie)
    perEsercizio.set(serie.esercizio.nome, lista)
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-heading text-lg font-semibold">{sessione.nome_scheda}</h3>
          <p className="text-xs text-muted-foreground">
            {sessione.durata_minuti ? `${sessione.durata_minuti} min · ` : ""}
            {sessione.n_serie} serie · {numeroIt(sessione.volume_kg)} kg
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!sessione.completata && <Badge variant="outline">In corso</Badge>}
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Elimina sessione">
                <Trash2 className="size-4" />
              </Button>
            }
            titolo="Eliminare questo allenamento?"
            descrizione="Tutte le serie registrate andranno perse. L'operazione non è reversibile."
            onConferma={() => elimina.mutate(sessione.id)}
          />
        </div>
      </div>

      {[...perEsercizio.entries()].map(([nome, serie]) => (
        <div key={nome} className="mt-3">
          <p className="text-sm font-medium">{nome}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {serie?.map((s) => (
              <span
                key={s.id}
                className={
                  "rounded-full border px-2 py-0.5 text-xs " +
                  (s.is_pr
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground")
                }
              >
                {s.esercizio.a_tempo
                  ? `${s.durata_secondi ?? "?"}s`
                  : `${s.peso_kg ? `${numeroIt(s.peso_kg)}kg × ` : ""}${s.ripetizioni ?? "?"}`}
                {s.is_pr ? " · PR" : ""}
              </span>
            ))}
          </div>
        </div>
      ))}

      {sessione.esercizi_saltati && sessione.esercizi_saltati.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {sessione.esercizi_saltati.length} esercizio/i saltato/i
        </p>
      )}

      {sessione.completata && (
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <Link to={`/sessione/${sessione.id}/modifica`} className="text-primary hover:underline">
            Modifica serie
          </Link>
        </div>
      )}

      <SchedaModificaRapida sessione={sessione} />
    </div>
  )
}

export function GiornoPage() {
  const { giorno } = useParams<{ giorno: string }>()
  const { data } = useGiorno(giorno ?? "")

  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">{dataIt(data.data)}</h1>
        <Button variant="outline" asChild>
          <Link to={`/sessione/manuale?data=${data.data}`}>Inserisci allenamento</Link>
        </Button>
      </div>

      {data.sessioni.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nessun allenamento in questo giorno.
        </p>
      ) : (
        <div className="space-y-4">
          {data.sessioni.map((s) => (
            <SessioneCard key={s.id} sessione={s} />
          ))}
        </div>
      )}

      {data.note_dolore.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-heading text-lg font-semibold">Dolori segnalati</h2>
          <ul className="space-y-1 text-sm">
            {data.note_dolore.map((n) => (
              <li key={n.id}>
                <span className="font-medium">{n.zona_corporea}</span>
                {n.descrizione && <span className="text-muted-foreground"> — {n.descrizione}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
