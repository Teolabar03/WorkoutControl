export class ApiError extends Error {
  code: string
  status: number
  fields?: unknown

  constructor(code: string, message: string, status: number, fields?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.fields = fields
  }
}

type Envelope<T> = { data: T; meta?: unknown }
type ErrorEnvelope = { error: { code: string; message: string; fields?: unknown } }

// Prefisso di deploy (vedi `base` in vite.config.ts): '/' in locale, '/workout/'
// sulla VPS dietro nginx. Termina sempre con '/', quindi niente slash extra qui.
const API_BASE = `${import.meta.env.BASE_URL}api`

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Con FormData il Content-Type lo deve scrivere il browser: include il
  // boundary del multipart, che noi non possiamo conoscere.
  const multipart = init?.body instanceof FormData
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(multipart ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  })

  if (res.status === 401 && !path.startsWith("/auth/")) {
    // Sessione scaduta/assente: ricarica per far ricomparire il login
    // (App verifica /auth/me all'avvio) invece di lasciare la UI a metà.
    window.location.reload()
  }

  if (res.status === 204) {
    return undefined as T
  }

  const body = (await res.json().catch(() => null)) as
    | Envelope<T>
    | ErrorEnvelope
    | null

  if (!res.ok || !body || "error" in body) {
    const err = body && "error" in body ? body.error : null
    throw new ApiError(
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? "Errore imprevisto.",
      res.status,
      err?.fields
    )
  }

  return (body as Envelope<T>).data
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
}
