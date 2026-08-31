import type { CapacitorConfig } from "@capacitor/cli"

// L'APK contiene il frontend: la build di Vite (frontend/dist) finisce dentro
// l'app e la WebView la serve da https://localhost, senza rete. Solo le
// chiamate API escono verso la VPS.
//
// Questo pero' sposta l'app su un'origin diversa da quella del server, e il
// login e' a cookie di sessione: da https://localhost il cookie del server e'
// di terza parte, e le WebView moderne li bloccano sempre di piu'. Da qui
// CapacitorHttp, che fa uscire fetch e XMLHttpRequest dal motore nativo
// invece che dalla WebView: niente origin, quindi niente CORS da aprire e
// niente SameSite da allentare, e i cookie li tiene il gestore nativo. Il
// backend resta identico a com'e' per il web.
//
// Il rovescio noto: passando dal motore nativo, l'upload multipart
// (l'import dell'export Samsung Health, in Impostazioni) puo' non funzionare.
// E' un'operazione una tantum che si fa comodamente da browser, quindi non
// vale la pena complicare il client API per coprirla anche qui.

const config: CapacitorConfig = {
  appId: "it.workoutcontrol.app",
  appName: "WorkoutControl",
  // La build del frontend, la stessa identica che gira sul web: qui i
  // percorsi relativi punterebbero dentro il telefono, e l'indirizzo del
  // server lo chiede l'app al primo avvio (frontend/src/lib/server.ts).
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
    CapacitorUpdater: {
      // Il controllo lo facciamo noi (frontend/src/lib/aggiornamenti.ts): il
      // bundle si scarica quando serve e si applica al riavvio successivo, mai
      // ricaricando l'app addosso a chi la sta usando.
      autoUpdate: false,
      // Se un bundle nuovo non conferma di essere partito entro questo tempo,
      // il plugin torna da solo al precedente. E' la sola protezione contro un
      // aggiornamento che non si avvia: su un telefono non si rimedia a mano.
      appReadyTimeout: 10000,
      resetWhenUpdate: true,
      // Spente entrambe perche' puntano ai server di Capgo, che qui non si
      // usano: gli aggiornamenti arrivano dalle release GitHub e il controllo
      // lo fa il frontend. Lasciandole ai valori predefiniti il plugin manda a
      // un servizio terzo non solo gli eventi di aggiornamento ma anche crash,
      // ANR, errori JavaScript e uscite per memoria esaurita — e riprova di
      // continuo, riempiendo il log di "Failed to send stats batch".
      statsUrl: "",
      updateUrl: "",
    },
  },
}

export default config
