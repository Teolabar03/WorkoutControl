// Il periodo osservato dalle sezioni Salute e Nutrizione è un intervallo di
// date esplicito, non un numero di giorni: "ultimi 30" risponde male alla
// domanda "com'è andata la settimana in cui ero in ferie". I preset restano,
// ma come scorciatoie per compilare gli estremi, non come unica scelta.

import { dataIt } from "@/lib/format"

export interface Periodo {
  /** Primo giorno incluso, ISO AAAA-MM-GG. */
  dal: string
  /** Ultimo giorno incluso, ISO AAAA-MM-GG. */
  al: string
}

/** Le durate offerte come scorciatoia, in giorni. */
export const PRESET_GIORNI = [7, 30, 90]

/** La data locale in ISO.
 *
 *  Non `toISOString()`: quello formatta in UTC e in Italia, fra mezzanotte e
 *  le due, restituirebbe il giorno prima — proprio nella fascia oraria in cui
 *  si guarda il telefono prima di dormire.
 */
export function isoLocale(d: Date): string {
  const mese = String(d.getMonth() + 1).padStart(2, "0")
  const giorno = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mese}-${giorno}`
}

/** L'intervallo degli ultimi N giorni, `al` incluso. */
export function periodoPreset(giorni: number, al: string): Periodo {
  const fine = new Date(`${al}T00:00:00`)
  fine.setDate(fine.getDate() - (giorni - 1))
  return { dal: isoLocale(fine), al }
}

/** Quanti giorni copre l'intervallo, estremi inclusi. */
export function giorniPeriodo(p: Periodo): number {
  const dal = new Date(`${p.dal}T00:00:00`).getTime()
  const al = new Date(`${p.al}T00:00:00`).getTime()
  return Math.floor((al - dal) / 86_400_000) + 1
}

/** Un intervallo rovesciato l'API lo rifiuta con un 422: meglio non chiederglielo. */
export function periodoValido(p: Periodo): boolean {
  return !!p.dal && !!p.al && p.dal <= p.al
}

/** Il preset che corrisponde esattamente all'intervallo, se ce n'è uno.
 *
 *  Serve solo a illuminare il bottone giusto: un intervallo scelto a mano che
 *  per caso è lungo 30 giorni ma finisce ieri non è "ultimi 30 giorni".
 */
export function presetAttivo(p: Periodo, oggi: string): number | null {
  if (p.al !== oggi) return null
  return PRESET_GIORNI.find((n) => periodoPreset(n, oggi).dal === p.dal) ?? null
}

/** Il periodo contiene il giorno corrente, quindi un giorno ancora incompleto. */
export function contieneOggi(p: Periodo, oggi: string): boolean {
  return p.dal <= oggi && oggi <= p.al
}

/** "dal 01/08 al 30/08 · 30 giorni", da mettere accanto al titolo di una
 *  sezione di trend: così i numeri di sintesi dicono sempre su cosa sono
 *  calcolati, invece di lasciarlo indovinare dal bottone acceso. */
export function etichettaPeriodo(p: Periodo): string {
  return `dal ${dataIt(p.dal)} al ${dataIt(p.al)} · ${giorniPeriodo(p)} giorni`
}
