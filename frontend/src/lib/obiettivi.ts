// Gli obiettivi giornalieri non sono bersagli da centrare al grammo: mangiare
// 2280 kcal su un obiettivo di 2300 è centrato quanto mangiarne 2300 esatte, e
// un'interfaccia che segna il primo come "mancato" mente. Qui i target secchi
// diventano intervalli, allargati dalla percentuale di tolleranza scelta in
// Impostazioni.

export interface RangeObiettivo {
  min: number
  max: number
  target: number
}

export type StatoObiettivo = "sotto" | "dentro" | "sopra"

/** Il range attorno a un target, o null se il target non è impostato.
 *
 *  Vale la convenzione di tutta l'app: 0 = non impostato, e senza obiettivo non
 *  c'è niente da confrontare. Con tolleranza 0 il range collassa sul valore
 *  secco, che è il comportamento che l'app aveva prima. */
export function rangeObiettivo(
  target: number,
  tolleranzaPct: number
): RangeObiettivo | null {
  if (!target || target <= 0) return null
  const scarto = (target * Math.max(0, tolleranzaPct)) / 100
  return { min: Math.round(target - scarto), max: Math.round(target + scarto), target }
}

export function statoObiettivo(valore: number, r: RangeObiettivo): StatoObiettivo {
  if (valore < r.min) return "sotto"
  if (valore > r.max) return "sopra"
  return "dentro"
}

/** "2070–2530 kcal", oppure "2300 kcal" quando la tolleranza è zero. */
export function etichettaRange(r: RangeObiettivo, unita: string): string {
  const suffisso = unita ? ` ${unita}` : ""
  if (r.min === r.max) return `${r.min}${suffisso}`
  return `${r.min}–${r.max}${suffisso}`
}

// Le classi Tailwind dei tre stati, in un posto solo perché barra, pastiglie e
// grafici raccontino la stessa cosa con lo stesso colore. Il verde lime è il
// colore che il design system riserva ai risultati centrati (i PR), ed è quello
// che si vuole vedere quando si è dentro l'obiettivo.
export const COLORE_STATO: Record<StatoObiettivo, string> = {
  sotto: "bg-primary",
  dentro: "bg-accent",
  sopra: "bg-warning",
}

export const TESTO_STATO: Record<StatoObiettivo, string> = {
  sotto: "text-muted-foreground",
  dentro: "text-accent",
  sopra: "text-warning",
}

export const ETICHETTA_STATO: Record<StatoObiettivo, string> = {
  sotto: "Sotto",
  dentro: "In linea",
  sopra: "Sopra",
}
