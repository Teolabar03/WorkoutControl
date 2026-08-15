import { api } from "@/lib/api"
import type { NotaDolore } from "@/api/sessioni"

export interface NuovaNotaDolore {
  zona_corporea: string
  descrizione?: string
  gravita?: number
  data?: string
}

export const diarioApi = {
  elenco: () => api.get<NotaDolore[]>("/diario"),
  crea: (dati: NuovaNotaDolore) => api.post<NotaDolore>("/diario", dati),
  elimina: (id: number) => api.delete<void>(`/diario/${id}`),
}
