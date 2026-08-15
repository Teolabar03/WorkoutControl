import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { pesoApi, type NuovoPeso } from "@/api/peso"
import { ApiError } from "@/lib/api"

export function usePesoElenco() {
  return useQuery({ queryKey: ["peso"], queryFn: pesoApi.elenco })
}

export function useNuovoPeso() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dati: NuovoPeso) => pesoApi.crea(dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peso"] })
      toast.success("Peso registrato.")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}

export function useEliminaPeso() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => pesoApi.elimina(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peso"] })
      toast.success("Misura eliminata.")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}
