// Riproduzione dei suoni di fine recupero da browser.
//
// Nell'APK a suonare non è questo modulo ma il canale della notifica di sistema
// (vedi lib/notifiche.ts), perché a schermo spento l'AudioContext viene sospeso.
// Qui restano il bip di base, la decodifica dei file caricati e l'anteprima in
// Impostazioni.

import type { NuovoSuono } from "@/api/suoni"

/** Stesso limite del server (services/suoni.py): controllarlo prima evita di
 *  spedire un file per sentirsi rispondere che è troppo grande. */
export const MAX_SUONO_BYTE = 500 * 1024

// Alcuni browser lasciano vuoto File.type per formati che conoscono benissimo:
// in quel caso decide l'estensione.
const MIME_DA_ESTENSIONE: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
}

const MIME_AMMESSI = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
])

export function creaAudioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    return new Ctor()
  } catch {
    return null
  }
}

/** Il suono di base: tre bip brevi, abbastanza acuti da sentirsi con il
 *  telefono in tasca. */
export function beep(ctx: AudioContext) {
  ;[0, 0.28, 0.56].forEach((ritardo) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const inizio = ctx.currentTime + ritardo
    osc.type = "sine"
    osc.frequency.setValueAtTime(880, inizio)
    gain.gain.setValueAtTime(0.001, inizio)
    gain.gain.exponentialRampToValueAtTime(0.35, inizio + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, inizio + 0.2)
    osc.connect(gain).connect(ctx.destination)
    osc.start(inizio)
    osc.stop(inizio + 0.22)
  })
}

function byteDaBase64(base64: string): ArrayBuffer {
  const binario = atob(base64)
  const byte = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i)
  return byte.buffer
}

/** Si decodifica una volta sola, quando il suono arriva: a fine recupero il
 *  file deve partire subito, non dopo aver aspettato la decodifica. */
export function decodificaSuono(ctx: AudioContext, base64: string): Promise<AudioBuffer> {
  return ctx.decodeAudioData(byteDaBase64(base64))
}

export function riproduciBuffer(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const sorgente = ctx.createBufferSource()
  sorgente.buffer = buffer
  sorgente.connect(ctx.destination)
  sorgente.start()
  return sorgente
}

/** Legge un file scelto dall'utente e lo prepara per l'API. */
export async function leggiFileSuono(file: File): Promise<NuovoSuono> {
  const estensione = file.name.split(".").pop()?.toLowerCase() ?? ""
  const mime = (file.type || MIME_DA_ESTENSIONE[estensione] || "").toLowerCase()
  if (!MIME_AMMESSI.has(mime)) throw new Error("Formato non supportato: usa MP3, OGG, WAV o M4A.")
  if (file.size > MAX_SUONO_BYTE) throw new Error(`File troppo grande: massimo ${MAX_SUONO_BYTE / 1024} KB.`)

  const contenuto = await new Promise<string>((resolve, reject) => {
    const lettore = new FileReader()
    // Un data URL è "data:<mime>;base64,<contenuto>": serve solo la coda.
    lettore.onload = () => resolve(String(lettore.result).split(",", 2)[1] ?? "")
    lettore.onerror = () => reject(new Error("Impossibile leggere il file."))
    lettore.readAsDataURL(file)
  })

  const nome = file.name.replace(/\.[^.]+$/, "").trim().slice(0, 80) || "Suono"
  return { nome, mime, contenuto }
}

// Un contesto solo per le anteprime, tenuto vivo fra un ascolto e l'altro.
let ctxAnteprima: AudioContext | null = null
let anteprimaInCorso: AudioBufferSourceNode | null = null

/** Fa sentire un suono in Impostazioni.
 *
 *  Il contesto va creato e sbloccato *prima* di qualunque attesa, finché si è
 *  ancora dentro il tap: dopo il download del file il browser non considera più
 *  la riproduzione un gesto dell'utente e la bloccherebbe. Per questo il file
 *  arriva da una funzione e non come argomento. `null` = il bip di base. */
export async function anteprima(caricaContenuto: () => Promise<string | null>): Promise<void> {
  ctxAnteprima ??= creaAudioContext()
  const ctx = ctxAnteprima
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume()

  try {
    anteprimaInCorso?.stop()
  } catch {
    // Già finita.
  }
  anteprimaInCorso = null

  const contenuto = await caricaContenuto()
  if (contenuto === null) {
    beep(ctx)
    return
  }
  anteprimaInCorso = riproduciBuffer(ctx, await decodificaSuono(ctx, contenuto))
}
