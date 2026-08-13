/*
 * Avvio del server Ollama dall'interfaccia.
 *
 * Serve a due pagine — la chat, quando un messaggio fallisce perche' il server
 * locale e' spento, e le impostazioni, dove lo stato e' mostrato di proposito —
 * quindi la chiamata sta qui una volta sola. Chi la usa decide cosa fare dopo:
 * la chat rimanda il messaggio, le impostazioni ricaricano la pagina.
 */
window.Ollama = (function () {
  "use strict";

  // Avvia il server e restituisce { ok, messaggio }. L'avvio puo' richiedere
  // una trentina di secondi: il server risponde solo quando e' pronto.
  async function avvia(url) {
    try {
      const risposta = await fetch(url, { method: "POST" });
      const dati = await risposta.json();
      return {
        ok: Boolean(dati.ok),
        messaggio: dati.messaggio || "Avvio non riuscito.",
      };
    } catch (e) {
      return {
        ok: false,
        messaggio: "Non è stato possibile contattare l'app per avviare Ollama.",
      };
    }
  }

  // Pulsante pronto all'uso. `alTermine(esito)` viene chiamato con il risultato.
  function pulsante(url, alTermine) {
    const bottone = document.createElement("button");
    bottone.type = "button";
    bottone.className = "btn btn-primario btn-piccolo avvia-ollama";
    bottone.textContent = "Avvia Ollama";

    bottone.addEventListener("click", async function () {
      bottone.disabled = true;
      bottone.textContent = "Avvio in corso… (può richiedere ~30 s)";
      const esito = await avvia(url);
      if (esito.ok) {
        bottone.remove();
      } else {
        bottone.disabled = false;
        bottone.textContent = "Avvia Ollama";
      }
      alTermine(esito);
    });

    return bottone;
  }

  return { avvia: avvia, pulsante: pulsante };
})();
