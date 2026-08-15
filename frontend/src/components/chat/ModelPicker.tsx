import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCambiaModello, useModelliAi } from "@/hooks/useChat"

export function ModelPicker() {
  const { data: catalogo } = useModelliAi()
  const cambia = useCambiaModello()

  if (!catalogo) return null

  return (
    <Select value={catalogo.attivo || "auto"} onValueChange={(v) => cambia.mutate(v === "auto" ? "" : v)}>
      <SelectTrigger size="sm" className="w-[220px]" aria-label="Modello assistente">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Scelta automatica</SelectItem>
        {catalogo.gruppi.map((gruppo) => (
          <SelectGroup key={gruppo.etichetta}>
            <SelectLabel>{gruppo.etichetta}</SelectLabel>
            {gruppo.modelli.map((m) => (
              <SelectItem key={m.chiave} value={m.chiave}>
                {m.etichetta}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
