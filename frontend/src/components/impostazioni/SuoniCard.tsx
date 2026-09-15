import { useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Play, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { useImpostazioni, useModificaImpostazioni } from "@/hooks/useImpostazioni"
import { opzioniSuono, useCaricaSuono, useEliminaSuono, useSuoni } from "@/hooks/useSuoni"
import { disponibile, suoniPersonalizzatiNativi } from "@/lib/notifiche"
import { MAX_SUONO_BYTE, anteprima } from "@/lib/suoni"

const BASE = "base"

/** Scelta del suono di fine recupero e gestione dei suoni caricati.
 *
 * Il suono di base non è lo stesso sulle due piattaforme: da browser sono i tre
 * bip sintetizzati, nell'APK è il suono delle notifiche del telefono. I suoni
 * caricati invece suonano uguali ovunque.
 */
export function SuoniCard() {
  const queryClient = useQueryClient()
  const { data: impostazioni } = useImpostazioni()
  const { data: suoni } = useSuoni()
  const modifica = useModificaImpostazioni()
  const carica = useCaricaSuono()
  const elimina = useEliminaSuono()
  const selettoreFile = useRef<HTMLInputElement>(null)

  const nativo = disponibile()
  // Un APK installato prima del plugin nativo non sa usare i suoni caricati:
  // meglio dirlo che lasciar credere che la scelta non funzioni.
  const apkDaAggiornare = nativo && !suoniPersonalizzatiNativi()
  const scelto = impostazioni?.suono_recupero ?? null

  function ascolta(id: number | null) {
    anteprima(async () => (id === null ? null : (await queryClient.fetchQuery(opzioniSuono(id))).contenuto)).catch(
      () => toast.error("Impossibile riprodurre questo suono.")
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Suono di fine recupero</h2>
        <p className="text-sm text-muted-foreground">
          Quello che senti quando finisce il timer fra una serie e l'altra. Puoi aggiungere file brevi MP3, OGG, WAV o
          M4A, fino a {MAX_SUONO_BYTE / 1024} KB.
        </p>
      </div>

      {apkDaAggiornare && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          Questa versione dell'app usa sempre il suono delle notifiche del telefono. Installa l'APK più recente
          (vedi &laquo;Versione app&raquo;) per sentire il suono scelto qui.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="suono-recupero">Suono attivo</Label>
        <Select
          value={scelto === null ? BASE : String(scelto)}
          onValueChange={(v) => modifica.mutate({ suono_recupero: v === BASE ? null : Number(v) })}
          disabled={modifica.isPending}
        >
          <SelectTrigger id="suono-recupero" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BASE}>Predefinito</SelectItem>
            {suoni?.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ul className="divide-y divide-border rounded-md border border-border">
        <li className="flex min-h-11 items-center justify-between gap-2 px-3 py-1.5">
          <span className="min-w-0">
            <span className="block truncate">Predefinito</span>
            <span className="block text-xs text-muted-foreground">
              {nativo ? "Il suono delle notifiche del telefono" : "Tre bip brevi"}
            </span>
          </span>
          {/* Nell'APK il suono predefinito lo sceglie Android: un bip qui non
              sarebbe quello che si sente davvero. */}
          {!nativo && (
            <Button type="button" variant="ghost" size="icon" onClick={() => ascolta(null)} aria-label="Ascolta il suono predefinito">
              <Play className="size-4" />
            </Button>
          )}
        </li>
        {suoni?.map((s) => (
          <li key={s.id} className="flex min-h-11 items-center justify-between gap-2 px-3 py-1.5">
            <span className="min-w-0">
              <span className="block truncate">{s.nome}</span>
              <span className="block text-xs uppercase text-muted-foreground">
                {s.estensione} · {Math.max(1, Math.round(s.byte / 1024))} KB
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Button type="button" variant="ghost" size="icon" onClick={() => ascolta(s.id)} aria-label={`Ascolta ${s.nome}`}>
                <Play className="size-4" />
              </Button>
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="icon" aria-label={`Elimina ${s.nome}`} disabled={elimina.isPending}>
                    <Trash2 className="size-4" />
                  </Button>
                }
                titolo={`Eliminare «${s.nome}»?`}
                descrizione={
                  s.id === scelto
                    ? "È il suono attivo: a fine recupero tornerà quello predefinito."
                    : "Il suono sparisce per tutte le utenze di questo workout."
                }
                testoConferma="Elimina"
                onConferma={() => elimina.mutate(s.id)}
              />
            </span>
          </li>
        ))}
      </ul>

      <input
        ref={selettoreFile}
        type="file"
        accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) carica.mutate(file)
          // Azzerato subito, come per l'export Samsung Health: senza, ricaricare
          // lo stesso file non scatenerebbe un nuovo evento change.
          e.target.value = ""
        }}
      />
      <Button type="button" variant="outline" onClick={() => selettoreFile.current?.click()} disabled={carica.isPending}>
        <Upload className="size-4" />
        {carica.isPending ? "Caricamento…" : "Aggiungi un suono"}
      </Button>
    </div>
  )
}
