import { api } from "@/lib/api"

export type TipoCarico = "peso" | "elastico" | "corpo_libero"
export type TipoMisura = "reps" | "tempo"

export interface EsercizioLibreria {
  id: number
  nome: string
  attrezzatura: string
  gruppo_muscolare: string
  tipo_carico: TipoCarico
  tipo_misura: TipoMisura
  carichi_per_serie: number
  note_tecniche: string
  is_custom: boolean
  archiviato: boolean
  usa_peso: boolean
  a_tempo: boolean
}

export interface EsercizioScheda {
  id: number
  scheda_id: number
  ordine: number
  serie_target: number
  rep_target: number | null
  durata_target_sec: number | null
  peso_suggerito_kg: number | null
  note: string
  timer_recupero_secondi: number | null
  timer_effettivo: number
  esercizio: EsercizioLibreria
}

export interface Scheda {
  id: number
  nome: string
  descrizione: string
  obiettivo: string
  data_creazione: string
  attiva: boolean
  n_esercizi: number
  n_allenamenti: number
  esercizi?: EsercizioScheda[]
}

export interface Serie {
  id: number
  sessione_id: number
  esercizio_scheda_id: number | null
  esercizio_libreria_id: number
  esercizio: EsercizioLibreria
  numero_serie: number
  peso_kg: number | null
  ripetizioni: number | null
  durata_secondi: number | null
  note: string
  is_pr: boolean
  volume_kg: number
  registrata_alle: string
}

export interface NuovaScheda {
  nome: string
  descrizione?: string
  obiettivo?: string
}

export interface ModificaScheda {
  nome?: string
  descrizione?: string
  obiettivo?: string
  attiva?: boolean
}

export interface NuovoEsercizioScheda {
  esercizio_libreria_id: number
  serie_target?: number
  rep_target?: number | null
  durata_target_sec?: number | null
  peso_suggerito_kg?: number | null
  note?: string
  timer_recupero_secondi?: number | null
}

export type ModificaEsercizioScheda = Omit<NuovoEsercizioScheda, "esercizio_libreria_id">

export interface NuovoEsercizioLibreria {
  nome: string
  gruppo_muscolare?: string
  attrezzatura?: string
  tipo_carico?: TipoCarico
  tipo_misura?: TipoMisura
  carichi_per_serie?: number
  note_tecniche?: string
}

export const schedeApi = {
  elenco: (attiva?: boolean) =>
    api.get<Scheda[]>(`/schede${attiva !== undefined ? `?attiva=${attiva}` : ""}`),
  dettaglio: (id: number) => api.get<Scheda>(`/schede/${id}`),
  crea: (dati: NuovaScheda) => api.post<Scheda>("/schede", dati),
  modifica: (id: number, dati: ModificaScheda) => api.patch<Scheda>(`/schede/${id}`, dati),
  elimina: (id: number) => api.delete<{ archiviata: boolean }>(`/schede/${id}`),
  duplica: (id: number) => api.post<Scheda>(`/schede/${id}/duplica`, {}),
  aggiungiEsercizio: (schedaId: number, dati: NuovoEsercizioScheda) =>
    api.post<EsercizioScheda>(`/schede/${schedaId}/esercizi`, dati),
  riordinaEsercizi: (schedaId: number, ordine: number[]) =>
    api.put<Scheda>(`/schede/${schedaId}/esercizi/ordine`, { ordine }),
  modificaEsercizio: (voceId: number, dati: ModificaEsercizioScheda) =>
    api.patch<EsercizioScheda>(`/esercizi-scheda/${voceId}`, dati),
  rimuoviEsercizio: (voceId: number) => api.delete<void>(`/esercizi-scheda/${voceId}`),
}

export const libreriaApi = {
  elenco: (params?: { attrezzatura?: string; gruppo?: string; archiviato?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.attrezzatura) q.set("attrezzatura", params.attrezzatura)
    if (params?.gruppo) q.set("gruppo", params.gruppo)
    if (params?.archiviato !== undefined) q.set("archiviato", String(params.archiviato))
    const qs = q.toString()
    return api.get<EsercizioLibreria[]>(`/libreria-esercizi${qs ? `?${qs}` : ""}`)
  },
  crea: (dati: NuovoEsercizioLibreria) => api.post<EsercizioLibreria>("/libreria-esercizi", dati),
  archivia: (id: number, archiviato: boolean) =>
    api.patch<EsercizioLibreria>(`/libreria-esercizi/${id}`, { archiviato }),
}
