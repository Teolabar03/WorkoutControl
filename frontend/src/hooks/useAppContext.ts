import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { Sessione } from "@/api/sessioni"

export interface AppContext {
  sessione_corrente: Sessione | null
  oggi: string
  ai_disponibile: boolean
  /** Vero solo dopo il primo dato arrivato dal telefono: finché è falso la
   *  sezione Salute non compare da nessuna parte. */
  salute_collegata: boolean
}

export function useAppContext() {
  return useQuery({
    queryKey: ["context"],
    queryFn: () => api.get<AppContext>("/context"),
  })
}
