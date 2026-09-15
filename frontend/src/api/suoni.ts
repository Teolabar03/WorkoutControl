import { api } from "@/lib/api"

/** Un suono caricato per l'avviso di fine recupero, senza il file. */
export interface Suono {
  id: number
  nome: string
  mime: string
  /** Estensione con cui l'APK salva il file per il canale di notifica. */
  estensione: string
  byte: number
  data_creazione: string
}

/** Il file viaggia in base64 dentro JSON: nell'APK l'upload multipart non è
 *  affidabile (vedi mobile/capacitor.config.ts), e i file sono piccoli. */
export interface SuonoConContenuto extends Suono {
  contenuto: string
}

export interface NuovoSuono {
  nome: string
  mime: string
  contenuto: string
}

export const suoniApi = {
  elenco: () => api.get<Suono[]>("/suoni"),
  leggi: (id: number) => api.get<SuonoConContenuto>(`/suoni/${id}`),
  crea: (dati: NuovoSuono) => api.post<Suono>("/suoni", dati),
  elimina: (id: number) => api.delete<{ id: number }>(`/suoni/${id}`),
}
