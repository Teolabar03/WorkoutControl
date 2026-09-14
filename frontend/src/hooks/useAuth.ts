import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { authApi, type AuthStatus } from "@/api/auth"
import { ApiError } from "@/lib/api"

export function useAuthStatus() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    staleTime: Infinity,
    retry: false,
  })
}

/** Cosa può fare l'utenza collegata.
 *
 *  Il backend lo impone comunque (403 su ogni scrittura non permessa): qui
 *  serve solo a non mostrare pulsanti che non funzionerebbero. */
export function usePermessi() {
  const { data } = useAuthStatus()
  const utente = data?.utente ?? null
  return {
    utente,
    admin: utente?.admin ?? false,
    puoScrivere: utente?.puo_scrivere ?? false,
  }
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      username,
      password,
      remember,
    }: {
      username: string
      password: string
      remember: boolean
    }) => authApi.login(username, password, remember),
    onSuccess: (data) => {
      queryClient.setQueryData<AuthStatus>(["auth", "me"], data)
    },
  })
}

export function useCambiaPassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ attuale, nuova }: { attuale: string; nuova: string }) =>
      authApi.cambiaPassword(attuale, nuova),
    onSuccess: (data) => {
      queryClient.setQueryData<AuthStatus>(["auth", "me"], data)
      toast.success("Password cambiata.")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Errore imprevisto."),
  })
}

export function useLogout() {
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Reload invece di aggiornare la cache: azzera in un colpo solo tutte
      // le query delle pagine visitate (calendario, schede, ...) e fa
      // ripartire AuthGate da /auth/me, senza rischiare che qualche
      // componente resti con dati della sessione precedente in memoria.
      window.location.reload()
    },
  })
}
