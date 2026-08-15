import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { sessioniApi, type SessioneManualeInput } from "@/api/sessioni"
import { ApiError } from "@/lib/api"

export function useBlocchiPrecompilati(schedaId: number | null) {
  return useQuery({
    queryKey: ["schede", schedaId, "blocchi-precompilati"],
    queryFn: () => sessioniApi.blocchiPrecompilati(schedaId as number),
    enabled: schedaId !== null,
  })
}

export function useBlocchiSessione(sessioneId: number | null) {
  return useQuery({
    queryKey: ["sessioni", sessioneId, "blocchi"],
    queryFn: () => sessioniApi.blocchiSessione(sessioneId as number),
    enabled: sessioneId !== null,
  })
}

export function useSalvaManuale() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (dati: SessioneManualeInput) => sessioniApi.salvaManuale(dati),
    onSuccess: (risultato) => {
      queryClient.invalidateQueries({ queryKey: ["calendario"] })
      toast.success(`Allenamento registrato: ${risultato.n_serie} serie.`)
      navigate(`/calendario/${risultato.sessione.data}`)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}

export function useSalvaModifica(sessioneId: number) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (dati: SessioneManualeInput) => sessioniApi.salvaModifica(sessioneId, dati),
    onSuccess: (risultato) => {
      queryClient.invalidateQueries({ queryKey: ["calendario"] })
      toast.success(`Allenamento aggiornato: ${risultato.n_serie} serie.`)
      navigate(`/calendario/${risultato.sessione.data}`)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}
