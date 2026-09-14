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
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
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

// La conversazione arriva con le variabili e non come argomento dell'hook: la
// prima domanda di una chat nuova crea la conversazione e la invia nello stesso
// click, quando l'hook e' ancora legato al render in cui l'id non esisteva.
//
// Le invalidazioni vengono restituite, cosi' la mutation resta in corso fino al
// refetch: la bolla in attesa sparisce solo quando la risposta e' gia' in lista.
export function useInviaMessaggio() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      conversazioneId,
      testo,
      nSessioni,
    }: {
      conversazioneId: number
      testo: string
      nSessioni?: number
    }) => chatApi.inviaMessaggio(conversazioneId, testo, nSessioni),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversazioni"] }),
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Errore imprevisto."
      toast.error(msg)
    },
  })
}

export function useRigenera() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      conversazioneId,
      messaggioId,
      testo,
      nSessioni,
      conferma,
    }: {
      conversazioneId: number
      messaggioId: number
      testo: string
      nSessioni?: number
      conferma?: boolean
    }) => chatApi.rigenera(conversazioneId, messaggioId, testo, nSessioni, conferma),
    onSuccess: async (risultato) => {
      if (!risultato.conferma_richiesta) {
        await queryClient.invalidateQueries({ queryKey: ["conversazioni"] })
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}

export function useModelliAi(abilitato = true) {
  return useQuery({ queryKey: ["ai", "modelli"], queryFn: chatApi.modelli, enabled: abilitato })
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

export function useStatoOllama(abilitato = true) {
  return useQuery({ queryKey: ["ollama", "stato"], queryFn: chatApi.statoOllama, enabled: abilitato })
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
