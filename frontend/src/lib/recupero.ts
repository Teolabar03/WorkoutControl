// Stato del recupero condiviso fuori dal componente della sessione.
//
// Il timer vive in `useRestTimer`, ma deve potersi fermare anche da punti che
// quel componente non controlla: la chiusura dell'allenamento (che puo'
// completarsi quando la pagina e' gia' smontata) e il layout, che a nessuna
// sessione aperta spegne qualunque avviso rimasto in coda.
//
// Il motivo e' l'APK: li' l'avviso di fine recupero e' una notifica di sistema
// programmata in anticipo, che scatta anche se nel frattempo il JavaScript non
// c'e' piu'. Un annullamento perso vuol dire una notifica ad allenamento finito.

import { NOTIFICA, annulla, disponibile, programma } from "@/lib/notifiche"

const PREFISSO = "workout.timer."

export function chiaveRecupero(sessioneId: number): string {
  return `${PREFISSO}${sessioneId}`
}

// Programmare la notifica e' asincrono: il canale col suono personalizzato
// passa dal plugin nativo, e al primo recupero c'e' la richiesta dei permessi.
// Senza un ordine, uno stop arrivato in quel mentre raggiungeva il plugin
// *prima* della programmazione, che poi rimetteva in coda l'avviso. Per questo
// ogni operazione sulla notifica passa da questa fila e parte solo quando la
// precedente e' finita; in piu' la generazione fa saltare una programmazione
// superata da un avvio o da uno stop arrivati dopo di lei.
let generazione = 0
let fila: Promise<void> = Promise.resolve()

function inFila(operazione: () => Promise<void>): Promise<void> {
  const eseguita = fila.then(operazione)
  // Un errore non deve bloccare le operazioni successive.
  fila = eseguita.catch(() => {})
  return eseguita
}

/** Programma l'avviso di fine recupero all'istante `fine`. Il canale (cioe' il
 *  suono) si prepara in parallelo, ma la programmazione aspetta il suo turno. */
export function programmaAvvisoRecupero(fine: number, canale: Promise<string>): Promise<void> {
  if (!disponibile()) return Promise.resolve()
  const mia = ++generazione
  return inFila(async () => {
    const id = await canale
    if (mia !== generazione) return
    // Il plugin sostituisce da solo una notifica gia' in coda con lo stesso id.
    await programma({
      id: NOTIFICA.recuperoTimer,
      titolo: "Recupero finito",
      corpo: "Vai con la prossima serie.",
      quando: new Date(fine),
      canale: id,
    })
  })
}

/** Ferma il recupero: toglie l'istante di fine salvato e annulla la notifica.
 *  Senza `sessioneId` pulisce i timer di tutte le sessioni. Sicura da chiamare
 *  anche se non c'e' niente da fermare. */
export function fermaRecupero(sessioneId?: number): Promise<void> {
  generazione++
  try {
    if (sessioneId !== undefined) {
      localStorage.removeItem(chiaveRecupero(sessioneId))
    } else {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const chiave = localStorage.key(i)
        if (chiave?.startsWith(PREFISSO)) localStorage.removeItem(chiave)
      }
    }
  } catch {
    // Storage non disponibile: resta comunque da annullare la notifica.
  }
  return inFila(() => annulla(NOTIFICA.recuperoTimer))
}
