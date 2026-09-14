import { useEffect, useRef, useState, type ReactNode } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Copy, Menu, Pencil, Plus, RotateCcw, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ChatBubble } from "@/components/chat/ChatBubble"
import { ModelPicker } from "@/components/chat/ModelPicker"
import { ConversationSidebar } from "@/components/chat/ConversationSidebar"
import {
  useConversazione,
  useInviaMessaggio,
  useNuovaConversazione,
  useRigenera,
} from "@/hooks/useChat"
import { useAppContext } from "@/hooks/useAppContext"
import { cn } from "@/lib/utils"
import type { MessaggioChat } from "@/api/chat"

const SUGGERIMENTI = [
  "Analizza i miei ultimi allenamenti",
  "Su quali esercizi sono fermo?",
  "Fammi vedere le mie schede",
  "Crea una scheda per la schiena con quello che ho in casa",
]

/** Una domanda partita e non ancora tornata. Il backend salva la domanda solo
 *  insieme alla risposta, quindi finché non arriva la si disegna da qui. */
interface Attesa {
  /** null finché la conversazione nuova non è stata creata. */
  conversazioneId: number | null
  testo: string
  /** Primo messaggio che la risposta sostituirà: da lì in giù la cronologia
   *  si nasconde subito, come se la modifica fosse già avvenuta. */
  sostituisciDa: number | null
}

interface ConfermaRigenera {
  messaggioId: number
  testo: string
  azioni: string[]
  /** Se annullata, una modifica riapre l'editor col testo scritto. */
  daModifica: boolean
}

