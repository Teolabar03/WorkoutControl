import { api } from "@/lib/api"

/** Una giornata vista dal lato salute: sonno, macro e peso già aggregati dal server. */
export interface GiornoSalute {
  data: string
  sonno_minuti: number
  sonno_inizio: string | null
  sonno_fine: string | null
  /** Solo le fasi davvero misurate: senza orologio al polso l'oggetto è vuoto. */
  fasi: Record<string, number>
  kcal: number | null
  proteine_g: number | null
  carboidrati_g: number | null
  grassi_g: number | null
  peso_kg: number | null
}

/** Un singolo pasto. Fibre e zuccheri sono spesso null: li porta solo l'export
 *  di Samsung Health, non la sincronizzazione oraria. */
export interface Pasto {
  id: number
  data: string
  inizio: string
  nome: string
  kcal: number | null
  proteine_g: number | null
  carboidrati_g: number | null
  grassi_g: number | null
  fibre_g: number | null
  zuccheri_g: number | null
  origine: string
}

/** Una metrica generica arrivata da Health Connect (passi, battito, SpO2...).
 *
 *  L'elenco non è noto in anticipo: dipende da cosa il telefono manda davvero,
 *  e il server descrive ogni voce (etichetta, unità, decimali) perché la pagina
 *  possa disegnarla senza sapere di che metrica si tratta. */
export interface MetricaSalute {
  tipo: string
  etichetta: string
  unita: string
  decimali: number
  aggregazione: "somma" | "media" | "ultimo"
  ultimo_valore: number
  ultima_data: string
  media: number
  giorni: { data: string; valore: number }[]
}

/** Il tipo di dato con l'ultima data ricevuta, per il pannello in Impostazioni. */
export interface MetricaRicevuta {
  tipo: string
  etichetta: string
  ultima_data: string | null
}

export interface StatoSalute {
  /** WORKOUT_INGEST_TOKEN presente sul server: senza, l'endpoint è spento. */
  ingest_attivo: boolean
  /** Vero solo quando dal telefono è già arrivato qualcosa. */
  collegata: boolean
  url_webhook: string
  ultimo_sonno: string | null
  ultimo_pasto: string | null
  ultimo_peso: string | null
  /** Cosa il telefono sta effettivamente mandando oltre a sonno/pasti/peso. */
  metriche: MetricaRicevuta[]
}

/** Quanto ha importato l'export: `altezza_cm` solo se l'ha dedotta lui. */
export interface EsitoImport {
  sonno: number
  pasti: number
  peso: number
  altezza_cm?: number
}

export const saluteApi = {
  giorni: (dal: string, al: string) =>
    api.get<GiornoSalute[]>(`/salute?dal=${dal}&al=${al}`),
  metriche: (dal: string, al: string) =>
    api.get<MetricaSalute[]>(`/salute/metriche?dal=${dal}&al=${al}`),
  pasti: (dal: string, al: string) =>
    api.get<Pasto[]>(`/nutrizione/pasti?dal=${dal}&al=${al}`),
  stato: () => api.get<StatoSalute>("/salute/stato"),
  importa: (file: File) => {
    const form = new FormData()
    form.append("file", file)
    return api.upload<EsitoImport>("/salute/import", form)
  },
}
