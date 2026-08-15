import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Cronometro a conteggio crescente per esercizi a tempo (es. plank), usato
 * in primo piano durante l'esecuzione: calcola i secondi da un timestamp di
 * inizio (Date.now()) invece di incrementare un contatore, così resta
 * corretto anche se il tick dell'interval viene ritardato dal browser.
 */
export function useCountUpTimer() {
  const [attivo, setAttivo] = useState(false)
  const [secondi, setSecondi] = useState(0)

  const inizioRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)

  const aggiorna = useCallback(() => {
    if (inizioRef.current === null) return
    setSecondi(Math.floor((Date.now() - inizioRef.current) / 1000))
  }, [])

  const avvia = useCallback(() => {
    inizioRef.current = Date.now()
    setSecondi(0)
    setAttivo(true)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = window.setInterval(aggiorna, 250)
  }, [aggiorna])

  const ferma = useCallback(() => {
    const elapsed = inizioRef.current !== null ? Math.floor((Date.now() - inizioRef.current) / 1000) : 0
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    inizioRef.current = null
    setSecondi(elapsed)
    setAttivo(false)
    return elapsed
  }, [])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return { attivo, secondi, avvia, ferma }
}
