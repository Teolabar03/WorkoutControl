import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChatBubble } from "@/components/chat/ChatBubble"
import { ModelPicker } from "@/components/chat/ModelPicker"
import { ConversationSidebar } from "@/components/chat/ConversationSidebar"
import {
  useConversazione,
  useConversazioni,
  useInviaMessaggio,
  useNuovaConversazione,
  useRigenera,
} from "@/hooks/useChat"
import { useAppContext } from "@/hooks/useAppContext"

const SUGGERIMENTI = [
  "Analizza i miei ultimi allenamenti",
  "Su quali esercizi sono fermo?",
  "Fammi vedere le mie schede",
  "Crea una scheda per la schiena con quello che ho in casa",
]

export function ChatPage() {
  const { conversazioneId } = useParams<{ conversazioneId?: string }>()
  const id = conversazioneId ? Number(conversazioneId) : null
  const navigate = useNavigate()

  const { data: context } = useAppContext()
  const { data: conversazioni } = useConversazioni()
  const { data: conversazione } = useConversazione(id)
  const nuovaConversazione = useNuovaConversazione()
  const invia = useInviaMessaggio(id ?? -1)
  const rigenera = useRigenera(id ?? -1)

  const [testo, setTesto] = useState("")
  const [inModifica, setInModifica] = useState(false)
  const [testoModifica, setTestoModifica] = useState("")
  const [azioniPerse, setAzioniPerse] = useState<string[] | null>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id && conversazioni && conversazioni.length > 0) {
      navigate(`/chat/${conversazioni[0].id}`, { replace: true })
    }
  }, [id, conversazioni, navigate])

  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight, behavior: "smooth" })
  }, [conversazione?.messaggi?.length])

  if (context && !context.ai_disponibile) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">
          L'assistente AI non è configurato: aggiungi una chiave API in <code>.env</code> e riavvia
          l'app.
        </p>
      </div>
    )
  }

  async function inviaTesto(testoDaInviare: string) {
    let conversazioneId = id
    if (!conversazioneId) {
      const nuova = await nuovaConversazione.mutateAsync()
      conversazioneId = nuova.id
      navigate(`/chat/${nuova.id}`, { replace: true })
    }
    invia.mutate({ testo: testoDaInviare })
    setTesto("")
  }

  function handleInvia() {
    if (!testo.trim()) return
    inviaTesto(testo.trim())
  }

  const messaggi = conversazione?.messaggi ?? []
  const ultimoUtente = [...messaggi].reverse().find((m) => m.ruolo === "user")

  function apriModifica() {
    if (!ultimoUtente) return
    setTestoModifica(ultimoUtente.contenuto)
    setInModifica(true)
    setAzioniPerse(null)
  }

  function inviaRigenerazione(conferma?: boolean) {
    if (!ultimoUtente) return
    rigenera.mutate(
      { messaggioId: ultimoUtente.id, testo: testoModifica, conferma },
      {
        onSuccess: (risultato) => {
          if (risultato.conferma_richiesta) {
            setAzioniPerse(risultato.azioni ?? [])
            return
          }
          setInModifica(false)
          setAzioniPerse(null)
        },
      }
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="hidden lg:block">
        <Button
          variant="outline"
          size="sm"
          className="mb-3 w-full"
          onClick={() => nuovaConversazione.mutate(undefined, { onSuccess: (c) => navigate(`/chat/${c.id}`) })}
        >
          <Plus className="size-4" /> Nuova conversazione
        </Button>
        <ConversationSidebar attivaId={id} />
      </aside>

      <div className="flex h-[calc(100svh-8rem)] flex-col rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <h1 className="font-heading text-lg font-semibold">Assistente AI</h1>
          <ModelPicker />
        </div>

        <div ref={listaRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messaggi.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                Chiedi un'analisi dei tuoi allenamenti o un consiglio.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGERIMENTI.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => inviaTesto(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messaggi.map((m) => (
            <div key={m.id}>
              <ChatBubble messaggio={m} />
              {m.id === ultimoUtente?.id && !inModifica && (
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={apriModifica}
                    className="text-xs text-muted-foreground hover:text-primary hover:underline"
                  >
                    Modifica e rigenera
                  </button>
                </div>
              )}
            </div>
          ))}

          {(invia.isPending || rigenera.isPending) && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl border border-border bg-card px-4 py-2.5">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {inModifica && (
          <div className="border-t border-border bg-muted/30 p-3">
            {azioniPerse && azioniPerse.length > 0 && (
              <div className="mb-2 rounded-md border border-warning bg-warning/10 p-2 text-xs">
                <p className="font-medium text-warning">
                  La risposta scartata aveva già eseguito queste azioni (non verranno annullate):
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {azioniPerse.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            <Textarea value={testoModifica} onChange={(e) => setTestoModifica(e.target.value)} rows={2} />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setInModifica(false)}>
                Annulla
              </Button>
              <Button size="sm" onClick={() => inviaRigenerazione(Boolean(azioniPerse))} disabled={rigenera.isPending}>
                {azioniPerse ? "Conferma comunque" : "Rigenera"}
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2 border-t border-border p-3">
          <Textarea
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleInvia()
              }
            }}
            placeholder="Scrivi un messaggio…"
            rows={1}
            className="min-h-10 flex-1 resize-none"
          />
          <Button onClick={handleInvia} disabled={invia.isPending || !testo.trim()} aria-label="Invia">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
