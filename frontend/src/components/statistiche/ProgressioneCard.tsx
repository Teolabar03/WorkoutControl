import { useEffect, useState } from "react"
import { ChartCard } from "@/components/statistiche/ChartCard"
import { LineTrendChart } from "@/components/statistiche/LineTrendChart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEserciziConDati, useProgressione } from "@/hooks/useStatistiche"

export function ProgressioneCard() {
  const { data: esercizi } = useEserciziConDati()
  const [esercizioId, setEsercizioId] = useState<number | null>(null)

  useEffect(() => {
    if (esercizioId === null && esercizi && esercizi.length > 0) {
      setEsercizioId(esercizi[0].id)
    }
  }, [esercizi, esercizioId])

  const { data: progressione } = useProgressione(esercizioId)

  if (esercizi && esercizi.length === 0) {
    return (
      <ChartCard titolo="Progressione esercizio" vuoto>
        <div />
      </ChartCard>
    )
  }

  return (
    <ChartCard
      titolo="Progressione esercizio"
      azioni={
        <Select
          value={esercizioId?.toString() ?? ""}
          onValueChange={(v) => setEsercizioId(Number(v))}
        >
          <SelectTrigger size="sm" className="w-[180px]" aria-label="Scegli esercizio">
            <SelectValue placeholder="Scegli esercizio" />
          </SelectTrigger>
          <SelectContent>
            {esercizi?.map((e) => (
              <SelectItem key={e.id} value={e.id.toString()}>
                {e.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      vuoto={!progressione || progressione.labels.length === 0}
    >
      {progressione && (
        <LineTrendChart
          labels={progressione.labels}
          valori={progressione.valori}
          unita={progressione.unita}
        />
      )}
    </ChartCard>
  )
}
