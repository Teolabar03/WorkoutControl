import { api } from "@/lib/api"

/** Le preferenze numeriche valgono 0 quando non sono impostate: senza altezza
 *  non si mostra il BMI, senza target non si disegna la linea di riferimento. */
export interface Impostazioni {
  timer_default_sec: number
  analisi_n_sessioni: number
  altezza_cm: number
  target_kcal: number
  target_proteine_g: number
  target_carboidrati_g: number
  target_grassi_g: number
  target_sonno_minuti: number
  attrezzatura_disponibile: string
}

export type ModificaImpostazioni = Partial<Impostazioni>

export const impostazioniApi = {
  leggi: () => api.get<Impostazioni>("/impostazioni"),
  modifica: (dati: ModificaImpostazioni) => api.patch<Impostazioni>("/impostazioni", dati),
}
