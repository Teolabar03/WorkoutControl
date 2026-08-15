import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { sessioniApi, type ModificaSessione } from "@/api/sessioni"
import { ApiError } from "@/lib/api"

function erroreToast(err: unknown) {
  toast.error(err instanceof ApiError ? err.message : "Errore imprevisto.")
}

export function useModificaSessione() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dati }: { id: number; dati: ModificaSessione }) =>
      sessioniApi.modifica(id, dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendario"] })
      toast.success("Sessione aggiornata.")
    },
    onError: erroreToast,
  })
}

export function useEliminaSessione() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => sessioniApi.elimina(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["calendario"] })
      queryClient.invalidateQueries({ queryKey: ["context"] })
      queryClient.invalidateQueries({ queryKey: ["sessioni", id] })
      toast.success("Sessione eliminata.")
    },
    onError: erroreToast,
  })
}

export function useAvviaSessione() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (schedaId?: number | null) => sessioniApi.avvia(schedaId),
    onSuccess: (sessione) => {
      queryClient.invalidateQueries({ queryKey: ["context"] })
      navigate(`/sessione/${sessione.id}`)
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "SESSIONE_IN_CORSO") {
        const id = (err.fields as { sessione_id?: number } | undefined)?.sessione_id
        if (id) {
          toast.info("Hai già una sessione in corso: ti porto lì.")
          navigate(`/sessione/${id}`)
          return
        }
      }
      toast.error(err instanceof ApiError ? err.message : "Errore imprevisto.")
    },
  })
}
