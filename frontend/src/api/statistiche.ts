import { api } from "@/lib/api"
import type { EsercizioLibreria } from "@/api/schede"

export interface SerieTemporale {
  labels: string[]
  valori: number[]
}

export interface Riepilogo {
  totale_sessioni: number
  sessioni_30_giorni: number
  volume_totale_kg: number
  durata_media_min: number | null
  ultima_sessione: string | null
}

export interface Aderenza {
  sessioni: SerieTemporale
  riepilogo: { media: number; n_sessioni: number } | null
}

export interface Progressione {
  labels: string[]
  valori: number[]
  unita: string
  nome: string
}

export interface PR {
  id: number
  esercizio_libreria_id: number
  esercizio: string
  tipo: "peso" | "reps" | "tempo"
  valore: number
  peso_kg: number | null
  ripetizioni: number | null
  data: string
  sessione_id: number | null
  etichetta: string
}

export const statisticheApi = {
  riepilogo: () => api.get<Riepilogo>("/statistiche/riepilogo"),
  volume: () => api.get<SerieTemporale>("/statistiche/volume"),
  ripetizioni: () => api.get<SerieTemporale>("/statistiche/ripetizioni"),
  frequenza: () => api.get<SerieTemporale>("/statistiche/frequenza"),
  aderenza: () => api.get<Aderenza>("/statistiche/aderenza"),
  progressione: (esercizioId: number) =>
    api.get<Progressione>(`/statistiche/progressione?esercizio_id=${esercizioId}`),
  eserciziConDati: () => api.get<EsercizioLibreria[]>("/statistiche/esercizi-con-dati"),
  pr: (storico = false) => api.get<PR[]>(`/pr${storico ? "?storico=1" : ""}`),
}
