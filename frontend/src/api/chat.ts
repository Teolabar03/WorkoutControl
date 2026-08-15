import { api } from "@/lib/api"

export interface Conversazione {
  id: number
  titolo: string
  data_creazione: string
  data_ultimo_messaggio: string
  anteprima: string
  messaggi?: MessaggioChat[]
}

export interface MessaggioChat {
  id: number
  conversazione_id: number
  ruolo: "user" | "assistant"
  contenuto: string
  data: string
  n_sessioni_contesto: number | null
  modello: string | null
  azioni: string[]
  avviso: string | null
}

export interface ModelloAi {
  chiave: string
  id: string
  etichetta: string
  note: string
  strumenti: boolean
}

export interface GruppoModelli {
  etichetta: string
  modelli: ModelloAi[]
}

export interface CatalogoModelli {
  attivo: string
  gruppi: GruppoModelli[]
  provider: string
  modello_attivo: string
  modello_riserva: string | null
}

export interface StatoOllama {
  configurato: boolean
  server_attivo: boolean
  modello_presente: boolean
  host: string
  modello: string
  modello_predefinito: string
  modello_scelto: string
  modelli_disponibili: string[]
  keep_alive: string
  timeout: number
  num_ctx: number
}

export interface RispostaInvio {
  messaggio: MessaggioChat
  titolo: string
  id_utente: number | null
}

export interface RispostaRigenera {
  messaggio?: MessaggioChat
  titolo?: string
  id_utente?: number | null
  conferma_richiesta?: boolean
  azioni?: string[]
}

export const chatApi = {
  elenco: () => api.get<Conversazione[]>("/conversazioni"),
  dettaglio: (id: number) => api.get<Conversazione>(`/conversazioni/${id}`),
  nuova: () => api.post<Conversazione>("/conversazioni", {}),
  elimina: (id: number) => api.delete<void>(`/conversazioni/${id}`),
  inviaMessaggio: (conversazioneId: number, testo: string, nSessioni?: number) =>
    api.post<RispostaInvio>(`/conversazioni/${conversazioneId}/messaggi`, {
      testo,
      n_sessioni: nSessioni,
    }),
  rigenera: (conversazioneId: number, messaggioId: number, testo: string, nSessioni?: number, conferma?: boolean) =>
    api.post<RispostaRigenera>(
      `/conversazioni/${conversazioneId}/messaggi/${messaggioId}/rigenera`,
      { testo, n_sessioni: nSessioni, conferma }
    ),
  modelli: () => api.get<CatalogoModelli>("/ai/modelli"),
  cambiaModello: (modello: string) =>
    api.post<{ attivo: string; modello: string; provider: string; riserva: string | null }>(
      "/ai/modello",
      { modello }
    ),
  statoOllama: () => api.get<StatoOllama>("/ollama/stato"),
  avviaOllama: () => api.post<{ messaggio: string }>("/ollama/avvia", {}),
  cambiaModelloOllama: (modello: string) =>
    api.post<{ ollama_modello: string }>("/ai/ollama-modello", { modello }),
}
