import { api } from "@/lib/api"
import type { Sessione, NotaDolore } from "@/api/sessioni"

export interface GiornoCalendario {
  data: string
  sessioni: Sessione[]
  ha_dolore: boolean
}

export interface MeseCalendario {
  anno: number
  mese: number
  giorni_nel_mese: number
  primo_giorno_settimana: number
  totale_mese: number
  giorni: GiornoCalendario[]
}

export interface DettaglioGiorno {
  data: string
  e_futuro: boolean
  sessioni: Sessione[]
  note_dolore: NotaDolore[]
}

export const calendarioApi = {
  mese: (anno: number, mese: number) =>
    api.get<MeseCalendario>(`/calendario?anno=${anno}&mese=${mese}`),
  giorno: (data: string) => api.get<DettaglioGiorno>(`/calendario/giorni/${data}`),
}
