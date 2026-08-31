// Indirizzo del server, chiesto all'utente al primo avvio dell'app.
//
// Da browser non serve niente di tutto questo: la webapp la serve lo stesso
// Flask che espone l'API, quindi "/api" relativo al prefisso di deploy basta.
// Nell'APK invece il frontend e' impacchettato e la WebView lo serve da
// https://localhost: un percorso relativo cercherebbe l'API dentro il telefono.
//
// Prima l'indirizzo veniva inlineato in fase di build da VITE_API_ORIGIN, e
// questo voleva dire tenerlo scritto nella CI di un repo pubblico — da dove
// finiva comunque nei log delle Actions, che chiunque puo' leggere. Chiederlo
// all'utente al primo avvio toglie il problema alla radice: nel repo, nella
// build e nel bundle non c'e' piu' nessun indirizzo. In piu' lo stesso APK
// diventa installabile da chiunque contro la propria installazione.

import { Capacitor } from "@capacitor/core"

const CHIAVE = "workout.origin_api"

// Copia in memoria del valore salvato. Serve a due cose: evitare di rileggere
// localStorage a ogni chiamata API, e far funzionare comunque la sessione
// corrente se la WebView ci nega lo storage (in quel caso l'indirizzo si
// riperde alla chiusura, ma l'app non diventa inutilizzabile).
let inMemoria: string | null = null
let letto = false

export function nativo(): boolean {
  return Capacitor.isNativePlatform()
}

/** Ripulisce quello che l'utente ha scritto, o null se non e' utilizzabile.
 *
 *  Accetta anche un indirizzo senza schema ("casa.mia/workout") perche' su una
 *  tastiera del telefono e' la cosa che si scrive naturalmente. */
export function normalizzaOrigin(grezzo: string): string | null {
  const testo = grezzo.trim()
  if (!testo) return null

  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(testo) ? testo : `https://${testo}`)
  } catch {
    return null
  }

  // Android blocca il traffico in chiaro: accettare un http:// qui darebbe
  // un'app che si configura senza lamentarsi e poi fallisce ogni chiamata con
  // un errore di rete opaco.
  if (url.protocol !== "https:") return null

  // Il percorso conta: sulla VPS l'app sta sotto /workout/. Via le barre
  // finali, cosi' concatenare "/api" non produce mai una doppia barra.
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`
}

/** L'indirizzo configurato, o null se non e' ancora stato scelto. */
export function leggiOrigin(): string | null {
  if (letto) return inMemoria
  letto = true
  try {
    inMemoria = window.localStorage.getItem(CHIAVE)
  } catch {
    inMemoria = null
  }
  return inMemoria
}

export function salvaOrigin(origin: string): void {
  inMemoria = origin
  letto = true
  try {
    window.localStorage.setItem(CHIAVE, origin)
  } catch {
    // Storage negato: l'indirizzo vale per questa sessione e basta.
  }
}

/** Messaggio d'errore se il server non va bene, null se risponde come deve.
 *
 *  Non passa da `lib/api` di proposito: qui l'indirizzo non e' ancora salvato,
 *  e serve provarlo prima di scriverlo. Il controllo arriva fino alla forma
 *  della risposta perche' un indirizzo sbagliato spesso *risponde* — e' solo
 *  un altro sito — e salvarlo lascerebbe l'utente con errori incomprensibili
 *  a ogni schermata. */
export async function provaOrigin(origin: string): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(`${origin}/api/auth/me`, { cache: "no-store" })
  } catch {
    return "Nessuna risposta. Controlla l'indirizzo e che il telefono sia connesso."
  }

  if (res.status === 404) {
    return "Qualcosa risponde, ma non l'app: manca il prefisso nell'indirizzo? (es. .../workout)"
  }
  if (!res.ok) {
    return `Il server risponde con un errore (${res.status}).`
  }

  const body = (await res.json().catch(() => null)) as { data?: unknown } | null
  if (!body || typeof body !== "object" || !("data" in body)) {
    return "A questo indirizzo risponde qualcos'altro, non WorkoutControl."
  }
  return null
}
