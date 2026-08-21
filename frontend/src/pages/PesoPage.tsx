import { useEffect, useState, type FormEvent } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChartCard } from "@/components/statistiche/ChartCard"
import { LineTrendChart } from "@/components/statistiche/LineTrendChart"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { dataIt, numeroIt, parseNumeroIt } from "@/lib/format"
import { useEliminaPeso, useNuovoPeso, usePesoElenco } from "@/hooks/usePeso"
import { useImpostazioni, useModificaImpostazioni } from "@/hooks/useImpostazioni"

/** Le fasce dell'OMS, giusto per dare un senso al numero. */
function fasciaBmi(bmi: number): string {
  if (bmi < 18.5) return "sottopeso"
  if (bmi < 25) return "normopeso"
  if (bmi < 30) return "sovrappeso"
  return "obesità"
}

export function PesoPage() {
  const { data: misure } = usePesoElenco()
  const nuovoPeso = useNuovoPeso()
  const eliminaPeso = useEliminaPeso()

  const { data: impostazioni } = useImpostazioni()
  const modificaImpostazioni = useModificaImpostazioni()
  const [altezza, setAltezza] = useState("")

  useEffect(() => {
    // Zero vuol dire "non impostata": il campo resta vuoto invece di mostrare 0.
    if (impostazioni) setAltezza(impostazioni.altezza_cm ? String(impostazioni.altezza_cm) : "")
  }, [impostazioni])

  const oggi = new Date().toISOString().slice(0, 10)
  const [data, setData] = useState(oggi)
  const [valore, setValore] = useState("")
  const [note, setNote] = useState("")

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const kg = parseNumeroIt(valore)
    if (!kg || kg <= 0) return
    nuovoPeso.mutate(
      { valore_kg: kg, data, note },
      { onSuccess: () => setValore("") }
    )
  }

  function salvaAltezza() {
    const cm = Math.round(parseNumeroIt(altezza) ?? 0)
    if (cm === (impostazioni?.altezza_cm ?? 0)) return
    modificaImpostazioni.mutate({ altezza_cm: cm })
  }

  const ordinati = [...(misure ?? [])].sort((a, b) => a.data.localeCompare(b.data))
  const ultima = ordinati.at(-1)
  const altezzaCm = impostazioni?.altezza_cm ?? 0
  const bmi = ultima && altezzaCm ? ultima.valore_kg / (altezzaCm / 100) ** 2 : null

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Peso corporeo</h1>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 sm:items-end">
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            salvaAltezza()
          }}
        >
          <Label htmlFor="peso-altezza">Altezza (cm)</Label>
          <Input
            id="peso-altezza"
            inputMode="numeric"
            placeholder="es. 178"
            value={altezza}
            onChange={(e) => setAltezza(e.target.value)}
            onBlur={salvaAltezza}
          />
        </form>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Indice di massa corporea</p>
          {bmi === null ? (
            <p className="text-sm text-muted-foreground">
              {altezzaCm ? "Registra un peso per vederlo." : "Inserisci l'altezza per vederlo."}
            </p>
          ) : (
            <p className="font-heading text-2xl font-semibold tabular-nums">
              {numeroIt(Number(bmi.toFixed(1)))}{" "}
              <span className="text-sm font-normal text-muted-foreground">{fasciaBmi(bmi)}</span>
            </p>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4 sm:items-end"
      >
        <div className="space-y-1.5">
          <Label htmlFor="peso-data">Data</Label>
          <Input id="peso-data" type="date" value={data} max={oggi} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="peso-valore">Peso (kg)</Label>
          <Input
            id="peso-valore"
            inputMode="decimal"
            placeholder="es. 75,5"
            value={valore}
            onChange={(e) => setValore(e.target.value)}
            required
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="peso-note">Note</Label>
          <Input id="peso-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button type="submit" disabled={nuovoPeso.isPending} className="col-span-2 sm:col-span-4">
          Registra peso
        </Button>
      </form>

      <ChartCard titolo="Andamento" vuoto={ordinati.length === 0}>
        <LineTrendChart
          labels={ordinati.map((m) => m.data)}
          valori={ordinati.map((m) => m.valore_kg)}
          unita="kg"
        />
      </ChartCard>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 font-heading text-lg font-semibold">Storico</h2>
        {!misure || misure.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessuna misura registrata.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Peso</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {misure.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{dataIt(m.data)}</TableCell>
                    <TableCell className="tabular-nums">{numeroIt(m.valore_kg)} kg</TableCell>
                    <TableCell className="text-muted-foreground">{m.note || "—"}</TableCell>
                    <TableCell>
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Elimina misura del ${dataIt(m.data)}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        }
                        titolo="Eliminare questa misura?"
                        descrizione={`Peso del ${dataIt(m.data)}: ${numeroIt(m.valore_kg)} kg. L'operazione non è reversibile.`}
                        onConferma={() => eliminaPeso.mutate(m.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
