// Notifiche di sistema, disponibili solo quando l'app gira dentro il guscio
// Android (Capacitor). Da browser questo modulo non fa niente: ogni funzione
// esce subito e chi chiama tiene il comportamento web che aveva già.
//
// Serve perché il browser non è affidabile per avvisare a schermo spento —
// l'AudioContext viene sospeso, il wake lock cade, la Notification senza
// service worker non arriva. Una notifica programmata a livello di sistema
// invece scatta comunque, anche ad app chiusa: è tutto il motivo per cui
// esiste l'APK.
//
// Le notifiche si programmano *in anticipo*, all'istante in cui si conosce il
// momento in cui devono scattare, non quando quel momento arriva: se l'app nel
// frattempo viene uccisa non c'è più nessun JavaScript a farle partire.

import { Capacitor, registerPlugin } from "@capacitor/core"
import { LocalNotifications } from "@capacitor/local-notifications"

/** Id delle notifiche, uno per tipo.
 *
 *  Vanno tenuti distinti e stabili perché sono la chiave con cui si annulla o
 *  si riprogramma una notifica già in coda. Aggiungere un tipo nuovo (es. un
 *  promemoria "non ti alleni da N giorni") vuol dire aggiungere una voce qui e
 *  chiamare `programma`: il meccanismo sotto non cambia. */
export const NOTIFICA = {
  recuperoTimer: 1,
} as const

/** Canale Android su cui escono gli avvisi del timer.
 *
 *  Il canale, non la singola notifica, decide se suonare e vibrare a telefono
 *  bloccato: con importanza alta l'avviso passa, con quella di default resta
 *  silenzioso nella tendina. Le impostazioni del canale si fissano alla
 *  creazione e Android non le rilegge più, quindi cambiarle in seguito
 *  richiede un id nuovo. */
const CANALE = "recupero"

export interface NotificaProgrammata {
  id: number
  titolo: string
  corpo: string
  /** Istante in cui deve scattare. */
  quando: Date
  /** Canale su cui esce, quindi il suono che fa. Di default quello di base. */
  canale?: string
}

/** Vero solo dentro l'APK: da browser Capacitor riporta la piattaforma "web". */
export function disponibile(): boolean {
  return Capacitor.isNativePlatform()
}

// --- Suoni personalizzati ---------------------------------------------------
//
// Il suono di una notifica Android lo decide il canale, e il plugin delle
// notifiche sa creare canali solo con suoni impacchettati nell'APK (res/raw).
// Un suono caricato da Impostazioni arriva a runtime, quindi passa da un
// plugin nostro (SuoniNotificaPlugin.java nel progetto Android) che salva il
// file nella memoria dell'app e crea un canale apposta per quel suono: dato
// che Android non lascia cambiare il suono di un canale esistente, il canale
// prende il nome dall'impronta del file.
//
// Un APK precedente al plugin non lo registra: lì si resta sul canale di base.

interface SuoniNotificaPlugin {
  preparaCanale(opzioni: { nome: string; contenuto: string; estensione: string }): Promise<{ canale: string }>
}

const SuoniNotifica = registerPlugin<SuoniNotificaPlugin>("SuoniNotifica")

/** Vero se l'APK in uso sa far suonare alle notifiche un suono caricato. */
export function suoniPersonalizzatiNativi(): boolean {
  return disponibile() && Capacitor.isPluginAvailable("SuoniNotifica")
}

export interface SuonoCanale {
  nome: string
  /** Il file in base64. */
  contenuto: string
  estensione: string
}

// Il file passa dal bridge a ogni recupero avviato: ricordare l'ultimo canale
// preparato evita di rispedirlo quando il suono non è cambiato.
let canalePreparato: { contenuto: string; canale: string } | null = null

/** Il canale da usare per l'avviso di fine recupero con questo suono.
 *  Non fallisce mai: nel dubbio torna il canale di base, che suona comunque. */
export async function canaleRecupero(suono: SuonoCanale | null | undefined): Promise<string> {
  if (!suono || !suoniPersonalizzatiNativi()) return CANALE
  if (canalePreparato?.contenuto === suono.contenuto) return canalePreparato.canale
  try {
    const { canale } = await SuoniNotifica.preparaCanale({
      nome: suono.nome,
      contenuto: suono.contenuto,
      estensione: suono.estensione,
    })
    canalePreparato = { contenuto: suono.contenuto, canale }
    return canale
  } catch {
    return CANALE
  }
}

// Permessi e canale servono una volta sola per avvio dell'app, ma la prima
// notifica può partire da più punti: teniamo la promessa così le chiamate
// successive non riaprono il dialogo dei permessi.
let pronto: Promise<boolean> | null = null

/** Chiede i permessi e crea il canale. Idempotente.
 *
 *  Da Android 13 POST_NOTIFICATIONS è un permesso a richiesta esplicita: senza,
 *  le notifiche vengono programmate e scartate in silenzio. Viene invocata da
 *  `programma`, quindi il dialogo compare al primo recupero avviato — un
 *  momento in cui la richiesta si spiega da sé — ma è esportata per poterla
 *  anticipare all'avvio quando si aggiungeranno notifiche non legate al timer. */
export function inizializza(): Promise<boolean> {
  if (!disponibile()) return Promise.resolve(false)
  if (pronto) return pronto

  pronto = (async () => {
    try {
      await LocalNotifications.createChannel({
        id: CANALE,
        name: "Timer di recupero",
        description: "Avvisa quando finisce il recupero fra le serie.",
        importance: 4,
        vibration: true,
      })

      const stato = await LocalNotifications.checkPermissions()
      if (stato.display === "granted") return true
      const richiesta = await LocalNotifications.requestPermissions()
      return richiesta.display === "granted"
    } catch {
      // Permesso negato, plugin assente, canale già esistente con altri
      // parametri: in ogni caso si continua senza notifiche di sistema invece
      // di far fallire l'avvio del timer, che deve partire comunque.
      return false
    }
  })()

  return pronto
}

/** Programma una notifica. Silenziosamente ignorata su web. */
export async function programma({ id, titolo, corpo, quando, canale }: NotificaProgrammata): Promise<void> {
  if (!disponibile()) return
  if (!(await inizializza())) return

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: titolo,
          body: corpo,
          channelId: canale ?? CANALE,
          // allowWhileIdle sveglia il telefono anche in Doze: senza, un
          // recupero avviato e messo in tasca suonerebbe quando il sistema
          // decide, cioè potenzialmente minuti dopo.
          schedule: { at: quando, allowWhileIdle: true },
        },
      ],
    })
  } catch {
    // Vedi sopra: il timer a schermo resta valido comunque.
  }
}

/** Annulla una notifica programmata. Sicura da chiamare anche se non c'è. */
export async function annulla(id: number): Promise<void> {
  if (!disponibile()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] })
  } catch {
    // Niente da annullare, o plugin non disponibile.
  }
}
