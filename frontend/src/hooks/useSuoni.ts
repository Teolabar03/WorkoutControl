import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { suoniApi } from "@/api/suoni"
import { leggiFileSuono } from "@/lib/suoni"

export function useSuoni() {
  return useQuery({ queryKey: ["suoni"], queryFn: suoniApi.elenco })
}

/** Il file di un suono. Non cambia mai dopo il caricamento, quindi non va
 *  mai riscaricato: condivisa fra il timer e l'anteprima in Impostazioni. */
export function opzioniSuono(id: number) {
  return { queryKey: ["suoni", id], queryFn: () => suoniApi.leggi(id), staleTime: Infinity }
}

export function useSuono(id: number | null | undefined) {
  return useQuery({ ...opzioniSuono(id ?? 0), enabled: id != null })
}

export function useCaricaSuono() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => suoniApi.crea(await leggiFileSuono(file)),
    onSuccess: (suono) => {
      queryClient.invalidateQueries({ queryKey: ["suoni"] })
      toast.success(`Suono «${suono.nome}» aggiunto.`)
    },
    // ApiError estende Error: il messaggio del server e quello della
    // validazione locale arrivano dallo stesso campo.
    onError: (err) => toast.error(err instanceof Error ? err.message : "Errore imprevisto."),
  })
}

export function useEliminaSuono() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => suoniApi.elimina(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suoni"] })
      // Se era quello scelto, il server è tornato al suono di base.
      queryClient.invalidateQueries({ queryKey: ["impostazioni"] })
      toast.success("Suono eliminato.")
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Errore imprevisto."),
  })
}
