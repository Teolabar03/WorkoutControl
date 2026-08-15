import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { numeroIt } from "@/lib/format"
import type { EsercizioScheda } from "@/api/schede"

export function SortableEsercizioRow({
  voce,
  onModifica,
  onRimuovi,
}: {
  voce: EsercizioScheda
  onModifica: () => void
  onRimuovi: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: voce.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const target = voce.esercizio.a_tempo
    ? `${voce.serie_target}×${voce.durata_target_sec ?? "?"}s`
    : `${voce.serie_target}×${voce.rep_target ?? "?"}`

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Trascina per riordinare ${voce.esercizio.nome}`}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{voce.esercizio.nome}</p>
        <p className="text-xs text-muted-foreground">
          {target}
          {voce.esercizio.usa_peso && voce.peso_suggerito_kg
            ? ` · ${numeroIt(voce.peso_suggerito_kg)} kg`
            : ""}
        </p>
      </div>

      <Button variant="ghost" size="icon-sm" onClick={onModifica} aria-label={`Modifica ${voce.esercizio.nome}`}>
        <Pencil className="size-4" />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onRimuovi} aria-label={`Rimuovi ${voce.esercizio.nome}`}>
        <Trash2 className="size-4" />
      </Button>
    </li>
  )
}
