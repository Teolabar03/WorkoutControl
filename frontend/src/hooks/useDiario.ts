import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { diarioApi, type NuovaNotaDolore } from "@/api/diario"
import { ApiError } from "@/lib/api"

export function useDiarioElenco() {
  return useQuery({ queryKey: ["diario"], queryFn: diarioApi.elenco })
}

export function useNuovaNota() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dati: NuovaNotaDolore) => diarioApi.crea(dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diario"] })
      toast.success("Nota aggiunta al diario.")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}

export function useEliminaNota() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => diarioApi.elimina(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diario"] })
      toast.success("Nota eliminata.")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}
