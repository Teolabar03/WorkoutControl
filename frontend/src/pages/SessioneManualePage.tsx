import { useEffect, useState, type FormEvent } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ManualBlockCard, type BloccoForm } from "@/components/sessione/ManualBlockCard"
import { useSchedeElenco } from "@/hooks/useSchede"
import { useDettaglioSessione } from "@/hooks/useSessioneAttiva"
import {
  useBlocchiPrecompilati,
  useBlocchiSessione,
  useSalvaManuale,
  useSalvaModifica,
} from "@/hooks/useSessioneManuale"
import { numeroIt } from "@/lib/format"
import type { BloccoInput, BloccoTarget, BloccoEsistente } from "@/api/sessioni"

function blocchiDaTarget(target: BloccoTarget[]): BloccoForm[] {
  return target.map((t) => ({
    chiave: `v${t.esercizio_scheda_id}`,
    esercizioSchedaId: t.esercizio_scheda_id,
    esercizioLibreriaId: t.esercizio.id,
    esercizio: t.esercizio,
    saltato: false,
    motivoSaltato: "",
    righe: Array.from({ length: Math.max(t.serie_target, 1) }, () => ({
      peso: t.peso_suggerito_kg ? numeroIt(t.peso_suggerito_kg) : "",
      valore: t.esercizio.a_tempo
        ? (t.durata_target_sec?.toString() ?? "")
        : (t.rep_target?.toString() ?? ""),
      nota: "",
    })),
  }))
}

function blocchiDaEsistenti(esistenti: BloccoEsistente[]): BloccoForm[] {
  return esistenti.map((b, i) => ({
    chiave: b.esercizio_scheda_id ? `v${b.esercizio_scheda_id}` : `e${b.esercizio_libreria_id}-${i}`,
    esercizioSchedaId: b.esercizio_scheda_id,
    esercizioLibreriaId: b.esercizio_libreria_id,
    esercizio: b.esercizio,
    saltato: b.saltato,
    motivoSaltato: b.motivo_saltato,
    righe:
      b.serie.length > 0
        ? b.serie.map((s) => ({
            peso: s.peso_kg ? numeroIt(s.peso_kg) : "",
            valore: s.durata_secondi ? String(s.durata_secondi) : s.ripetizioni ? String(s.ripetizioni) : "",
            nota: s.note ?? "",
          }))
        : [{ peso: "", valore: "", nota: "" }],
  }))
}

function bloccoFormAInput(b: BloccoForm): BloccoInput {
  return {
    esercizio_scheda_id: b.esercizioSchedaId,
    esercizio_libreria_id: b.esercizioLibreriaId,
    saltato: b.saltato,
    motivo_saltato: b.motivoSaltato,
    serie: b.saltato
      ? []
      : b.righe
          .filter((r) => r.valore.trim() !== "")
          .map((r) => ({
            peso_kg: r.peso ? Number(r.peso.replace(",", ".")) : null,
            ripetizioni: !b.esercizio.a_tempo ? Number(r.valore.replace(",", ".")) : null,
            durata_secondi: b.esercizio.a_tempo ? Number(r.valore.replace(",", ".")) : null,
            note: r.nota,
          })),
  }
}

