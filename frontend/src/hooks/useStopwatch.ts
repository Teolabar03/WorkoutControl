import { useEffect, useState } from "react"

export function useStopwatch(iniziataAlle: string) {
  const inizio = new Date(iniziataAlle).getTime()
  const [trascorsi, setTrascorsi] = useState(() => Math.max(0, Math.floor((Date.now() - inizio) / 1000)))

  useEffect(() => {
    const id = window.setInterval(() => {
      setTrascorsi(Math.max(0, Math.floor((Date.now() - inizio) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [inizio])

  const ore = Math.floor(trascorsi / 3600)
  const minuti = Math.floor((trascorsi % 3600) / 60)
  const secondi = trascorsi % 60
  const testo =
    (ore > 0 ? `${ore}:${String(minuti).padStart(2, "0")}` : String(minuti)) +
    ":" +
    String(secondi).padStart(2, "0")

  return { trascorsiSecondi: trascorsi, testo }
}
