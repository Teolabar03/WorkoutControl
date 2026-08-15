/*
 * Sessione attiva: registrazione serie e timer di recupero.
 *
 * Il timer non decrementa un contatore: salva l'istante di fine in
 * localStorage e ricalcola il tempo residuo da Date.now() a ogni tick.
 * E' l'unico modo per restare corretto su mobile, dove il browser rallenta
 * o congela setInterval quando la pagina va in background.
 */
(function () {
  "use strict";

  const CFG = window.WORKOUT;
  const CHIAVE_TIMER = "workout.timer." + CFG.sessioneId;

  const pannello = document.getElementById("pannello-timer");
  const valoreTimer = document.getElementById("timer-valore");

  // --- Audio -------------------------------------------------------------
  // iOS e Chrome bloccano l'audio finche' l'utente non interagisce: creiamo
  // e sblocchiamo l'AudioContext al primo tap sulla pagina.
  let audioCtx = null;

  function preparaAudio() {
    if (audioCtx) {
      if (audioCtx.state === "suspended") audioCtx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      audioCtx = new Ctor();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {
      audioCtx = null;
    }
  }

  document.addEventListener("pointerdown", preparaAudio, { once: false });

  function beep() {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    // Tre bip brevi, abbastanza acuti da sentirsi con lo schermo in tasca.
    [0, 0.28, 0.56].forEach(function (ritardo) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const inizio = audioCtx.currentTime + ritardo;
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, inizio);
      gain.gain.setValueAtTime(0.001, inizio);
      gain.gain.exponentialRampToValueAtTime(0.35, inizio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, inizio + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(inizio);
      osc.stop(inizio + 0.22);
    });
  }

  function vibra() {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  function notifica() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification("Recupero finito", {
        body: "Vai con la prossima serie.",
        tag: "workout-recupero",
        renotify: true,
      });
    } catch (e) {
      /* alcune piattaforme richiedono un service worker: ignoriamo */
    }
  }

  // --- Wake lock ---------------------------------------------------------
  let wakeLock = null;

  async function attivaWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", function () {
        wakeLock = null;
      });
    } catch (e) {
      wakeLock = null;
    }
  }

  function rilasciaWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
  }

  // --- Timer di recupero -------------------------------------------------
  let intervalloTimer = null;
  let suonato = false;

  function fineSalvata() {
    const grezzo = localStorage.getItem(CHIAVE_TIMER);
    if (!grezzo) return null;
    const fine = parseInt(grezzo, 10);
    return Number.isFinite(fine) ? fine : null;
  }

  function formatta(secondi) {
    const m = Math.floor(secondi / 60);
    const s = secondi % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function disegnaTimer() {
    const fine = fineSalvata();
    if (fine === null) {
      fermaTimer();
      return;
    }

    const rimanenti = Math.round((fine - Date.now()) / 1000);

    if (rimanenti > 0) {
      valoreTimer.textContent = formatta(rimanenti);
      pannello.classList.toggle("in-scadenza", rimanenti <= 10);
      return;
    }

    // Tempo scaduto — anche se ci arriviamo tornando da background dopo
    // minuti, il calcolo su Date.now() ce lo dice correttamente.
    valoreTimer.textContent = "0:00";
    pannello.classList.remove("in-scadenza");
    pannello.classList.add("finito");
    if (!suonato) {
      suonato = true;
      beep();
      vibra();
      notifica();
    }
  }

  function avviaTimer(secondi) {
    if (!secondi || secondi < 1) return;
    preparaAudio();
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    suonato = false;
    localStorage.setItem(CHIAVE_TIMER, String(Date.now() + secondi * 1000));
    pannello.hidden = false;
    pannello.classList.remove("finito");
    attivaWakeLock();

    if (intervalloTimer) clearInterval(intervalloTimer);
    intervalloTimer = setInterval(disegnaTimer, 250);
    disegnaTimer();
  }

  function fermaTimer() {
    localStorage.removeItem(CHIAVE_TIMER);
    if (intervalloTimer) {
      clearInterval(intervalloTimer);
      intervalloTimer = null;
    }
    pannello.hidden = true;
    pannello.classList.remove("finito", "in-scadenza");
    suonato = false;
    rilasciaWakeLock();
  }

  if (pannello) {
    document.getElementById("timer-stop").addEventListener("click", fermaTimer);
    document.getElementById("timer-piu").addEventListener("click", function () {
      const fine = fineSalvata();
      const base = fine !== null && fine > Date.now() ? fine : Date.now();
      localStorage.setItem(CHIAVE_TIMER, String(base + 30000));
      suonato = false;
      pannello.classList.remove("finito");
      disegnaTimer();
    });
  }

  // Al ritorno in primo piano il tempo va ricalcolato subito: il tick puo'
  // essere rimasto fermo per tutta la durata del background.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (fineSalvata() !== null) {
      if (!intervalloTimer) intervalloTimer = setInterval(disegnaTimer, 250);
      pannello.hidden = false;
      disegnaTimer();
      attivaWakeLock();
    }
  });

  // Timer ancora attivo da un ricaricamento della pagina.
  if (fineSalvata() !== null) {
    pannello.hidden = false;
    intervalloTimer = setInterval(disegnaTimer, 250);
    disegnaTimer();
  }

  // --- Cronometro della sessione ----------------------------------------
  const cronometro = document.getElementById("cronometro");
  if (cronometro) {
    const inizio = new Date(cronometro.dataset.inizio).getTime();
    const campoDurata = document.getElementById("campo-durata-finale");

    function aggiornaCronometro() {
      const trascorsi = Math.max(0, Math.floor((Date.now() - inizio) / 1000));
      const ore = Math.floor(trascorsi / 3600);
      const minuti = Math.floor((trascorsi % 3600) / 60);
      const secondi = trascorsi % 60;
      cronometro.textContent =
        (ore > 0 ? ore + ":" + String(minuti).padStart(2, "0") : String(minuti)) +
        ":" +
        String(secondi).padStart(2, "0");
      if (campoDurata) {
        campoDurata.placeholder = Math.max(1, Math.round(trascorsi / 60)) + " (calcolata)";
      }
    }

    aggiornaCronometro();
    setInterval(aggiornaCronometro, 1000);
  }

  // --- Registrazione serie ----------------------------------------------
  function numeroDaCampo(campo) {
    if (!campo || campo.value === "") return null;
    const valore = parseFloat(String(campo.value).replace(",", "."));
    return Number.isFinite(valore) ? valore : null;
  }

  function creaRigaSerie(blocco, serie) {
    const li = document.createElement("li");
    li.dataset.serie = serie.id;

    const numero = document.createElement("span");
    numero.className = "numero-serie";
    numero.textContent = serie.numero;

    const valore = document.createElement("span");
    valore.className = "valore-serie";
    let testo = "";
    if (serie.peso_kg) testo += String(serie.peso_kg).replace(".", ",") + " kg × ";
    testo += serie.durata_secondi ? serie.durata_secondi + "s" : serie.ripetizioni;
    valore.textContent = testo;

    li.append(numero, valore);

    if (serie.is_pr) {
      const badge = document.createElement("span");
      badge.className = "badge-pr";
      badge.textContent = "🏆 PR";
      li.append(badge);
    }
    if (serie.note) {
      const nota = document.createElement("span");
      nota.className = "nota-serie";
      nota.textContent = serie.note;
      li.append(nota);
    }

    const elimina = document.createElement("button");
    elimina.className = "btn-elimina-serie";
    elimina.type = "button";
    elimina.title = "Elimina serie";
    elimina.textContent = "×";
    li.append(elimina);

    blocco.querySelector(".serie-registrate").append(li);
  }

  function aggiornaContatore(blocco) {
    const fatte = blocco.querySelectorAll(".serie-registrate li").length;
    blocco.querySelector(".fatte").textContent = fatte;
    const target = parseInt(blocco.dataset.serieTarget, 10);
    blocco.classList.toggle("completo", fatte >= target);
  }

  function mostraErrore(blocco, testo) {
    const p = blocco.querySelector(".errore-serie");
    p.textContent = testo;
    p.hidden = false;
    setTimeout(function () {
      p.hidden = true;
    }, 5000);
  }

  function festeggiaPR(blocco) {
    blocco.classList.add("nuovo-pr");
    setTimeout(function () {
      blocco.classList.remove("nuovo-pr");
    }, 2500);
  }

  function aggiornaRecord(blocco, etichetta) {
    const span = blocco.querySelector(".record-attuale");
    if (!span) return;
    span.textContent = etichetta ? " · record " + etichetta : "";
  }

  async function registraSerie(blocco, bottone) {
    const corpo = {
      esercizio_scheda_id: parseInt(blocco.dataset.voce, 10),
      peso_kg: numeroDaCampo(blocco.querySelector(".campo-peso")),
      ripetizioni: numeroDaCampo(blocco.querySelector(".campo-reps")),
      durata_secondi: numeroDaCampo(blocco.querySelector(".campo-durata")),
      note: (blocco.querySelector(".campo-nota").value || "").trim(),
    };

    bottone.disabled = true;
    try {
      const risposta = await fetch(CFG.urlRegistraSerie, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dati = await risposta.json();

      if (!dati.ok) {
        mostraErrore(blocco, dati.errore || "Non è stato possibile salvare la serie.");
        return;
      }

      creaRigaSerie(blocco, dati.serie);
      aggiornaContatore(blocco);
      blocco.querySelector(".campo-nota").value = "";
      aggiornaRecord(blocco, dati.record);
      if (dati.nuovo_pr) festeggiaPR(blocco);

      avviaTimer(dati.timer || parseInt(blocco.dataset.timer, 10) || CFG.timerDefault);
    } catch (e) {
      mostraErrore(blocco, "Errore di rete: la serie non è stata salvata.");
    } finally {
      bottone.disabled = false;
    }
  }

  async function eliminaSerie(li) {
    const id = li.dataset.serie;
    const url = CFG.urlEliminaSerie.replace("/0/", "/" + id + "/");
    try {
      const risposta = await fetch(url, { method: "POST" });
      const dati = await risposta.json();
      if (!dati.ok) return;
      const blocco = li.closest(".blocco-esercizio");
      li.remove();
      // Il server ha rinumerato le serie rimaste: allineiamo la UI.
      blocco.querySelectorAll(".serie-registrate li").forEach(function (riga, indice) {
        riga.querySelector(".numero-serie").textContent = indice + 1;
      });
      aggiornaContatore(blocco);
      aggiornaRecord(blocco, dati.record);
    } catch (e) {
      /* niente da fare: la riga resta, un refresh mostra lo stato reale */
    }
  }

  document.querySelectorAll(".blocco-esercizio").forEach(function (blocco) {
    aggiornaContatore(blocco);

    blocco.querySelector(".btn-registra").addEventListener("click", function (evento) {
      registraSerie(blocco, evento.currentTarget);
    });

    blocco.querySelector(".btn-timer").addEventListener("click", function () {
      avviaTimer(parseInt(blocco.dataset.timer, 10) || CFG.timerDefault);
    });

    // Invio dal campo nota o dai campi numerici = registra la serie.
    blocco.querySelectorAll(".form-serie input").forEach(function (campo) {
      campo.addEventListener("keydown", function (evento) {
        if (evento.key === "Enter") {
          evento.preventDefault();
          registraSerie(blocco, blocco.querySelector(".btn-registra"));
        }
      });
    });

    blocco.addEventListener("click", function (evento) {
      if (evento.target.classList.contains("btn-elimina-serie")) {
        eliminaSerie(evento.target.closest("li"));
      }
    });
  });
})();