export function SessioneManualePage() {
  const { sessioneId } = useParams<{ sessioneId?: string }>()
  const modalitaModifica = Boolean(sessioneId)
  const id = sessioneId ? Number(sessioneId) : null
  const [searchParams] = useSearchParams()

  const [data, setData] = useState(searchParams.get("data") ?? new Date().toISOString().slice(0, 10))
  const [schedaId, setSchedaId] = useState<number | null>(
    searchParams.get("scheda_id") ? Number(searchParams.get("scheda_id")) : null
  )
  const [durata, setDurata] = useState("")
  const [energia, setEnergia] = useState("")
  const [sonno, setSonno] = useState("")
  const [umore, setUmore] = useState("")
  const [note, setNote] = useState("")
  const [blocchi, setBlocchi] = useState<BloccoForm[]>([])

  const { data: schede } = useSchedeElenco(true)
  const { data: sessioneEsistente } = useDettaglioSessione(id ?? -1)
  const { data: target } = useBlocchiPrecompilati(modalitaModifica ? null : schedaId)
  const { data: esistenti } = useBlocchiSessione(modalitaModifica ? id : null)

  const salvaManuale = useSalvaManuale()
  const salvaModifica = useSalvaModifica(id ?? -1)

  // Precompila dai target della scheda scelta (nuovo inserimento).
  useEffect(() => {
    if (!modalitaModifica && target) setBlocchi(blocchiDaTarget(target))
  }, [modalitaModifica, target])

  // Precompila da quanto già registrato (modifica).
  useEffect(() => {
    if (modalitaModifica && esistenti) setBlocchi(blocchiDaEsistenti(esistenti))
  }, [modalitaModifica, esistenti])

  useEffect(() => {
    if (modalitaModifica && sessioneEsistente) {
      const s = sessioneEsistente.sessione
      setData(s.data)
      setSchedaId(s.scheda_id)
      setDurata(s.durata_minuti?.toString() ?? "")
      setEnergia(s.energia?.toString() ?? "")
      setSonno(s.sonno?.toString() ?? "")
      setUmore(s.umore?.toString() ?? "")
      setNote(s.note_generali)
    }
  }, [modalitaModifica, sessioneEsistente])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const payload = {
      data,
      scheda_id: schedaId,
      durata_minuti: durata ? Number(durata) : null,
      energia: energia ? Number(energia) : null,
      sonno: sonno ? Number(sonno) : null,
      umore: umore ? Number(umore) : null,
      note_generali: note,
      blocchi: blocchi.map(bloccoFormAInput),
    }
    if (modalitaModifica) {
      salvaModifica.mutate(payload)
    } else {
      salvaManuale.mutate(payload)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <h1 className="font-heading text-2xl font-semibold">
        {modalitaModifica ? "Modifica allenamento" : "Inserisci allenamento"}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="man-data">Data</Label>
            <Input
              id="man-data"
              type="date"
              value={data}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Scheda</Label>
            <Select
              value={schedaId?.toString() ?? ""}
              onValueChange={(v) => setSchedaId(Number(v))}
              disabled={modalitaModifica}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Scegli una scheda" />
              </SelectTrigger>
              <SelectContent>
                {schede?.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="man-durata">Durata (min)</Label>
            <Input id="man-durata" inputMode="numeric" value={durata} onChange={(e) => setDurata(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="man-energia">Energia 1-5</Label>
            <Input id="man-energia" inputMode="numeric" value={energia} onChange={(e) => setEnergia(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="man-sonno">Sonno 1-5</Label>
            <Input id="man-sonno" inputMode="numeric" value={sonno} onChange={(e) => setSonno(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="man-umore">Umore 1-5</Label>
            <Input id="man-umore" inputMode="numeric" value={umore} onChange={(e) => setUmore(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5 sm:col-span-4">
            <Label htmlFor="man-note">Note generali</Label>
            <Textarea id="man-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {!modalitaModifica && !schedaId && (
          <p className="text-sm text-muted-foreground">Scegli una scheda per compilare gli esercizi.</p>
        )}

        <div className="space-y-4">
          {blocchi.map((blocco, i) => (
            <ManualBlockCard
              key={blocco.chiave}
              blocco={blocco}
              onCambia={(nuovo) => setBlocchi(blocchi.map((b, j) => (j === i ? nuovo : b)))}
            />
          ))}
        </div>

        {blocchi.length > 0 && (
          <Button
            type="submit"
            size="lg"
            disabled={salvaManuale.isPending || salvaModifica.isPending}
            className="w-full"
          >
            Salva allenamento
          </Button>
        )}
      </form>
    </div>
  )
}