export function ChatPage() {
  const { conversazioneId } = useParams<{ conversazioneId?: string }>()
  const id = conversazioneId ? Number(conversazioneId) : null
  const navigate = useNavigate()

  const { data: context } = useAppContext()
  const { data: conversazione } = useConversazione(id)
  const nuovaConversazione = useNuovaConversazione()
  const invia = useInviaMessaggio()
  const rigenera = useRigenera()

  const [testo, setTesto] = useState("")
  const [menuAperto, setMenuAperto] = useState(false)
  const [modificaId, setModificaId] = useState<number | null>(null)
  const [testoModifica, setTestoModifica] = useState("")
  const [attesa, setAttesa] = useState<Attesa | null>(null)
  const [conferma, setConferma] = useState<ConfermaRigenera | null>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const occupato = attesa !== null
  const attesaQui = attesa && attesa.conversazioneId === id ? attesa : null
  const messaggi = conversazione?.messaggi ?? []
  const limite = attesaQui?.sostituisciDa ?? null
  const visibili = limite === null ? messaggi : messaggi.filter((m) => m.id < limite)
  const ultimoVisibile = visibili.at(-1)
  const ultimaDomanda = visibili.findLast((m) => m.ruolo === "user")

  useEffect(() => {
    setModificaId(null)
    setConferma(null)
  }, [id])

  // Si scende in fondo anche quando parte una domanda, non solo quando arriva
  // la risposta: altrimenti i puntini di attesa restano sotto il bordo.
  useEffect(() => {
    const lista = listaRef.current
    lista?.scrollTo({ top: lista.scrollHeight, behavior: "smooth" })
  }, [id, ultimoVisibile?.id, attesaQui?.testo])

  if (context && !context.ai_disponibile) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">
          {context.ai_configurato ? (
            "L'assistente AI non è abilitato per la tua utenza: chiedi a un admin."
          ) : (
            <>
              L'assistente AI non è configurato: aggiungi una chiave API in <code>.env</code> e
              riavvia l'app.
            </>
          )}
        </p>
      </div>
    )
  }

  function nuovaChat() {
    setMenuAperto(false)
    navigate("/chat")
  }

  async function inviaTesto(testoDaInviare: string) {
    const pulito = testoDaInviare.trim()
    if (!pulito || occupato) return

    setTesto("")
    setAttesa({ conversazioneId: id, testo: pulito, sostituisciDa: null })
    try {
      let destinazione = id
      if (destinazione === null) {
        const nuova = await nuovaConversazione.mutateAsync()
        destinazione = nuova.id
        setAttesa({ conversazioneId: nuova.id, testo: pulito, sostituisciDa: null })
        navigate(`/chat/${nuova.id}`, { replace: true })
      }
      await invia.mutateAsync({ conversazioneId: destinazione, testo: pulito })
    } catch {
      // La domanda non è stata salvata: torna nel campo, così basta reinviarla.
      setTesto(pulito)
    } finally {
      setAttesa(null)
    }
  }

  async function rigeneraDa(
    messaggioId: number,
    testoNuovo: string,
    daModifica: boolean,
    confermato = false
  ) {
    const pulito = testoNuovo.trim()
    if (id === null || !pulito || occupato) return

    setModificaId(null)
    setConferma(null)
    setAttesa({ conversazioneId: id, testo: pulito, sostituisciDa: messaggioId })
    try {
      const risultato = await rigenera.mutateAsync({
        conversazioneId: id,
        messaggioId,
        testo: pulito,
        conferma: confermato,
      })
      if (risultato.conferma_richiesta) {
        setConferma({ messaggioId, testo: pulito, azioni: risultato.azioni ?? [], daModifica })
      }
    } catch {
      if (daModifica) apriModifica(messaggioId, pulito)
    } finally {
      setAttesa(null)
    }
  }

  function apriModifica(messaggioId: number, contenuto: string) {
    setModificaId(messaggioId)
    setTestoModifica(contenuto)
  }

  function annullaConferma() {
    if (conferma?.daModifica) apriModifica(conferma.messaggioId, conferma.testo)
    setConferma(null)
  }

  async function copia(contenuto: string) {
    try {
      await navigator.clipboard.writeText(contenuto)
      toast.success("Copiato.")
    } catch {
      toast.error("Copia non disponibile su questo dispositivo.")
    }
  }

  function renderMessaggio(m: MessaggioChat) {
    if (m.id === modificaId) {
      return (
        <div key={m.id} className="ml-auto w-full rounded-2xl border border-border bg-muted/40 p-3 sm:max-w-[85%]">
          <Textarea
            value={testoModifica}
            onChange={(e) => setTestoModifica(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setModificaId(null)
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                rigeneraDa(m.id, testoModifica, true)
              }
            }}
            rows={3}
            autoFocus
            className="resize-none"
            aria-label="Modifica messaggio"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setModificaId(null)}>
              Annulla
            </Button>
            <Button
              size="sm"
              onClick={() => rigeneraDa(m.id, testoModifica, true)}
              disabled={!testoModifica.trim() || occupato}
            >
              Invia
            </Button>
          </div>
        </div>
      )
    }

    const utente = m.ruolo === "user"
    const rigenerabile = !utente && m.id === ultimoVisibile?.id && ultimaDomanda

    return (
      <div key={m.id} className="group">
        <ChatBubble messaggio={m} />
        <div
          className={cn(
            "mt-0.5 flex",
            utente
              ? "justify-end sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100"
              : "justify-start"
          )}
        >
          <Azione etichetta="Copia" onClick={() => copia(m.contenuto)}>
            <Copy />
          </Azione>
          {utente && (
            <Azione etichetta="Modifica" onClick={() => apriModifica(m.id, m.contenuto)} disabled={occupato}>
              <Pencil />
            </Azione>
          )}
          {rigenerabile && (
            <Azione
              etichetta="Rigenera risposta"
              onClick={() => rigeneraDa(ultimaDomanda.id, ultimaDomanda.contenuto, false)}
              disabled={occupato}
            >
              <RotateCcw />
            </Azione>
          )}
        </div>
      </div>
    )
  }

  const vuota = visibili.length === 0 && !attesaQui && (id === null || conversazione !== undefined)

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="hidden lg:block">
        <Button variant="outline" size="sm" className="mb-3 w-full" onClick={nuovaChat}>
          <Plus className="size-4" /> Nuova conversazione
        </Button>
        <ConversationSidebar attivaId={id} />
      </aside>

      <Sheet open={menuAperto} onOpenChange={setMenuAperto}>
        <SheetContent side="left" className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Conversazioni</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
            <Button variant="outline" size="sm" className="w-full" onClick={nuovaChat}>
              <Plus className="size-4" /> Nuova conversazione
            </Button>
            <div onClick={(e) => (e.target as HTMLElement).closest("a") && setMenuAperto(false)}>
              <ConversationSidebar attivaId={id} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex h-[calc(100svh-8rem)] flex-col rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 lg:hidden"
              onClick={() => setMenuAperto(true)}
              aria-label="Conversazioni"
            >
              <Menu className="size-4" />
            </Button>
            <h1 className="truncate font-heading text-lg font-semibold">Assistente AI</h1>
          </div>
          <ModelPicker />
        </div>

        <div ref={listaRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          {vuota && (
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

          {visibili.map(renderMessaggio)}

          {attesaQui && (
            <>
              <ChatBubble
                messaggio={{
                  id: -1,
                  conversazione_id: id ?? -1,
                  ruolo: "user",
                  contenuto: attesaQui.testo,
                  data: "",
                  n_sessioni_contesto: null,
                  modello: null,
                  azioni: [],
                  avviso: null,
                }}
              />
              <div className="flex justify-start" aria-label="L'assistente sta rispondendo">
                <div className="flex items-center gap-1 rounded-2xl border border-border bg-card px-4 py-2.5">
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-border p-3">
          <Textarea
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                inviaTesto(testo)
              }
            }}
            placeholder="Scrivi un messaggio…"
            rows={1}
            className="min-h-10 flex-1 resize-none"
          />
          <Button onClick={() => inviaTesto(testo)} disabled={occupato || !testo.trim()} aria-label="Invia">
            <Send className="size-4" />
          </Button>
        </div>
      </div>

      <Dialog open={conferma !== null} onOpenChange={(aperto) => !aperto && annullaConferma()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rigenerare comunque?</DialogTitle>
            <DialogDescription>
              Le risposte che verranno sostituite avevano già eseguito queste azioni. Restano valide:
              la nuova risposta non le annulla.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {conferma?.azioni.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={annullaConferma}>
              Annulla
            </Button>
            <Button
              onClick={() =>
                conferma && rigeneraDa(conferma.messaggioId, conferma.testo, conferma.daModifica, true)
              }
            >
              Rigenera comunque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Icona sotto un messaggio: 44px di area al tocco, compatta col mouse. */
function Azione({
  etichetta,
  onClick,
  disabled,
  children,
}: {
  etichetta: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={etichetta}
      title={etichetta}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 sm:size-8 [&_svg]:size-4"
    >
      {children}
    </button>
  )
}
