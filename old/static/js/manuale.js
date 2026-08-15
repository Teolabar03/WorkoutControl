/*
 * Inserimento manuale: esercizi saltati, righe serie aggiungibili/rimovibili
 * e pulsanti +/- sui campi numerici.
 */
(function () {
  "use strict";

  function campi(riga) {
    return riga.querySelectorAll("input");
  }

  // --- Stato "saltato" ---------------------------------------------------
  function impostaSaltato(blocco, saltato) {
    const nascosto = blocco.querySelector('input[name^="saltato-"]');
    const bottone = blocco.querySelector(".btn-saltato");
    const etichetta = blocco.querySelector(".etichetta-saltato");
    const griglia = blocco.querySelector(".griglia-manuale");
    const aggiungi = blocco.querySelector(".btn-aggiungi-riga");

    nascosto.value = saltato ? "1" : "0";
    blocco.classList.toggle("saltato", saltato);
    bottone.setAttribute("aria-pressed", saltato ? "true" : "false");
    bottone.textContent = saltato ? "Annulla salto" : "Saltato";
    etichetta.hidden = !saltato;
    griglia.hidden = saltato;
    aggiungi.hidden = saltato;

    // I campi disabilitati non vengono inviati: cosi' un esercizio saltato non
    // porta con se' valori residui.
    blocco
      .querySelectorAll('.griglia-manuale input')
      .forEach(function (campo) {
        campo.disabled = saltato;
      });
  }

  // --- Righe -------------------------------------------------------------
  function rinumera(blocco) {
    const righe = blocco.querySelectorAll(".riga-manuale");
    righe.forEach(function (riga, indice) {
      riga.querySelector(".numero-serie").textContent = indice + 1;
    });
    // Con una sola riga rimasta, toglierla svuoterebbe l'esercizio: per quello
    // c'e' "Saltato", quindi il pulsante si disattiva.
    righe.forEach(function (riga) {
      riga.querySelector(".btn-togli-riga").disabled = righe.length <= 1;
    });
  }

  function prossimoIndice(blocco) {
    let massimo = 0;
    blocco.querySelectorAll(".riga-manuale").forEach(function (riga) {
      massimo = Math.max(massimo, parseInt(riga.dataset.indice, 10) || 0);
    });
    return massimo + 1;
  }

  function aggiungiRiga(blocco) {
    const chiave = blocco.dataset.chiave;
    const indice = prossimoIndice(blocco);
    const usaPeso = blocco.dataset.usaPeso === "1";
    const aTempo = blocco.dataset.aTempo === "1";
    const nomeValore = aTempo ? "durata" : "reps";

    const riga = document.createElement("div");
    riga.className = "riga-manuale";
    riga.dataset.indice = indice;

    const numero = document.createElement("span");
    numero.className = "numero-serie";
    riga.append(numero);

    if (usaPeso) {
      const peso = document.createElement("input");
      peso.type = "number";
      peso.name = "serie-" + chiave + "-" + indice + "-peso";
      peso.step = "0.5";
      peso.min = "0";
      peso.inputMode = "decimal";
      peso.setAttribute("aria-label", "Peso serie " + indice);
      peso.value = blocco.dataset.peso || "";
      riga.append(peso);
    }

    const gruppo = document.createElement("span");
    gruppo.className = "campo-passo";
    gruppo.append(creaBottonePasso(-1));
    const valore = document.createElement("input");
    valore.type = "number";
    valore.name = "serie-" + chiave + "-" + indice + "-" + nomeValore;
    valore.min = "1";
    valore.inputMode = "numeric";
    valore.setAttribute(
      "aria-label",
      (aTempo ? "Secondi serie " : "Ripetizioni serie ") + indice
    );
    // La nuova serie parte dall'ultima compilata, non dal target: di solito e'
    // la continuazione di quello che si stava facendo.
    valore.value = ultimoValore(blocco) || blocco.dataset.valore || "";
    gruppo.append(valore, creaBottonePasso(1));
    riga.append(gruppo);

    const nota = document.createElement("input");
    nota.type = "text";
    nota.name = "serie-" + chiave + "-" + indice + "-nota";
    nota.placeholder = "es. RIR 2";
    nota.setAttribute("aria-label", "Nota serie " + indice);
    riga.append(nota);

    const togli = document.createElement("button");
    togli.className = "btn-togli-riga";
    togli.type = "button";
    togli.textContent = "✕";
    togli.setAttribute("aria-label", "Togli questa serie");
    riga.append(togli);

    blocco.querySelector(".griglia-manuale").append(riga);
    rinumera(blocco);
    valore.focus();
  }

  function creaBottonePasso(passo) {
    const bottone = document.createElement("button");
    bottone.className = "btn-passo";
    bottone.type = "button";
    bottone.dataset.passo = String(passo);
    bottone.textContent = passo > 0 ? "+" : "−";
    bottone.setAttribute("aria-label", passo > 0 ? "Aumenta" : "Diminuisci");
    return bottone;
  }

  function ultimoValore(blocco) {
    const campi = blocco.querySelectorAll(
      '.campo-passo input'
    );
    for (let i = campi.length - 1; i >= 0; i--) {
      if (campi[i].value) return campi[i].value;
    }
    return "";
  }

  // --- Pulsanti +/- ------------------------------------------------------
  function applicaPasso(bottone) {
    const campo = bottone.parentElement.querySelector("input");
    if (!campo || campo.disabled) return;
    const minimo = parseInt(campo.min, 10) || 0;
    const attuale = parseInt(campo.value, 10);
    if (!Number.isFinite(attuale)) {
      // Da campo vuoto il primo click parte dal minimo, in entrambe le
      // direzioni: passare da vuoto a 2 sarebbe sconcertante.
      campo.value = minimo;
      return;
    }
    const passo = parseInt(bottone.dataset.passo, 10);
    campo.value = Math.max(minimo, attuale + passo);
  }

  // --- Collegamenti ------------------------------------------------------
  document.querySelectorAll(".blocco-manuale").forEach(function (blocco) {
    rinumera(blocco);

    // In modifica un esercizio gia' registrato come saltato riapre la pagina
    // nello stesso stato in cui era stato salvato.
    if (blocco.dataset.saltato === "1") {
      impostaSaltato(blocco, true);
    }

    blocco.querySelector(".btn-saltato").addEventListener("click", function () {
      impostaSaltato(blocco, !blocco.classList.contains("saltato"));
    });

    blocco.querySelector(".btn-svuota").addEventListener("click", function () {
      blocco.querySelectorAll(".riga-manuale input").forEach(function (campo) {
        campo.value = "";
      });
    });

    blocco
      .querySelector(".btn-aggiungi-riga")
      .addEventListener("click", function () {
        aggiungiRiga(blocco);
      });

    // Delegato: copre anche le righe create dopo il caricamento.
    blocco.addEventListener("click", function (evento) {
      const bersaglio = evento.target;
      if (bersaglio.classList.contains("btn-passo")) {
        applicaPasso(bersaglio);
      } else if (bersaglio.classList.contains("btn-togli-riga")) {
        const riga = bersaglio.closest(".riga-manuale");
        if (blocco.querySelectorAll(".riga-manuale").length > 1) {
          riga.remove();
          rinumera(blocco);
        }
      }
    });
  });
})();
