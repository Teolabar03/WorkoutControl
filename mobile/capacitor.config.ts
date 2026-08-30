import type { CapacitorConfig } from "@capacitor/cli"

// L'APK contiene il frontend: la build di Vite (frontend/dist) finisce dentro
// l'app e la WebView la serve da https://localhost, senza rete. Solo le
// chiamate API escono verso la VPS.
//
// Questo pero' sposta l'app su un'origin diversa da quella del server, e il
// login e' a cookie di sessione: da https://localhost il cookie di
// indirizzo-rimosso e' di terza parte, e le WebView moderne li bloccano sempre di
// piu'. Da qui CapacitorHttp, che fa uscire fetch e XMLHttpRequest dal motore
// nativo invece che dalla WebView: niente origin, quindi niente CORS da
// aprire e niente SameSite da allentare, e i cookie li tiene il gestore
// nativo. Il backend resta identico a com'e' per il web.
//
// Il rovescio noto: passando dal motore nativo, l'upload multipart
// (l'import dell'export Samsung Health, in Impostazioni) puo' non funzionare.
// E' un'operazione una tantum che si fa comodamente da browser, quindi non
// vale la pena complicare il client API per coprirla anche qui.

const config: CapacitorConfig = {
  appId: "it.workoutcontrol.app",
  appName: "WorkoutControl",
  // La build del frontend, prodotta con VITE_API_ORIGIN valorizzata perche'
  // qui i percorsi relativi punterebbero dentro il telefono.
  webDir: "../frontend/dist",
  android: {
    // La webapp e' dark-native (index.html ha class="dark"): senza questo lo
    // sfondo bianco di default della WebView lampeggia a ogni avvio.
    backgroundColor: "#121212",
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
