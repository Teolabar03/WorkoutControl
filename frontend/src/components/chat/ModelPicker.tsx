import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCambiaModello, useModelliAi } from "@/hooks/useChat"
import { usePermessi } from "@/hooks/useAuth"

export function ModelPicker() {
  const { admin } = usePermessi()
  const { data: catalogo } = useModelliAi()
  const cambia = useCambiaModello()

  if (!catalogo) return null

  return (
    // Il modello vale per tutte le utenze: lo cambia solo l'admin, gli altri lo vedono.
    <Select
      value={catalogo.attivo || "auto"}
      onValueChange={(v) => cambia.mutate(v === "auto" ? "" : v)}
      disabled={!admin}
    >
      <SelectTrigger size="sm" className="w-[130px] sm:w-[220px]" aria-label="Modello assistente">
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
