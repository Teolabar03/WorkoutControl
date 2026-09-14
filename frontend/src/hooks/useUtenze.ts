import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { utenzeApi, type DatiUtente } from "@/api/utenze"
import { ApiError } from "@/lib/api"

export function useWorkoutElenco() {
  return useQuery({ queryKey: ["admin", "workout"], queryFn: utenzeApi.workout })
}

export function useUtentiElenco() {
  return useQuery({ queryKey: ["admin", "utenti"], queryFn: utenzeApi.utenti })
}

// Workout e utenze si citano a vicenda (quante utenze ha un workout, a quale
// workout appartiene un'utenza): qualunque modifica invalida entrambi gli elenchi.
function useMutazioneAdmin<TDati, TVariabili>(
  mutationFn: (variabili: TVariabili) => Promise<TDati>,
  conferma: string
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] })
      toast.success(conferma)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}

export const useCreaWorkout = () =>
  useMutazioneAdmin((nome: string) => utenzeApi.creaWorkout(nome), "Workout creato.")

export const useRinominaWorkout = () =>
  useMutazioneAdmin(
    ({ id, nome }: { id: number; nome: string }) => utenzeApi.rinominaWorkout(id, nome),
    "Workout rinominato."
  )

export const useGeneraToken = () =>
  useMutazioneAdmin((id: number) => utenzeApi.generaToken(id), "Nuovo token generato.")

export const useEliminaWorkout = () =>
  useMutazioneAdmin((id: number) => utenzeApi.eliminaWorkout(id), "Workout eliminato.")

export const useCreaUtente = () =>
  useMutazioneAdmin((dati: DatiUtente) => utenzeApi.creaUtente(dati), "Utenza creata.")

export const useModificaUtente = () =>
  useMutazioneAdmin(
    ({ id, dati }: { id: number; dati: DatiUtente }) => utenzeApi.modificaUtente(id, dati),
    "Utenza aggiornata."
  )

export const useEliminaUtente = () =>
  useMutazioneAdmin((id: number) => utenzeApi.eliminaUtente(id), "Utenza eliminata.")
