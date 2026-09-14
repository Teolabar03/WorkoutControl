import type { Ruolo } from "@/api/auth"

export const RUOLI: { valore: Ruolo; etichetta: string; descrizione: string }[] = [
  {
    valore: "admin",
    etichetta: "Admin",
    descrizione: "Usa l'app sul proprio workout e gestisce utenze e workout di tutti.",
  },
  {
    valore: "standard",
    etichetta: "Standard",
    descrizione: "Usa l'app sui dati del proprio workout.",
  },
  {
    valore: "allenatore",
    etichetta: "Allenatore",
    descrizione: "Vede i dati del workout, senza avviare allenamenti né modificare niente.",
  },
]

export function etichettaRuolo(ruolo: Ruolo): string {
  return RUOLI.find((r) => r.valore === ruolo)?.etichetta ?? ruolo
}
