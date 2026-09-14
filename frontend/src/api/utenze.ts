import { api } from "@/lib/api"
import type { Ruolo, Utente, WorkoutInfo } from "@/api/auth"

export interface DatiUtente {
  username?: string
  /** In modifica: vuota o assente vuol dire "non cambiarla". */
  password?: string
  ruolo?: Ruolo
  workout_id?: number
  ai_abilitata?: boolean
  attivo?: boolean
}

export const utenzeApi = {
  workout: () => api.get<WorkoutInfo[]>("/admin/workout"),
  creaWorkout: (nome: string) => api.post<WorkoutInfo>("/admin/workout", { nome }),
  rinominaWorkout: (id: number, nome: string) => api.patch<WorkoutInfo>(`/admin/workout/${id}`, { nome }),
  generaToken: (id: number) => api.post<WorkoutInfo>(`/admin/workout/${id}/token`),
  eliminaWorkout: (id: number) => api.delete<void>(`/admin/workout/${id}`),
  utenti: () => api.get<Utente[]>("/admin/utenti"),
  creaUtente: (dati: DatiUtente) => api.post<Utente>("/admin/utenti", dati),
  modificaUtente: (id: number, dati: DatiUtente) => api.patch<Utente>(`/admin/utenti/${id}`, dati),
  eliminaUtente: (id: number) => api.delete<void>(`/admin/utenti/${id}`),
}
