import { useQuery } from "@tanstack/react-query"
import { calendarioApi } from "@/api/calendario"

export function useMeseCalendario(anno: number, mese: number) {
  return useQuery({
    queryKey: ["calendario", anno, mese],
    queryFn: () => calendarioApi.mese(anno, mese),
  })
}

export function useGiorno(data: string) {
  return useQuery({
    queryKey: ["calendario", "giorno", data],
    queryFn: () => calendarioApi.giorno(data),
  })
}
