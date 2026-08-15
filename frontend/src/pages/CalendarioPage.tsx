import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CalendarGrid } from "@/components/calendario/CalendarGrid"
import { useMeseCalendario } from "@/hooks/useCalendario"
import { useSchedeElenco } from "@/hooks/useSchede"
import { useAvviaSessione } from "@/hooks/useSessioni"
import { useAppContext } from "@/hooks/useAppContext"

const NOMI_MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
]

export function CalendarioPage() {
  const oggi = new Date()
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [mese, setMese] = useState(oggi.getMonth() + 1)

  const { data: context } = useAppContext()
  const { data: datiMese } = useMeseCalendario(anno, mese)
  const { data: schede } = useSchedeElenco(true)
  const avvia = useAvviaSessione()
  const navigate = useNavigate()

  const [schedaScelta, setSchedaScelta] = useState<string>("")

  function cambiaMese(delta: number) {
    let nuovoMese = mese + delta
    let nuovoAnno = anno
    if (nuovoMese < 1) { nuovoMese = 12; nuovoAnno -= 1 }
    if (nuovoMese > 12) { nuovoMese = 1; nuovoAnno += 1 }
    setMese(nuovoMese)
    setAnno(nuovoAnno)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Calendario</h1>
        {context?.sessione_corrente ? (
          <Button onClick={() => navigate(`/sessione/${context.sessione_corrente!.id}`)}>
            Riprendi allenamento
          </Button>
        ) : (
          <div className="flex gap-2">
            <Select value={schedaScelta} onValueChange={setSchedaScelta}>
              <SelectTrigger className="w-[200px]" aria-label="Scegli scheda">
                <SelectValue placeholder="Allenamento libero" />
              </SelectTrigger>
              <SelectContent>
                {schede?.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => avvia.mutate(schedaScelta ? Number(schedaScelta) : null)}
              disabled={avvia.isPending}
            >
              <Play className="size-4" /> Avvia
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" size="icon-sm" onClick={() => cambiaMese(-1)} aria-label="Mese precedente">
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="font-heading text-lg font-semibold">
            {NOMI_MESI[mese - 1]} {anno}
            {datiMese && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · {datiMese.totale_mese} allenamenti
              </span>
            )}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={() => cambiaMese(1)} aria-label="Mese successivo">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {datiMese && <CalendarGrid mese={datiMese} oggi={context?.oggi ?? ""} />}
      </div>
    </div>
  )
}
