import { useQuery } from "@tanstack/react-query"
import { statisticheApi } from "@/api/statistiche"

export function useRiepilogo() {
  return useQuery({ queryKey: ["statistiche", "riepilogo"], queryFn: statisticheApi.riepilogo })
}

export function useVolume() {
  return useQuery({ queryKey: ["statistiche", "volume"], queryFn: statisticheApi.volume })
}

export function useRipetizioni() {
  return useQuery({
    queryKey: ["statistiche", "ripetizioni"],
    queryFn: statisticheApi.ripetizioni,
  })
}

export function useFrequenza() {
  return useQuery({ queryKey: ["statistiche", "frequenza"], queryFn: statisticheApi.frequenza })
}

export function useAderenza() {
  return useQuery({ queryKey: ["statistiche", "aderenza"], queryFn: statisticheApi.aderenza })
}

export function useEserciziConDati() {
  return useQuery({
    queryKey: ["statistiche", "esercizi-con-dati"],
    queryFn: statisticheApi.eserciziConDati,
  })
}

export function useProgressione(esercizioId: number | null) {
  return useQuery({
    queryKey: ["statistiche", "progressione", esercizioId],
    queryFn: () => statisticheApi.progressione(esercizioId as number),
    enabled: esercizioId !== null,
  })
}

export function usePr(storico = false) {
  return useQuery({
    queryKey: ["pr", storico],
    queryFn: () => statisticheApi.pr(storico),
  })
}
