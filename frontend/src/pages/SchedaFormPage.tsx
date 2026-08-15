import { useEffect, useState, type FormEvent } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { useCreaScheda, useEliminaScheda, useModificaScheda, useScheda } from "@/hooks/useSchede"

export function SchedaFormPage() {
  const params = useParams<{ schedaId?: string }>()
  const schedaId = params.schedaId ? Number(params.schedaId) : null
  const navigate = useNavigate()

  const { data: scheda } = useScheda(schedaId ?? -1)
  const crea = useCreaScheda()
  const modifica = useModificaScheda(schedaId ?? -1)
  const elimina = useEliminaScheda()

  const [nome, setNome] = useState("")
  const [obiettivo, setObiettivo] = useState("")
  const [descrizione, setDescrizione] = useState("")
  const [attiva, setAttiva] = useState(true)

  useEffect(() => {
    if (scheda) {
      setNome(scheda.nome)
      setObiettivo(scheda.obiettivo)
      setDescrizione(scheda.descrizione)
      setAttiva(scheda.attiva)
    }
  }, [scheda])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return

    if (schedaId) {
      modifica.mutate(
        { nome, obiettivo, descrizione, attiva },
        { onSuccess: () => navigate(`/schede/${schedaId}`) }
      )
    } else {
      crea.mutate(
        { nome, obiettivo, descrizione },
        { onSuccess: (nuova) => navigate(`/schede/${nuova.id}`) }
      )
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-heading text-2xl font-semibold">
        {schedaId ? "Modifica scheda" : "Nuova scheda"}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="scheda-nome">Nome</Label>
          <Input id="scheda-nome" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scheda-obiettivo">Obiettivo</Label>
          <Input
            id="scheda-obiettivo"
            placeholder="es. ipertrofia, forza"
            value={obiettivo}
            onChange={(e) => setObiettivo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scheda-descrizione">Descrizione</Label>
          <Textarea
            id="scheda-descrizione"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
          />
        </div>
        {schedaId && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={attiva}
              onChange={(e) => setAttiva(e.target.checked)}
              className="size-4 rounded border-border accent-primary"
            />
            Scheda attiva
          </label>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {schedaId ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="destructive">
                  Elimina scheda
                </Button>
              }
              titolo="Eliminare questa scheda?"
              descrizione="Se ha allenamenti collegati verrà archiviata invece di essere cancellata, per conservare lo storico."
              onConferma={() =>
                elimina.mutate(schedaId, { onSuccess: () => navigate("/schede") })
              }
            />
          ) : (
            <span />
          )}
          <Button type="submit" disabled={crea.isPending || modifica.isPending}>
            Salva
          </Button>
        </div>
      </form>
    </div>
  )
}
