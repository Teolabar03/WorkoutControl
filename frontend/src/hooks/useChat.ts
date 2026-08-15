import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { chatApi } from "@/api/chat"
import { ApiError } from "@/lib/api"

export function useConversazioni() {
  return useQuery({ queryKey: ["conversazioni"], queryFn: chatApi.elenco })
}

export function useConversazione(id: number | null) {
  return useQuery({
    queryKey: ["conversazioni", id],
    queryFn: () => chatApi.dettaglio(id as number),
    enabled: id !== null,
  })
}

export function useNuovaConversazione() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => chatApi.nuova(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversazioni"] }),
  })
}

export function useEliminaConversazione() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => chatApi.elimina(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversazioni"] })
      toast.success("Conversazione eliminata.")
    },
  })
}

export function useInviaMessaggio(conversazioneId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ testo, nSessioni }: { testo: string; nSessioni?: number }) =>
      chatApi.inviaMessaggio(conversazioneId, testo, nSessioni),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversazioni", conversazioneId] })
      queryClient.invalidateQueries({ queryKey: ["conversazioni"] })
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Errore imprevisto."
      toast.error(msg)
    },
  })
}

export function useRigenera(conversazioneId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      messaggioId,
      testo,
      nSessioni,
      conferma,
    }: {
      messaggioId: number
      testo: string
      nSessioni?: number
      conferma?: boolean
    }) => chatApi.rigenera(conversazioneId, messaggioId, testo, nSessioni, conferma),
    onSuccess: (risultato) => {
      if (!risultato.conferma_richiesta) {
        queryClient.invalidateQueries({ queryKey: ["conversazioni", conversazioneId] })
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}

export function useModelliAi() {
  return useQuery({ queryKey: ["ai", "modelli"], queryFn: chatApi.modelli })
}

export function useCambiaModello() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (modello: string) => chatApi.cambiaModello(modello),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai", "modelli"] })
      toast.success("Modello cambiato.")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}

export function useStatoOllama() {
  return useQuery({ queryKey: ["ollama", "stato"], queryFn: chatApi.statoOllama })
}

export function useAvviaOllama() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => chatApi.avviaOllama(),
    onSuccess: () => {
      toast.success("Ollama avviato.")
      queryClient.invalidateQueries({ queryKey: ["ollama", "stato"] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}
