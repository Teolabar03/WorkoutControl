import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { saluteApi } from "@/api/salute"
import { ApiError } from "@/lib/api"
import { periodoValido, type Periodo } from "@/lib/periodo"

export function useSalute(periodo: Periodo) {
  return useQuery({
    queryKey: ["salute", periodo.dal, periodo.al],
    queryFn: () => saluteApi.giorni(periodo.dal, periodo.al),
    enabled: periodoValido(periodo),
  })
}

/** Le metriche generiche del periodo. L'array è già filtrato dal server: ci
 *  sono solo i tipi che hanno davvero dei valori. */
export function useMetricheSalute(periodo: Periodo) {
  return useQuery({
    queryKey: ["salute", "metriche", periodo.dal, periodo.al],
    queryFn: () => saluteApi.metriche(periodo.dal, periodo.al),
    enabled: periodoValido(periodo),
  })
}

export function usePasti(periodo: Periodo) {
  return useQuery({
    queryKey: ["salute", "pasti", periodo.dal, periodo.al],
    queryFn: () => saluteApi.pasti(periodo.dal, periodo.al),
    enabled: periodoValido(periodo),
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
