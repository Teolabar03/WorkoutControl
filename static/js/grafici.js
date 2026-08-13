/* Grafici della pagina statistiche (Chart.js, servito in locale). */
(function () {
  "use strict";

  const DATI = window.DATI_GRAFICI || {};

  const INCHIOSTRO = "#e7e9ee";
  const GRIGLIA = "rgba(231, 233, 238, 0.10)";
  const ACCENTO = "#5ac8fa";
  const ACCENTO_2 = "#ffd166";
  const ACCENTO_3 = "#8ce99a";

  if (typeof Chart === "undefined") return;

  Chart.defaults.color = INCHIOSTRO;
  Chart.defaults.font.family =
    "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  Chart.defaults.maintainAspectRatio = false;

  function dataBreve(iso) {
    const parti = String(iso).split("-");
    return parti.length === 3 ? parti[2] + "/" + parti[1] : iso;
  }

  function assi(unita) {
    return {
      x: { grid: { color: GRIGLIA }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
      y: {
        beginAtZero: true,
        grid: { color: GRIGLIA },
        ticks: {
          callback: function (valore) {
            return unita ? valore + " " + unita : valore;
          },
        },
      },
    };
  }

  function disegna(idCanvas, tipo, dati, opzioni) {
    const canvas = document.getElementById(idCanvas);
    if (!canvas || !dati || !dati.labels || dati.labels.length === 0) return;
    new Chart(canvas, {
      type: tipo,
      data: {
        labels: dati.labels.map(dataBreve),
        datasets: [Object.assign({ data: dati.valori }, opzioni.dataset)],
      },
      options: Object.assign(
        {
          plugins: { legend: { display: false } },
          scales: assi(opzioni.unita),
        },
        opzioni.extra || {}
      ),
    });
  }

  disegna("grafico-volume", "line", DATI.volume, {
    unita: "kg",
    dataset: {
      label: "Volume (kg)",
      borderColor: ACCENTO,
      backgroundColor: "rgba(90, 200, 250, 0.15)",
      fill: true,
      tension: 0.3,
      pointRadius: 3,
    },
  });

  // maxBarThickness: con due o tre allenamenti Chart.js allargherebbe le barre
  // per tutta la larghezza del grafico, che e' proprio lo stato iniziale.
  const BARRA = 48;

  disegna("grafico-ripetizioni", "bar", DATI.ripetizioni, {
    dataset: {
      label: "Ripetizioni",
      backgroundColor: ACCENTO_3,
      borderRadius: 4,
      maxBarThickness: BARRA,
    },
  });

  if (DATI.progressione) {
    disegna("grafico-progressione", "line", DATI.progressione, {
      unita: DATI.progressione.unita,
      dataset: {
        label: DATI.progressione.nome,
        borderColor: ACCENTO_2,
        backgroundColor: "rgba(255, 209, 102, 0.15)",
        fill: true,
        tension: 0.25,
        pointRadius: 4,
      },
    });
  }

  disegna("grafico-frequenza", "bar", DATI.frequenza, {
    dataset: {
      label: "Allenamenti",
      backgroundColor: ACCENTO,
      borderRadius: 4,
      maxBarThickness: BARRA,
    },
    extra: {
      scales: {
        x: { grid: { color: GRIGLIA } },
        y: { beginAtZero: true, grid: { color: GRIGLIA }, ticks: { stepSize: 1 } },
      },
    },
  });

  disegna("grafico-aderenza", "bar", DATI.aderenza, {
    unita: "%",
    dataset: {
      label: "Aderenza",
      backgroundColor: ACCENTO_2,
      borderRadius: 4,
      maxBarThickness: BARRA,
    },
  });

  disegna("grafico-peso", "line", DATI.peso, {
    unita: "kg",
    dataset: {
      label: "Peso corporeo",
      borderColor: ACCENTO_3,
      backgroundColor: "rgba(140, 233, 154, 0.12)",
      fill: true,
      tension: 0.3,
      pointRadius: 3,
    },
    // Il peso corporeo oscilla in un intervallo stretto: partire da zero
    // schiaccerebbe la curva e nasconderebbe l'andamento.
    extra: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: GRIGLIA } },
        y: { beginAtZero: false, grid: { color: GRIGLIA } },
      },
    },
  });
})();
