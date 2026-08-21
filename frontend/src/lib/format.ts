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

/** "21/08": l'asse di un grafico non ha spazio per l'anno. */
export function etichettaBreve(iso: string): string {
  return dataIt(iso).slice(0, 5)
}

/** Media aritmetica, null su lista vuota.
 *
 *  null e non 0: "nessun dato" e "media zero" sono cose diverse, e chi chiama
 *  mostra un trattino nel primo caso. */
export function media(valori: number[]): number | null {
  if (valori.length === 0) return null
  return valori.reduce((somma, v) => somma + v, 0) / valori.length
}

/** L'orario di un timestamp ISO, "13:45". */
export function oraIt(iso: string | null | undefined): string {
  if (!iso) return ""
  return iso.slice(11, 16)
}
