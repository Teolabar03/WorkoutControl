import { useState, type FormEvent } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { dataIt } from "@/lib/format"
import { useDiarioElenco, useEliminaNota, useNuovaNota } from "@/hooks/useDiario"

function coloreGravita(gravita: number): "secondary" | "destructive" | "outline" {
  if (gravita >= 4) return "destructive"
  if (gravita === 3) return "secondary"
  return "outline"
}

export function DiarioPage() {
  const { data: note } = useDiarioElenco()
  const nuovaNota = useNuovaNota()
  const eliminaNota = useEliminaNota()

  const oggi = new Date().toISOString().slice(0, 10)
  const [data, setData] = useState(oggi)
  const [zona, setZona] = useState("")
  const [descrizione, setDescrizione] = useState("")
  const [gravita, setGravita] = useState("1")

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!zona.trim()) return
    nuovaNota.mutate(
      { zona_corporea: zona.trim(), descrizione, gravita: Number(gravita), data },
      { onSuccess: () => { setZona(""); setDescrizione(""); setGravita("1") } }
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Diario recupero e dolori</h1>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4 sm:items-end"
      >
        <div className="space-y-1.5">
          <Label htmlFor="dolore-data">Data</Label>
          <Input id="dolore-data" type="date" value={data} max={oggi} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dolore-zona">Zona del corpo</Label>
          <Input
            id="dolore-zona"
            placeholder="es. spalla destra"
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dolore-gravita">Gravità</Label>
          <Select value={gravita} onValueChange={setGravita}>
            <SelectTrigger id="dolore-gravita" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5 sm:col-span-4">
          <Label htmlFor="dolore-descrizione">Descrizione</Label>
          <Textarea
            id="dolore-descrizione"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            placeholder="es. dolore dopo panca, migliora col riscaldamento"
          />
        </div>
        <Button type="submit" disabled={nuovaNota.isPending} className="col-span-2 sm:col-span-4">
          Aggiungi nota
        </Button>
      </form>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 font-heading text-lg font-semibold">Storico</h2>
        {!note || note.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessuna nota nel diario.</p>
        ) : (
          <ul className="divide-y divide-border">
            {note.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{n.zona_corporea}</span>
                    <Badge variant={coloreGravita(n.gravita)}>Gravità {n.gravita}</Badge>
                    <span className="text-xs text-muted-foreground">{dataIt(n.data)}</span>
                  </div>
                  {n.descrizione && (
                    <p className="mt-1 text-sm text-muted-foreground">{n.descrizione}</p>
                  )}
                </div>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Elimina nota ${n.zona_corporea}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  }
                  titolo="Eliminare questa nota?"
                  descrizione={`${n.zona_corporea} del ${dataIt(n.data)}. L'operazione non è reversibile.`}
                  onConferma={() => eliminaNota.mutate(n.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
