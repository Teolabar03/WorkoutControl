import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { Sessione } from "@/api/sessioni"

export interface AppContext {
  sessione_corrente: Sessione | null
  oggi: string
  ai_disponibile: boolean
}

export function useAppContext() {
  return useQuery({
    queryKey: ["context"],
    queryFn: () => api.get<AppContext>("/context"),
  })
}
