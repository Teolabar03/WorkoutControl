import { api } from "@/lib/api"

export type Ruolo = "admin" | "standard" | "allenatore"

export interface WorkoutInfo {
  id: number
  nome: string
  data_creazione: string
  sincronizzazione_attiva: boolean
  /** Solo negli elenchi admin. */
  n_utenti?: number
  /** Solo negli elenchi admin: il token Samsung Health del workout. */
  ingest_token?: string | null
}

export interface Utente {
  id: number
  username: string
  ruolo: Ruolo
  ai_abilitata: boolean
  /** Flag AI e ruolo insieme: l'allenatore non ha mai l'assistente. */
  usa_assistente: boolean
  attivo: boolean
  admin: boolean
  puo_scrivere: boolean
  workout: WorkoutInfo
  data_creazione: string
}

export interface AuthStatus {
  authenticated: boolean
  utente: Utente | null
}

export const authApi = {
  me: () => api.get<AuthStatus>("/auth/me"),
  login: (username: string, password: string, remember: boolean) =>
    api.post<AuthStatus>("/auth/login", { username, password, remember }),
  logout: () => api.post<AuthStatus>("/auth/logout"),
  cambiaPassword: (attuale: string, nuova: string) =>
    api.post<AuthStatus>("/auth/password", { attuale, nuova }),
}
