import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { authApi, type AuthStatus } from "@/api/auth"

export function useAuthStatus() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    staleTime: Infinity,
    retry: false,
  })
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
