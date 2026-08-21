import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { saluteApi } from "@/api/salute"
import { ApiError } from "@/lib/api"

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

/** Le metriche generiche del periodo. L'array è già filtrato dal server: ci
 *  sono solo i tipi che hanno davvero dei valori. */
export function useMetricheSalute(giorni: number) {
  const { dal, al } = intervallo(giorni)
  return useQuery({
    queryKey: ["salute", "metriche", dal, al],
    queryFn: () => saluteApi.metriche(dal, al),
  })
}

export function usePasti(giorni: number) {
  const { dal, al } = intervallo(giorni)
  return useQuery({
    queryKey: ["salute", "pasti", dal, al],
    queryFn: () => saluteApi.pasti(dal, al),
  })
}

export function useStatoSalute() {
  return useQuery({ queryKey: ["salute", "stato"], queryFn: saluteApi.stato })
}

export function useImportaExport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => saluteApi.importa(file),
    onSuccess: (esito) => {
      // Anche "context": il primo import accende la sezione Salute, e
      // "impostazioni" perche' l'export puo' aver compilato l'altezza.
      for (const chiave of [["salute"], ["peso"], ["context"], ["impostazioni"]]) {
        queryClient.invalidateQueries({ queryKey: chiave })
      }
      const parti = [
        `${esito.sonno} notti`,
        `${esito.pasti} pasti`,
        `${esito.peso} misure di peso`,
      ]
      if (esito.altezza_cm) parti.push(`altezza ${esito.altezza_cm} cm`)
      toast.success(`Importati: ${parti.join(", ")}.`)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}
