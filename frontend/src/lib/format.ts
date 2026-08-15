// Replica i filtri Jinja `data_it` e `numero` di app.py: l'API scambia sempre
// numeri JSON standard e date ISO, la virgola/il formato italiano restano un
// dettaglio di presentazione, mai sul wire.

export function dataIt(iso: string | null | undefined): string {
  if (!iso) return ""
  const [anno, mese, giorno] = iso.slice(0, 10).split("-")
  return `${giorno}/${mese}/${anno}`
}

export function numeroIt(valore: number | null | undefined): string {
  if (valore === null || valore === undefined) return ""
  // "%g"-like: niente zeri decimali inutili (1.5 -> "1,5", 2.0 -> "2").
  const testo = Number(valore.toPrecision(12)).toString()
  return testo.replace(".", ",")
}

export function parseNumeroIt(testo: string): number | null {
  if (!testo.trim()) return null
  const n = parseFloat(testo.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

export function tempoMmss(secondiTotali: number): string {
  const m = Math.floor(secondiTotali / 60)
  const s = secondiTotali % 60
  return `${m}:${String(s).padStart(2, "0")}`
}
