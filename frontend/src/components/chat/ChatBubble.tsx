import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AlertTriangle, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MessaggioChat } from "@/api/chat"

export function ChatBubble({ messaggio }: { messaggio: MessaggioChat }) {
  const utente = messaggio.ruolo === "user"

  return (
    <div className={cn("flex", utente ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[70%]",
          utente
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-card-foreground"
        )}
      >
        {utente ? (
          <p className="whitespace-pre-wrap">{messaggio.contenuto}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{messaggio.contenuto}</ReactMarkdown>
          </div>
        )}

        {messaggio.azioni.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
            {messaggio.azioni.map((azione, i) => (
              <p key={i} className="flex items-start gap-1.5 text-xs text-accent">
                <Wrench className="mt-0.5 size-3 shrink-0" /> {azione}
              </p>
            ))}
          </div>
        )}

        {messaggio.avviso && (
          <p className="mt-2 flex items-start gap-1.5 border-t border-border/50 pt-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {messaggio.avviso}
          </p>
        )}
      </div>
    </div>
  )
}
