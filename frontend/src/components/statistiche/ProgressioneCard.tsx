import { useEffect, useState } from "react"
import { ChartCard } from "@/components/statistiche/ChartCard"
import { LineTrendChart } from "@/components/statistiche/LineTrendChart"
import { Combobox } from "@/components/ui/combobox"
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
        <Combobox
          size="sm"
          className="w-[180px]"
          aria-label="Scegli esercizio"
          valore={esercizioId?.toString() ?? ""}
          onChange={(v) => setEsercizioId(Number(v))}
          opzioni={(esercizi ?? []).map((e) => ({ valore: e.id.toString(), etichetta: e.nome }))}
          segnaposto="Scegli esercizio"
          segnapostoRicerca="Cerca esercizio…"
          testoVuoto="Nessun esercizio trovato."
        />
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
