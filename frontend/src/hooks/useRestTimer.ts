import { useCallback, useEffect, useRef, useState } from "react"

import { NOTIFICA, annulla, disponibile, programma } from "@/lib/notifiche"

/**
 * Timer di recupero fedele 1:1 a static/js/sessione.js: non decrementa un
 * contatore, salva l'istante di fine in localStorage e ricalcola il tempo
 * residuo da Date.now() a ogni tick. È l'unico modo per restare corretto su
 * mobile, dove il browser rallenta o congela setInterval in background —
 * fondamentale qui perché il timer vive mentre lo schermo è spesso spento.
 *
 * Il conteggio resta corretto ovunque, ma l'*avviso* di fine no: da browser
 * dipende da AudioContext e wake lock, che a schermo spento Android sospende.
 * Dentro l'APK (vedi lib/notifiche.ts) l'avviso passa quindi da una notifica
 * di sistema programmata all'avvio del recupero, che scatta anche se l'app nel
 * frattempo viene chiusa. Su web non cambia niente.
 */
export function useRestTimer(sessioneId: number) {
  const chiave = `workout.timer.${sessioneId}`

  const [visibile, setVisibile] = useState(false)
  const [secondiRimanenti, setSecondiRimanenti] = useState(0)
  const [finito, setFinito] = useState(false)

  const intervalRef = useRef<number | null>(null)
  const suonatoRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const fineSalvata = useCallback((): number | null => {
    const grezzo = localStorage.getItem(chiave)
    if (!grezzo) return null
    const fine = parseInt(grezzo, 10)
    return Number.isFinite(fine) ? fine : null
  }, [chiave])

  // --- Audio: iOS/Chrome bloccano l'AudioContext finché l'utente non
  // interagisce con la pagina, quindi lo creiamo/sblocchiamo al primo tap.
  const preparaAudio = useCallback(() => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume()
      return
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    try {
      audioCtxRef.current = new Ctor()
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume()
    } catch {
      audioCtxRef.current = null
    }
  }, [])

  useEffect(() => {
    document.addEventListener("pointerdown", preparaAudio)
    return () => document.removeEventListener("pointerdown", preparaAudio)
  }, [preparaAudio])

  const beep = useCallback(() => {
    const audioCtx = audioCtxRef.current
    if (!audioCtx) return
    if (audioCtx.state === "suspended") audioCtx.resume()
    // Tre bip brevi, abbastanza acuti da sentirsi con lo schermo in tasca.
    ;[0, 0.28, 0.56].forEach((ritardo) => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      const inizio = audioCtx.currentTime + ritardo
      osc.type = "sine"
      osc.frequency.setValueAtTime(880, inizio)
      gain.gain.setValueAtTime(0.001, inizio)
      gain.gain.exponentialRampToValueAtTime(0.35, inizio + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, inizio + 0.2)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(inizio)
      osc.stop(inizio + 0.22)
    })
  }, [])

  const vibra = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200])
  }, [])

  const notifica = useCallback(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return
    try {
      const opzioni: NotificationOptions & { renotify?: boolean } = {
        body: "Vai con la prossima serie.",
        tag: "workout-recupero",
        renotify: true,
      }
      new Notification("Recupero finito", opzioni)
    } catch {
      // alcune piattaforme richiedono un service worker: ignoriamo
    }
  }, [])

  const attivaWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen")
      wakeLockRef.current.addEventListener("release", () => {
        wakeLockRef.current = null
      })
    } catch {
      wakeLockRef.current = null
    }
  }, [])

  const rilasciaWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  const disegnaTimer = useCallback(() => {
    const fine = fineSalvata()
    if (fine === null) {
      setVisibile(false)
      return
    }

    const rimanenti = Math.round((fine - Date.now()) / 1000)
    if (rimanenti > 0) {
      setSecondiRimanenti(rimanenti)
      setFinito(false)
      return
    }

    // Tempo scaduto — anche tornando da background dopo minuti, il calcolo
    // su Date.now() (non un contatore) dà comunque il risultato corretto.
    setSecondiRimanenti(0)
    setFinito(true)
    if (!suonatoRef.current) {
      suonatoRef.current = true
      // Nell'APK ci pensa la notifica di sistema, che Android fa scattare
      // anche ad app in primo piano: rifare qui bip e vibrazione vorrebbe
      // dire avvisare due volte.
      if (!disponibile()) {
        beep()
        vibra()
        notifica()
      }
    }
  }, [fineSalvata, beep, vibra, notifica])

  /** Sposta la notifica di sistema alla nuova fine del recupero.
   *
   *  Annulla sempre prima di riprogrammare: `avvia` viene richiamata anche a
   *  timer già in corso — basta registrare un'altra serie — e resterebbe in
   *  coda l'avviso del recupero precedente. */
  const riprogrammaAvviso = useCallback((fine: number) => {
    if (!disponibile()) return
    annulla(NOTIFICA.recuperoTimer).then(() =>
      programma({
        id: NOTIFICA.recuperoTimer,
        titolo: "Recupero finito",
        corpo: "Vai con la prossima serie.",
        quando: new Date(fine),
      })
    )
  }, [])

  const avvia = useCallback(
    (secondi: number) => {
      if (!secondi || secondi < 1) return
      preparaAudio()
      // Solo su web: nell'APK il permesso lo chiede il plugin nativo, e questo
      // dialogo in più confonderebbe senza servire a niente.
      if (!disponibile() && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission()
      }

      suonatoRef.current = false
      const fine = Date.now() + secondi * 1000
      localStorage.setItem(chiave, String(fine))
      riprogrammaAvviso(fine)
      setVisibile(true)
      setFinito(false)
      attivaWakeLock()

      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = window.setInterval(disegnaTimer, 250)
      disegnaTimer()
    },
    [chiave, preparaAudio, attivaWakeLock, disegnaTimer, riprogrammaAvviso]
  )

  const ferma = useCallback(() => {
    localStorage.removeItem(chiave)
    annulla(NOTIFICA.recuperoTimer)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setVisibile(false)
    setFinito(false)
    suonatoRef.current = false
    rilasciaWakeLock()
  }, [chiave, rilasciaWakeLock])

  const piuTrenta = useCallback(() => {
    const fine = fineSalvata()
    const base = fine !== null && fine > Date.now() ? fine : Date.now()
    const nuovaFine = base + 30_000
    localStorage.setItem(chiave, String(nuovaFine))
    riprogrammaAvviso(nuovaFine)
    suonatoRef.current = false
    setFinito(false)
    disegnaTimer()
  }, [chiave, fineSalvata, disegnaTimer, riprogrammaAvviso])

  // Al ritorno in primo piano il tempo va ricalcolato subito: il tick può
  // essere rimasto fermo per tutta la durata del background.
  useEffect(() => {
    function alTornareVisibile() {
      if (document.visibilityState !== "visible") return
      if (fineSalvata() !== null) {
        if (!intervalRef.current) intervalRef.current = window.setInterval(disegnaTimer, 250)
        setVisibile(true)
        disegnaTimer()
        attivaWakeLock()
      }
    }
    document.addEventListener("visibilitychange", alTornareVisibile)
    return () => document.removeEventListener("visibilitychange", alTornareVisibile)
  }, [fineSalvata, disegnaTimer, attivaWakeLock])

  // Timer ancora attivo da un ricaricamento della pagina.
  useEffect(() => {
    if (fineSalvata() !== null) {
      setVisibile(true)
      intervalRef.current = window.setInterval(disegnaTimer, 250)
      disegnaTimer()
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { visibile, secondiRimanenti, finito, avvia, ferma, piuTrenta }
}
