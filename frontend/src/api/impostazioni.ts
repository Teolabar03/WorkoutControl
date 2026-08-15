import { api } from "@/lib/api"

export interface Impostazioni {
  timer_default_sec: number
  analisi_n_sessioni: number
}

export interface ModificaImpostazioni {
  timer_default_sec?: number
  analisi_n_sessioni?: number
}

export const impostazioniApi = {
  leggi: () => api.get<Impostazioni>("/impostazioni"),
  modifica: (dati: ModificaImpostazioni) => api.patch<Impostazioni>("/impostazioni", dati),
}
