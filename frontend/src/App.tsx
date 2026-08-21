import type { ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { Layout } from "@/components/layout/Layout"
import { LoginPage } from "@/pages/LoginPage"
import { useAuthStatus } from "@/hooks/useAuth"
import { CalendarioPage } from "@/pages/CalendarioPage"
import { GiornoPage } from "@/pages/GiornoPage"
import { SchedePage } from "@/pages/SchedePage"
import { SchedaDettaglioPage } from "@/pages/SchedaDettaglioPage"
import { SchedaFormPage } from "@/pages/SchedaFormPage"
import { LibreriaPage } from "@/pages/LibreriaPage"
import { SessioneAttivaPage } from "@/pages/SessioneAttivaPage"
import { SessioneManualePage } from "@/pages/SessioneManualePage"
import { StatistichePage } from "@/pages/StatistichePage"
import { PesoPage } from "@/pages/PesoPage"
import { SalutePage } from "@/pages/SalutePage"
import { DiarioPage } from "@/pages/DiarioPage"
import { ChatPage } from "@/pages/ChatPage"
import { ImpostazioniPage } from "@/pages/ImpostazioniPage"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
})

function AuthGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useAuthStatus()

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Caricamento...
      </div>
    )
  }
  if (!data?.authenticated) {
    return <LoginPage />
  }
  return <>{children}</>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* basename = prefisso di deploy (vedi `base` in vite.config.ts): '/' in
          locale, '/workout/' sulla VPS dietro nginx. Così i path assoluti delle
          Route qui sotto restano scritti come sono e valgono in entrambi i casi. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthGate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/calendario" replace />} />
              <Route path="calendario" element={<CalendarioPage />} />
              <Route path="calendario/:giorno" element={<GiornoPage />} />
              <Route path="schede" element={<SchedePage />} />
              <Route path="schede/nuova" element={<SchedaFormPage />} />
              <Route path="schede/:schedaId" element={<SchedaDettaglioPage />} />
              <Route path="schede/:schedaId/modifica" element={<SchedaFormPage />} />
              <Route path="libreria" element={<LibreriaPage />} />
              <Route path="sessione/:sessioneId" element={<SessioneAttivaPage />} />
              <Route path="sessione/manuale" element={<SessioneManualePage />} />
              <Route path="sessione/:sessioneId/modifica" element={<SessioneManualePage />} />
              <Route path="statistiche" element={<StatistichePage />} />
              <Route path="peso" element={<PesoPage />} />
              {/* La pagina si difende da sola: senza sincronizzazione col
                  telefono rimanda al calendario invece di mostrarsi vuota. */}
              <Route path="salute" element={<SalutePage />} />
              <Route path="diario" element={<DiarioPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="chat/:conversazioneId" element={<ChatPage />} />
              <Route path="impostazioni" element={<ImpostazioniPage />} />
              <Route path="*" element={<Navigate to="/calendario" replace />} />
            </Route>
          </Routes>
        </AuthGate>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
