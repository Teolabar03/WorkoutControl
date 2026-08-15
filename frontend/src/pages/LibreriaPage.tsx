import { useMemo, useState, type FormEvent } from "react"
import { Archive, ArchiveRestore } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useArchiviaEsercizioLibreria, useCreaEsercizioLibreria, useLibreria } from "@/hooks/useSchede"
import type { TipoCarico, TipoMisura } from "@/api/schede"

const TIPI_CARICO: { valore: TipoCarico; etichetta: string }[] = [
  { valore: "peso", etichetta: "Peso (manubri, ecc.)" },
  { valore: "elastico", etichetta: "Elastico" },
  { valore: "corpo_libero", etichetta: "Corpo libero" },
]
const TIPI_MISURA: { valore: TipoMisura; etichetta: string }[] = [
  { valore: "reps", etichetta: "Ripetizioni" },
  { valore: "tempo", etichetta: "Tempo" },
]

export function LibreriaPage() {
  const { data: esercizi } = useLibreria()
  const archivia = useArchiviaEsercizioLibreria()
  const crea = useCreaEsercizioLibreria()

  const [filtroAttrezzo, setFiltroAttrezzo] = useState<string | null>(null)
  const [nome, setNome] = useState("")
  const [gruppo, setGruppo] = useState("")
  const [attrezzatura, setAttrezzatura] = useState("")
  const [tipoCarico, setTipoCarico] = useState<TipoCarico>("corpo_libero")
  const [tipoMisura, setTipoMisura] = useState<TipoMisura>("reps")

  const attrezzature = useMemo(() => {
    const set = new Set<string>()
    for (const e of esercizi ?? []) {
      for (const pezzo of e.attrezzatura.split(",")) {
        const t = pezzo.trim()
        if (t) set.add(t)
      }
    }
    return [...set].sort()
  }, [esercizi])

  const filtrati = (esercizi ?? []).filter(
    (e) => !filtroAttrezzo || e.attrezzatura.toLowerCase().includes(filtroAttrezzo.toLowerCase())
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    crea.mutate(
      { nome: nome.trim(), gruppo_muscolare: gruppo, attrezzatura, tipo_carico: tipoCarico, tipo_misura: tipoMisura },
      { onSuccess: () => { setNome(""); setGruppo(""); setAttrezzatura("") } }
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Libreria esercizi</h1>

      {attrezzature.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFiltroAttrezzo(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filtroAttrezzo === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            Tutti
          </button>
          {attrezzature.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setFiltroAttrezzo(a)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filtroAttrezzo === a
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {filtrati.map((e) => (
          <li
            key={e.id}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2.5",
              e.archiviato && "opacity-60"
            )}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{e.nome}</p>
              <p className="truncate text-xs text-muted-foreground">
                {e.gruppo_muscolare || "—"} {e.attrezzatura && `· ${e.attrezzatura}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {e.is_custom && <Badge variant="outline">custom</Badge>}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={e.archiviato ? `Ripristina ${e.nome}` : `Archivia ${e.nome}`}
                onClick={() => archivia.mutate({ id: e.id, archiviato: !e.archiviato })}
              >
                {e.archiviato ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <details className="rounded-lg border border-border bg-card p-4">
        <summary className="cursor-pointer font-heading text-lg font-semibold">
          Aggiungi esercizio custom
        </summary>
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="lib-nome">Nome</Label>
            <Input id="lib-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lib-gruppo">Gruppo muscolare</Label>
            <Input id="lib-gruppo" value={gruppo} onChange={(e) => setGruppo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lib-attrezzatura">Attrezzatura</Label>
            <Input id="lib-attrezzatura" value={attrezzatura} onChange={(e) => setAttrezzatura(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo di carico</Label>
            <Select value={tipoCarico} onValueChange={(v) => setTipoCarico(v as TipoCarico)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI_CARICO.map((t) => (
                  <SelectItem key={t.valore} value={t.valore}>
                    {t.etichetta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo di misura</Label>
            <Select value={tipoMisura} onValueChange={(v) => setTipoMisura(v as TipoMisura)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI_MISURA.map((t) => (
                  <SelectItem key={t.valore} value={t.valore}>
                    {t.etichetta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={crea.isPending} className="col-span-2">
            Aggiungi alla libreria
          </Button>
        </form>
      </details>
    </div>
  )
}
