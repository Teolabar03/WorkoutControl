import { useState, type ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export function ConfirmDialog({
  trigger,
  titolo,
  descrizione,
  testoConferma = "Elimina",
  onConferma,
}: {
  trigger: ReactNode
  titolo: string
  descrizione: string
  testoConferma?: string
  onConferma: () => void
}) {
  const [aperto, setAperto] = useState(false)

  return (
    <Dialog open={aperto} onOpenChange={setAperto}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription>{descrizione}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAperto(false)}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConferma()
              setAperto(false)
            }}
          >
            {testoConferma}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
