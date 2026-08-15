import { api } from "@/lib/api"

export interface PesoCorporeo {
  id: number
  data: string
  valore_kg: number
  note: string
}

export interface NuovoPeso {
  valore_kg: number
  data?: string
  note?: string
}

export const pesoApi = {
  elenco: () => api.get<PesoCorporeo[]>("/peso"),
  crea: (dati: NuovoPeso) => api.post<PesoCorporeo>("/peso", dati),
  elimina: (id: number) => api.delete<void>(`/peso/${id}`),
}
