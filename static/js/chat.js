/*
 * Chat con l'assistente AI: invio messaggi e rendering del Markdown.
 */
(function () {
  "use strict";

  const CFG = window.CHAT;
  const contenitore = document.getElementById("chat-messaggi");
  const form = document.getElementById("chat-form");
  const campo = document.getElementById("chat-testo");
  const bottone = document.getElementById("chat-invia");
  const scrivendo = document.getElementById("sta-scrivendo");
  const errore = document.getElementById("errore-chat");
  const campoN = document.getElementById("chat-n-sessioni");
  const selettore = document.getElementById("chat-modello");

  // --- Markdown minimale -------------------------------------------------
  // Il testo viene prima escapato e solo dopo si applicano i pattern: cosi'
  // nulla di quello che arriva dal modello puo' finire nel DOM come HTML.
  function escapeHtml(testo) {
    const div = document.createElement("div");
    div.textContent = testo;
    return div.innerHTML;
  }

  function inline(testo) {
    return testo
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
  }

  function markdown(testo) {
    const righe = escapeHtml(testo).split("\n");
    const pezzi = [];
    let listaAperta = null; // "ul" | "ol" | null
    let inCodice = false;
    let bufferCodice = [];

    function chiudiLista() {
      if (listaAperta) {
        pezzi.push("</" + listaAperta + ">");
        listaAperta = null;
      }
    }

    righe.forEach(function (riga) {
      if (/^\s*```/.test(riga)) {
        if (inCodice) {
          pezzi.push("<pre><code>" + bufferCodice.join("\n") + "</code></pre>");
          bufferCodice = [];
          inCodice = false;
        } else {
          chiudiLista();
          inCodice = true;
        }
        return;
      }
      if (inCodice) {
        bufferCodice.push(riga);
        return;
      }

      const titolo = riga.match(/^(#{1,4})\s+(.*)$/);
      if (titolo) {
        chiudiLista();
        const livello = Math.min(titolo[1].length + 2, 6);
        pezzi.push("<h" + livello + ">" + inline(titolo[2]) + "</h" + livello + ">");
        return;
      }

      const puntoElenco = riga.match(/^\s*[-*+]\s+(.*)$/);
      if (puntoElenco) {
        if (listaAperta !== "ul") {
          chiudiLista();
          pezzi.push("<ul>");
          listaAperta = "ul";
        }
        pezzi.push("<li>" + inline(puntoElenco[1]) + "</li>");
        return;
      }

      const numerato = riga.match(/^\s*\d+[.)]\s+(.*)$/);
      if (numerato) {
        if (listaAperta !== "ol") {
          chiudiLista();
          pezzi.push("<ol>");
          listaAperta = "ol";
        }
        pezzi.push("<li>" + inline(numerato[1]) + "</li>");
        return;
      }

      if (riga.trim() === "") {
        chiudiLista();
        return;
      }

      chiudiLista();
      pezzi.push("<p>" + inline(riga) + "</p>");
    });

    if (inCodice && bufferCodice.length) {
      pezzi.push("<pre><code>" + bufferCodice.join("\n") + "</code></pre>");
    }
    chiudiLista();
    return pezzi.join("");
  }

  // Rende il Markdown dei messaggi gia' presenti nella pagina.
  document.querySelectorAll('[data-markdown="1"]').forEach(function (nodo) {
    nodo.innerHTML = markdown(nodo.textContent);
  });

  // --- Invio -------------------------------------------------------------
  function inFondo() {
    contenitore.scrollTop = contenitore.scrollHeight;
  }

  // `opzioni`: { meta, markdown, azioni, avviso, id }.
  function aggiungiBolla(ruolo, testo, opzioni) {
    const opt = opzioni || {};
    const bolla = document.createElement("div");
    bolla.className = "bolla bolla-" + ruolo;
    if (opt.id) bolla.dataset.messaggio = opt.id;

    const corpo = document.createElement("div");
    corpo.className = "bolla-testo";
    if (opt.markdown) {
      corpo.innerHTML = markdown(testo);
    } else {
      corpo.textContent = testo;
    }
    bolla.append(corpo);

    // Le modifiche fatte dall'assistente vanno mostrate a parte dal testo:
    // sono le uniche righe che corrispondono a dati cambiati davvero.
    if (opt.azioni && opt.azioni.length) {
      const elenco = document.createElement("ul");
      elenco.className = "azioni-ai";
      opt.azioni.forEach(function (azione) {
        const voce = document.createElement("li");
        voce.textContent = azione;
        elenco.append(voce);
      });
      bolla.append(elenco);
    }

    // Avviso dell'app, non del modello: qualcosa non e' andato come previsto
    // pur essendo arrivata una risposta.
    if (opt.avviso) {
      const nota = document.createElement("p");
      nota.className = "avviso-bolla";
      nota.textContent = opt.avviso;
      bolla.append(nota);
    }

    if (opt.meta) {
      const etichetta = document.createElement("span");
      etichetta.className = "bolla-meta";
      etichetta.textContent = opt.meta;
      bolla.append(etichetta);
    }

    contenitore.insertBefore(bolla, scrivendo);
    inFondo();
    return bolla;
  }

  function metaDa(dati) {
    let meta = dati.data;
    if (dati.modello) meta += " · " + dati.modello;
    if (dati.n_sessioni_contesto) {
      meta += " · " + dati.n_sessioni_contesto + " allenamenti nel contesto";
    }
    return meta;
  }

  function mostraRisposta(dati) {
    aggiungiBolla("assistant", dati.risposta, {
      meta: metaDa(dati),
      markdown: true,
      azioni: dati.azioni,
      avviso: dati.avviso,
      id: dati.id_assistente,
    });

    // Il titolo viene generato dal primo messaggio: aggiorniamo la voce
    // nell'elenco senza costringere a ricaricare la pagina.
    const attiva = document.querySelector(".lista-conversazioni li.attiva strong");
    if (attiva && dati.titolo) attiva.textContent = dati.titolo;
  }

  function mostraErrore(testo, conAvvioOllama) {
    errore.textContent = testo;
    errore.hidden = false;
    if (conAvvioOllama) errore.append(pulsanteAvvioOllama());
  }

  // Nota mostrata sotto i puntini dell'attesa. `null` la toglie.
  function avvisoAttesa(testo) {
    let nota = document.getElementById("avviso-attesa");
    if (!testo) {
      if (nota) nota.remove();
      return;
    }
    if (!nota) {
      nota = document.createElement("span");
      nota.id = "avviso-attesa";
      nota.className = "aiuto";
      scrivendo.append(nota);
    }
    nota.textContent = testo;
  }

  // --- Avvio di Ollama ---------------------------------------------------
  // Quando il server locale e' spento la chat non puo' rispondere, ma e' un
  // problema che si risolve da qui: il pulsante lo avvia e rimanda il
  // messaggio, senza far uscire l'utente dall'app.
  function pulsanteAvvioOllama() {
    // Il testo va letto al click, non adesso: nel frattempo l'utente puo'
    // averlo corretto.
    return window.Ollama.pulsante(CFG.urlAvviaOllama, function (esito) {
      if (!esito.ok) {
        mostraErrore(esito.messaggio);
        return;
      }
      errore.hidden = true;
      errore.textContent = "";
      // L'avviso sul primo caricamento serve mentre si aspetta, non prima:
      // sta sotto i puntini finche' la risposta non arriva.
      avvisoAttesa(esito.messaggio);
      const daRimandare = campo.value.trim();
      if (daRimandare) invia(daRimandare);
    });
  }

  async function invia(testo) {
    const benvenuto = contenitore.querySelector(".chat-benvenuto");
    if (benvenuto) benvenuto.remove();

    errore.hidden = true;
    // Serve il riferimento all'elemento: se la richiesta fallisce va tolto
    // proprio questo, e un selettore sull'ultima bolla non basta (l'indicatore
    // "sta scrivendo" e' l'ultimo figlio del contenitore).
    const bollaInviata = aggiungiBolla("user", testo, {});

    campo.value = "";
    bloccaInvio(true);
    inFondo();

    try {
      const risposta = await fetch(CFG.urlMessaggio, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testo: testo,
          n_sessioni: parseInt(campoN.value, 10) || 10,
        }),
      });
      const dati = await risposta.json();

      if (!dati.ok) {
        mostraErrore(dati.errore || "Risposta non riuscita.", dati.ollama_da_avviare);
        // Il messaggio non e' stato salvato: lo rimettiamo nel campo cosi'
        // l'utente puo' riprovare senza riscriverlo.
        campo.value = testo;
        bollaInviata.remove();
        return;
      }

      bollaInviata.dataset.messaggio = dati.id_utente || "";
      mostraRisposta(dati);
    } catch (e) {
      mostraErrore("Errore di rete: il messaggio non è stato inviato.");
      campo.value = testo;
      bollaInviata.remove();
    } finally {
      bloccaInvio(false);
      segnaUltimoUtente();
      campo.focus();
      inFondo();
    }
  }

  function bloccaInvio(bloccato) {
    campo.disabled = bloccato;
    bottone.disabled = bloccato;
    scrivendo.hidden = !bloccato;
    if (!bloccato) avvisoAttesa(null);
  }

  // --- Modifica dell'ultimo messaggio ------------------------------------
  // Si puo' correggere solo l'ultimo messaggio inviato: rigiocarne uno in
  // mezzo vorrebbe dire rifare anche tutti i turni successivi.

  function segnaUltimoUtente() {
    contenitore
      .querySelectorAll(".btn-modifica")
      .forEach(function (vecchio) { vecchio.remove(); });

    const bolle = contenitore.querySelectorAll(".bolla-user[data-messaggio]");
    const ultima = bolle[bolle.length - 1];
    if (!ultima || !ultima.dataset.messaggio) return;
    // Se e' aperto l'editor il pulsante lo rimetterebbe sopra i campi: torna
    // da solo quando l'utente chiude o salva.
    if (ultima.querySelector("textarea")) return;

    const pulsante = document.createElement("button");
    pulsante.type = "button";
    pulsante.className = "btn-modifica";
    pulsante.textContent = "Modifica";
    pulsante.title = "Modifica il messaggio e rifai la risposta";
    pulsante.addEventListener("click", function () { apriModifica(ultima); });
    ultima.append(pulsante);
  }

  function apriModifica(bolla) {
    if (bolla.querySelector("textarea")) return;

    const corpo = bolla.querySelector(".bolla-testo");
    const originale = corpo.textContent;
    const pulsante = bolla.querySelector(".btn-modifica");

    const area = document.createElement("textarea");
    area.className = "modifica-testo";
    area.rows = 3;
    area.value = originale;

    const azioni = document.createElement("div");
    azioni.className = "modifica-azioni";
    const salva = document.createElement("button");
    salva.type = "button";
    salva.className = "btn btn-piccolo btn-primario";
    salva.textContent = "Rifai la risposta";
    const annulla = document.createElement("button");
    annulla.type = "button";
    annulla.className = "btn btn-piccolo";
    annulla.textContent = "Annulla";
    azioni.append(salva, annulla);

    function chiudi() {
      area.remove();
      azioni.remove();
      corpo.hidden = false;
      if (pulsante) pulsante.hidden = false;
    }

    corpo.hidden = true;
    if (pulsante) pulsante.hidden = true;
    corpo.after(area);
    area.after(azioni);
    area.focus();

    annulla.addEventListener("click", chiudi);
    salva.addEventListener("click", function () {
      const testo = area.value.trim();
      if (!testo) return;
      // L'editor resta aperto finche' non si sa com'e' andata: se la richiesta
      // fallisce, il testo corretto e' ancora li'. In caso di successo sparisce
      // insieme alla bolla, sostituita da quella nuova.
      rigenera(bolla, testo, false);
    });
  }

  // Toglie dal DOM questa bolla e tutte quelle dopo, senza toccare
  // l'indicatore "sta scrivendo" che resta l'ultimo figlio.
  function rimuoviDa(bolla) {
    let nodo = bolla;
    while (nodo && nodo !== scrivendo) {
      const successivo = nodo.nextElementSibling;
      nodo.remove();
      nodo = successivo;
    }
  }

  async function rigenera(bolla, testo, conferma) {
    const id = bolla.dataset.messaggio;
    if (!id) return;

    errore.hidden = true;
    bloccaInvio(true);
    inFondo();

    try {
      const risposta = await fetch(
        CFG.urlRigenera.replace("/0/rigenera", "/" + id + "/rigenera"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            testo: testo,
            n_sessioni: parseInt(campoN.value, 10) || 10,
            conferma: conferma === true,
          }),
        }
      );
      const dati = await risposta.json();

      // La risposta che si sta buttando aveva modificato dei dati, e quelle
      // modifiche restano fatte: va detto prima di procedere, perche' rifare
      // la richiesta puo' duplicarle.
      if (dati.conferma_richiesta) {
        const elenco = (dati.azioni || []).map(function (a) { return "• " + a; });
        const procedi = window.confirm(
          "La risposta che stai per rifare aveva già modificato i tuoi dati:\n\n" +
            elenco.join("\n") +
            "\n\nQueste modifiche NON verranno annullate. Procedo lo stesso?"
        );
        if (!procedi) return;
        await rigenera(bolla, testo, true);
        return;
      }

      if (!dati.ok) {
        mostraErrore(dati.errore || "Non è stato possibile rifare la risposta.",
                     dati.ollama_da_avviare);
        return;
      }

      rimuoviDa(bolla);
      aggiungiBolla("user", testo, { id: dati.id_utente });
      mostraRisposta(dati);
    } catch (e) {
      mostraErrore("Errore di rete: la risposta non è stata rifatta.");
    } finally {
      bloccaInvio(false);
      segnaUltimoUtente();
      inFondo();
    }
  }

  if (form) {
    form.addEventListener("submit", function (evento) {
      evento.preventDefault();
      const testo = campo.value.trim();
      if (testo) invia(testo);
    });

    // Invio manda il messaggio, Maiusc+Invio va a capo.
    campo.addEventListener("keydown", function (evento) {
      if (evento.key === "Enter" && !evento.shiftKey) {
        evento.preventDefault();
        form.requestSubmit();
      }
    });
  }

  document.querySelectorAll(".suggerimento").forEach(function (chip) {
    chip.addEventListener("click", function () {
      invia(chip.textContent.trim());
    });
  });

  // --- Scelta del modello ------------------------------------------------
  // L'elenco arriva dopo che la pagina e' gia' a schermo: chiederlo ai provider
  // costa una chiamata di rete a testa, e la chat deve aprirsi subito.

  async function caricaModelli() {
    if (!selettore) return;
    let dati;
    try {
      const risposta = await fetch(CFG.urlModelli);
      dati = await risposta.json();
    } catch (e) {
      // Nessun elenco: resta selezionabile il modello in uso, che e' gia'
      // nella pagina. Non e' un errore da mostrare.
      return;
    }
    if (!dati.ok || !dati.gruppi) return;

    selettore.textContent = "";
    dati.gruppi.forEach(function (gruppo) {
      const insieme = document.createElement("optgroup");
      insieme.label =
        gruppo.etichetta + (gruppo.raggiungibile ? "" : " — non raggiungibile");
      gruppo.modelli.forEach(function (modello) {
        const voce = document.createElement("option");
        voce.value = modello.chiave;
        voce.textContent =
          modello.etichetta + (modello.note ? " — " + modello.note : "");
        voce.selected = modello.chiave === dati.attivo;
        insieme.append(voce);
      });
      selettore.append(insieme);
    });
  }

  if (selettore) {
    let precedente = selettore.value;
    selettore.addEventListener("change", async function () {
      const scelta = selettore.value;
      selettore.disabled = true;
      try {
        const risposta = await fetch(CFG.urlCambiaModello, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modello: scelta }),
        });
        const dati = await risposta.json();
        if (!dati.ok) {
          mostraErrore(dati.errore || "Modello non cambiato.");
          selettore.value = precedente;
          return;
        }

        errore.hidden = true;
        precedente = scelta;
        document.getElementById("chat-provider").textContent = dati.provider || "";
        document.getElementById("chat-modello-nome").textContent = dati.modello || "";
        const riserva = document.getElementById("chat-riserva");
        riserva.hidden = !dati.riserva;
        document.getElementById("chat-riserva-nome").textContent = dati.riserva || "";
      } catch (e) {
        mostraErrore("Errore di rete: modello non cambiato.");
        selettore.value = precedente;
      } finally {
        selettore.disabled = false;
      }
    });
    caricaModelli();
  }

  segnaUltimoUtente();
  inFondo();
})();
