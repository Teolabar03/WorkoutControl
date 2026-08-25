import { api } from "@/lib/api"
import type { EsercizioLibreria, Serie } from "@/api/schede"

/** Un esercizio della sessione attiva: snapshot indipendente dalla scheda. */
export interface EsercizioSessione {
  id: number
  sessione_id: number
  /** null = aggiunto ad-hoc durante l'allenamento, non pianificato dalla scheda. */
  esercizio_scheda_id: number | null
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

export interface NuovoEsercizioSessione {
  esercizio_libreria_id: number
  serie_target?: number
  rep_target?: number | null
  durata_target_sec?: number | null
  peso_suggerito_kg?: number | null
  note?: string
  timer_recupero_secondi?: number | null
}

export interface Sessione {
  id: number
  data: string
  iniziata_alle: string
  scheda_id: number | null
  nome_scheda: string
  durata_minuti: number | null
  energia: number | null
  sonno: number | null
  umore: number | null
  note_generali: string
  completata: boolean
  n_serie: number
  volume_kg: number
  serie?: Serie[]
  note_dolore?: NotaDolore[]
  esercizi_saltati?: unknown[]
}

export interface NotaDolore {
  id: number
  data: string
  sessione_id: number | null
  zona_corporea: string
  descrizione: string
  gravita: number
}

export interface ModificaSessione {
  scheda_id?: number | null
  durata_minuti?: number | null
  energia?: number | null
  sonno?: number | null
  umore?: number | null
  note_generali?: string
}

export interface BloccoAttivo {
  voce: EsercizioSessione
  serie: Serie[]
  timer_secondi: number
  record: string | null
  saltato: boolean
}

export interface DettaglioSessione {
  sessione: Sessione
  blocchi: BloccoAttivo[]
}

export interface NuovaSerie {
  esercizio_sessione_id: number
  peso_kg?: number | null
  ripetizioni?: number | null
  durata_secondi?: number | null
  note?: string
}

export interface RisultatoSerie {
  serie: Serie
  nuovo_pr: boolean
  record: string | null
  timer_secondi: number
}

export interface TerminaSessione {
  durata_minuti?: number | null
  energia?: number | null
  sonno?: number | null
  umore?: number | null
  note_generali?: string
  nota_dolore?: { zona_corporea: string; descrizione?: string; gravita?: number } | null
}

export interface BloccoTarget {
  esercizio_scheda_id: number
  esercizio: import("@/api/schede").EsercizioLibreria
  serie_target: number
  rep_target: number | null
  durata_target_sec: number | null
  peso_suggerito_kg: number | null
}

export interface RigaSerieInput {
  peso_kg?: number | null
  ripetizioni?: number | null
  durata_secondi?: number | null
  note?: string
}

export interface BloccoInput {
  esercizio_scheda_id?: number | null
  esercizio_libreria_id: number
  saltato?: boolean
  motivo_saltato?: string
  serie: RigaSerieInput[]
}

export interface SessioneManualeInput {
  data: string
  scheda_id?: number | null
  durata_minuti?: number | null
  energia?: number | null
  sonno?: number | null
  umore?: number | null
  note_generali?: string
  blocchi: BloccoInput[]
}

export interface BloccoEsistente {
  esercizio_scheda_id: number | null
  esercizio_libreria_id: number
  esercizio: import("@/api/schede").EsercizioLibreria
  in_scheda: boolean
  saltato: boolean
  motivo_saltato: string
  serie: RigaSerieInput[]
}

export interface RisultatoSalvataggio {
  sessione: Sessione
  n_serie: number
  n_saltati: number
  n_pr?: number
}

export const sessioniApi = {
  blocchiPrecompilati: (schedaId: number) =>
    api.get<BloccoTarget[]>(`/schede/${schedaId}/blocchi-precompilati`),
  blocchiSessione: (sessioneId: number) =>
    api.get<BloccoEsistente[]>(`/sessioni/${sessioneId}/blocchi`),
  salvaManuale: (dati: SessioneManualeInput) =>
    api.post<RisultatoSalvataggio>("/sessioni/manuale", dati),
  salvaModifica: (id: number, dati: SessioneManualeInput) =>
    api.put<RisultatoSalvataggio>(`/sessioni/${id}`, dati),
  avvia: (schedaId?: number | null) =>
    api.post<Sessione>("/sessioni", { scheda_id: schedaId ?? null }),
  elimina: (id: number) => api.delete<void>(`/sessioni/${id}`),
  modifica: (id: number, dati: ModificaSessione) => api.patch<Sessione>(`/sessioni/${id}`, dati),
  dettaglio: (id: number) => api.get<DettaglioSessione>(`/sessioni/${id}`),
  registraSerie: (sessioneId: number, dati: NuovaSerie) =>
    api.post<RisultatoSerie>(`/sessioni/${sessioneId}/serie`, dati),
  eliminaSerie: (serieId: number) => api.delete<{ record: string | null }>(`/serie/${serieId}`),
  termina: (id: number, dati: TerminaSessione) =>
    api.post<Sessione>(`/sessioni/${id}/termina`, dati),
  aggiungiEsercizio: (sessioneId: number, dati: NuovoEsercizioSessione) =>
    api.post<EsercizioSessione>(`/sessioni/${sessioneId}/esercizi`, dati),
  riordinaEsercizi: (sessioneId: number, ordine: number[]) =>
    api.put<BloccoAttivo[]>(`/sessioni/${sessioneId}/esercizi/ordine`, { ordine }),
  rimuoviEsercizio: (voceId: number) => api.delete<void>(`/esercizi-sessione/${voceId}`),
  saltaEsercizio: (voceId: number, motivo?: string) =>
    api.post<BloccoAttivo[]>(`/esercizi-sessione/${voceId}/salta`, { motivo }),
  annullaSalta: (voceId: number) =>
    api.delete<BloccoAttivo[]>(`/esercizi-sessione/${voceId}/salta`),
}
