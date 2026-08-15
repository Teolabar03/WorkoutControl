import { api } from "@/lib/api"

export interface AuthStatus {
  authenticated: boolean
}

export const authApi = {
  me: () => api.get<AuthStatus>("/auth/me"),
  login: (username: string, password: string, remember: boolean) =>
    api.post<AuthStatus>("/auth/login", { username, password, remember }),
  logout: () => api.post<AuthStatus>("/auth/logout"),
}
