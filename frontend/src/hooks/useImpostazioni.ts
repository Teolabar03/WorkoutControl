import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { impostazioniApi, type ModificaImpostazioni } from "@/api/impostazioni"
import { chatApi } from "@/api/chat"
import { ApiError } from "@/lib/api"

export function useImpostazioni() {
  return useQuery({ queryKey: ["impostazioni"], queryFn: impostazioniApi.leggi })
}

export function useModificaImpostazioni() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dati: ModificaImpostazioni) => impostazioniApi.modifica(dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["impostazioni"] })
      toast.success("Impostazioni salvate.")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}

export function useCambiaModelloOllama() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (modello: string) => chatApi.cambiaModelloOllama(modello),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ollama", "stato"] })
      queryClient.invalidateQueries({ queryKey: ["ai", "modelli"] })
      toast.success("Modello locale aggiornato.")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}
