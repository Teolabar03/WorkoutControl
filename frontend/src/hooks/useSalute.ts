import { useQuery } from "@tanstack/react-query"
import { saluteApi } from "@/api/salute"

/** Intervallo che finisce oggi, in date ISO, come lo vuole l'API. */
function intervallo(giorni: number) {
  const al = new Date()
  const dal = new Date()
  dal.setDate(dal.getDate() - (giorni - 1))
  return { dal: dal.toISOString().slice(0, 10), al: al.toISOString().slice(0, 10) }
}

export function useSalute(giorni: number) {
  const { dal, al } = intervallo(giorni)
  return useQuery({
    queryKey: ["salute", dal, al],
    queryFn: () => saluteApi.giorni(dal, al),
  })
}

export function useStatoSalute() {
  return useQuery({ queryKey: ["salute", "stato"], queryFn: saluteApi.stato })
}
