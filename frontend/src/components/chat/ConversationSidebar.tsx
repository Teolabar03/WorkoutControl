import { Link } from "react-router-dom"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { cn } from "@/lib/utils"
import { useConversazioni, useEliminaConversazione } from "@/hooks/useChat"

export function ConversationSidebar({ attivaId }: { attivaId: number | null }) {
  const { data: conversazioni } = useConversazioni()
  const elimina = useEliminaConversazione()

  if (!conversazioni || conversazioni.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">Nessuna conversazione salvata.</p>
  }

  return (
    <ul className="space-y-1">
      {conversazioni.map((c) => (
        <li key={c.id} className="group flex items-center gap-1">
          <Link
            to={`/chat/${c.id}`}
            className={cn(
              "min-w-0 flex-1 truncate rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-muted",
              c.id === attivaId ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {c.titolo}
          </Link>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                aria-label={`Elimina conversazione ${c.titolo}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            }
            titolo="Eliminare questa conversazione?"
            descrizione="I messaggi e le azioni salvate andranno persi. L'operazione non è reversibile."
            onConferma={() => elimina.mutate(c.id)}
          />
        </li>
      ))}
    </ul>
  )
}
