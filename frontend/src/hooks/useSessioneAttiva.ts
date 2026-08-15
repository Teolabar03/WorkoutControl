import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { sessioniApi, type NuovaSerie, type TerminaSessione } from "@/api/sessioni"
import { ApiError } from "@/lib/api"

export function useDettaglioSessione(id: number) {
  return useQuery({
    queryKey: ["sessioni", id],
    queryFn: () => sessioniApi.dettaglio(id),
    refetchOnWindowFocus: false,
  })
}

export function useRegistraSerie(sessioneId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dati: NuovaSerie) => sessioniApi.registraSerie(sessioneId, dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessioni", sessioneId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore di rete: la serie non è stata salvata."),
  })
}

export function useEliminaSerieAttiva(sessioneId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (serieId: number) => sessioniApi.eliminaSerie(serieId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessioni", sessioneId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}

export function useTerminaSessione(sessioneId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dati: TerminaSessione) => sessioniApi.termina(sessioneId, dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["context"] })
      queryClient.invalidateQueries({ queryKey: ["calendario"] })
      toast.success("Allenamento salvato.")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}
