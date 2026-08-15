import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  schedeApi,
  libreriaApi,
  type ModificaEsercizioScheda,
  type ModificaScheda,
  type NuovaScheda,
  type NuovoEsercizioLibreria,
  type NuovoEsercizioScheda,
} from "@/api/schede"
import { ApiError } from "@/lib/api"

function erroreToast(err: unknown) {
  toast.error(err instanceof ApiError ? err.message : "Errore imprevisto.")
}

export function useSchedeElenco(attiva?: boolean) {
  return useQuery({ queryKey: ["schede", { attiva }], queryFn: () => schedeApi.elenco(attiva) })
}

export function useScheda(id: number) {
  return useQuery({ queryKey: ["schede", id], queryFn: () => schedeApi.dettaglio(id) })
}

export function useCreaScheda() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dati: NuovaScheda) => schedeApi.crea(dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schede"] })
      toast.success("Scheda creata.")
    },
    onError: erroreToast,
  })
}

export function useModificaScheda(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dati: ModificaScheda) => schedeApi.modifica(id, dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schede"] })
      toast.success("Scheda aggiornata.")
    },
    onError: erroreToast,
  })
}

export function useEliminaScheda() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => schedeApi.elimina(id),
    onSuccess: (risultato) => {
      queryClient.invalidateQueries({ queryKey: ["schede"] })
      toast.success(risultato.archiviata ? "Scheda archiviata (ha allenamenti collegati)." : "Scheda eliminata.")
    },
    onError: erroreToast,
  })
}

export function useDuplicaScheda() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => schedeApi.duplica(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schede"] })
      toast.success("Scheda duplicata.")
    },
    onError: erroreToast,
  })
}

export function useAggiungiEsercizio(schedaId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dati: NuovoEsercizioScheda) => schedeApi.aggiungiEsercizio(schedaId, dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schede", schedaId] })
      toast.success("Esercizio aggiunto.")
    },
    onError: erroreToast,
  })
}

export function useRiordinaEsercizi(schedaId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ordine: number[]) => schedeApi.riordinaEsercizi(schedaId, ordine),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schede", schedaId] })
    },
    onError: erroreToast,
  })
}

export function useModificaEsercizioScheda(schedaId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ voceId, dati }: { voceId: number; dati: ModificaEsercizioScheda }) =>
      schedeApi.modificaEsercizio(voceId, dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schede", schedaId] })
      toast.success("Esercizio aggiornato.")
    },
    onError: erroreToast,
  })
}

export function useRimuoviEsercizioScheda(schedaId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (voceId: number) => schedeApi.rimuoviEsercizio(voceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schede", schedaId] })
      toast.success("Esercizio rimosso dalla scheda.")
    },
    onError: erroreToast,
  })
}

export function useLibreria(params?: { attrezzatura?: string; gruppo?: string; archiviato?: boolean }) {
  return useQuery({
    queryKey: ["libreria", params],
    queryFn: () => libreriaApi.elenco(params),
  })
}

export function useCreaEsercizioLibreria() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dati: NuovoEsercizioLibreria) => libreriaApi.crea(dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libreria"] })
      toast.success("Esercizio aggiunto alla libreria.")
    },
    onError: erroreToast,
  })
}

export function useArchiviaEsercizioLibreria() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, archiviato }: { id: number; archiviato: boolean }) =>
      libreriaApi.archivia(id, archiviato),
    onSuccess: (esercizio) => {
      queryClient.invalidateQueries({ queryKey: ["libreria"] })
      toast.success(esercizio.archiviato ? `«${esercizio.nome}» archiviato.` : `«${esercizio.nome}» ripristinato.`)
    },
    onError: erroreToast,
  })
}
