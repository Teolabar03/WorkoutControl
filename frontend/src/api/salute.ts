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

export interface StatoSalute {
  /** WORKOUT_INGEST_TOKEN presente sul server: senza, l'endpoint è spento. */
  ingest_attivo: boolean
  /** Vero solo quando dal telefono è già arrivato qualcosa. */
  collegata: boolean
  url_webhook: string
  ultimo_sonno: string | null
  ultimo_pasto: string | null
  ultimo_peso: string | null
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
  stato: () => api.get<StatoSalute>("/salute/stato"),
  importa: (file: File) => {
    const form = new FormData()
    form.append("file", file)
    return api.upload<EsitoImport>("/salute/import", form)
  },
}
