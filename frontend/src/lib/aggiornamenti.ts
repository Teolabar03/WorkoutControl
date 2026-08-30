// Aggiornamento dell'app Android senza reinstallarla.
//
// L'APK impacchetta il frontend, quindi senza questo ogni modifica alla UI
// richiederebbe di scaricare e reinstallare un APK su ogni dispositivo. Qui
// invece si sostituisce il solo bundle web, che e' cio' che cambia quasi
// sempre: la CI lo pubblica come asset di una release GitHub, l'app lo scarica
// e lo applica al riavvio successivo, senza che nessuno tocchi niente.
//
// Resta fuori il caso in cui cambia la parte nativa (un plugin nuovo, il
// manifest, la versione di Capacitor): li' serve un APK nuovo, e Android non
// lascia installarlo senza un tap dell'utente. Non e' aggirabile, quindi
// `apkDaAggiornare` si limita a segnalarlo in Impostazioni.
//
// Da browser tutto questo non esiste: ogni funzione esce subito.

import { Capacitor } from "@capacitor/core"
import { App } from "@capacitor/app"
import { CapacitorUpdater } from "@capgo/capacitor-updater"

// `latest` salta le prerelease, che e' come le build del branch restano fuori
// dai dispositivi: solo una release vera raggiunge i telefoni.
const URL_MANIFEST =
  "https://github.com/Teolabar03/WorkoutControl/releases/latest/download/manifest.json"

interface Manifest {
  /** Versione del bundle web pubblicato. */
  versione: string
  bundle_url: string
  /** versionCode dell'APK pubblicato, per capire se il nativo e' indietro. */
  apk_version_code: number
  apk_url: string
}

// Evita di riscaricare lo stesso bundle a ogni ritorno in primo piano: una
// volta accodato resta li' fino al riavvio, e ripetere il download sarebbe
// solo traffico sprecato.
let versioneAccodata: string | null = null

function nativo(): boolean {
  return Capacitor.isNativePlatform()
}

async function leggiManifest(): Promise<Manifest | null> {
  try {
    const res = await fetch(URL_MANIFEST, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as Manifest
  } catch {
    // Offline, o release non ancora pubblicata: si riprova al giro dopo.
    return null
  }
}

/** Dice al plugin che l'app e' partita davvero.
 *
 *  Da chiamare a ogni avvio, il prima possibile: se un bundle difettoso non ci
 *  arriva entro il timeout, il plugin torna da solo al precedente. E' l'unica
 *  rete di sicurezza che abbiamo — su un telefono altrui non si puo' rimediare
 *  a mano a un aggiornamento che non parte. */
export async function segnalaAvvioRiuscito(): Promise<void> {
  if (!nativo()) return
  try {
    await CapacitorUpdater.notifyAppReady()
  } catch {
    // Ignorata: se fallisce qui, al massimo scatta il rollback.
  }
}

/** Scarica il bundle nuovo, se c'e', e lo accoda per il riavvio successivo.
 *
 *  Deliberatamente `next` e non `set`: `set` ricaricherebbe l'app all'istante,
 *  e farlo mentre si registra una serie a meta' allenamento sarebbe un ottimo
 *  modo per far perdere dei dati. */
export async function controllaAggiornamenti(): Promise<void> {
  if (!nativo()) return

  try {
    const manifest = await leggiManifest()
    if (!manifest?.versione || !manifest.bundle_url) return
    if (versioneAccodata === manifest.versione) return

    const attuale = await CapacitorUpdater.current()
    if (attuale.bundle.version === manifest.versione) return

    const bundle = await CapacitorUpdater.download({
      url: manifest.bundle_url,
      version: manifest.versione,
    })
    await CapacitorUpdater.next({ id: bundle.id })
    versioneAccodata = manifest.versione
  } catch {
    // Download interrotto, zip corrotto, spazio finito: si riprova al prossimo
    // ritorno in primo piano, e intanto l'app continua con quello che ha.
  }
}

export interface StatoApp {
  /** Versione del bundle web in esecuzione ("builtin" se e' quella dell'APK). */
  versioneWeb: string
  /** Valorizzato solo se e' uscito un APK piu' recente di quello installato. */
  apkUrl: string | null
}

/** Cosa mostrare in Impostazioni: la versione attiva e, se serve, il link
 *  all'APK nuovo. E' l'unico punto in cui l'aggiornamento chiede un tap. */
export async function statoApp(): Promise<StatoApp | null> {
  if (!nativo()) return null

  try {
    const attuale = await CapacitorUpdater.current()
    const manifest = await leggiManifest()
    const info = await App.getInfo()

    // `build` e' il versionCode: se quello pubblicato e' piu' alto, la parte
    // nativa e' cambiata e il bundle web da solo non basta piu'.
    const installato = Number.parseInt(info.build, 10)
    const pubblicato = manifest?.apk_version_code ?? 0
    const apkVecchio = Number.isFinite(installato) && pubblicato > installato

    return {
      versioneWeb: attuale.bundle.version,
      apkUrl: apkVecchio ? (manifest?.apk_url ?? null) : null,
    }
  } catch {
    return null
  }
}

/** Registra il controllo all'avvio e a ogni ritorno in primo piano.
 *
 *  Il ritorno in primo piano conta piu' dell'avvio: l'app resta aperta per
 *  giorni, e senza questo un aggiornamento aspetterebbe la prima chiusura
 *  completa. Restituisce la funzione per disiscriversi. */
export function avviaControlloPeriodico(): () => void {
  if (!nativo()) return () => {}

  void controllaAggiornamenti()

  const ascoltatore = App.addListener("resume", () => {
    void controllaAggiornamenti()
  })

  return () => {
    void ascoltatore.then((h) => h.remove())
  }
}
