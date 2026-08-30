import type { CapacitorConfig } from "@capacitor/cli"

// L'APK non contiene il frontend: e' un guscio che apre in WebView la stessa
// webapp servita dalla VPS, con in piu' il bridge nativo (vedi
// frontend/src/lib/notifiche.ts). Cosi' il frontend resta uno solo, il login
// funziona come da browser perche' l'origin e' identica, e un push su main
// aggiorna anche l'app senza ricompilare niente.
//
// Il rovescio, dichiarato: la doc Capacitor sconsiglia server.url in
// produzione, perche' carica codice remoto in una WebView che ha accesso ai
// plugin nativi. Qui il perimetro e' minimo — app personale sideloadata, non
// su Play, origin e' la propria VPS in HTTPS con certificato valido, e l'unico
// plugin concesso sono le notifiche locali.
//
// CAP_SERVER_URL serve a puntare l'APK altrove senza toccare il file: in fase
// di prova si punta al dev server di Vite sulla rete di casa
// (CAP_SERVER_URL=http://192.168.x.x:5173), che essendo in chiaro richiede
// anche CAP_CLEARTEXT=1.
const url = process.env.CAP_SERVER_URL || "https://indirizzo-rimosso/workout/"
const cleartext = process.env.CAP_CLEARTEXT === "1"

const config: CapacitorConfig = {
  appId: "it.workoutcontrol.app",
  appName: "WorkoutControl",
  // Richiesto dalla CLI ma inutilizzato: con server.url la WebView non carica
  // mai i file locali. Contiene solo una pagina di cortesia, che si vede
  // unicamente se il server non risponde.
  webDir: "www",
  android: {
    // La webapp e' dark-native (index.html ha class="dark"): senza questo lo
    // sfondo bianco di default della WebView lampeggia a ogni avvio.
    backgroundColor: "#121212",
  },
  server: {
    url,
    cleartext,
  },
}

export default config
