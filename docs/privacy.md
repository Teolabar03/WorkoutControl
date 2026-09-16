# Dati e connessioni esterne

WorkoutControl conserva nel database SQLite utenti (password sotto forma di
hash), schede, allenamenti, peso, diario dolori, sonno, alimentazione, metriche,
suoni personalizzati, impostazioni e conversazioni AI. Non cifra il database:
chi può leggere il file o un suo backup può leggerne i dati. Proteggi account
del sistema operativo, disco e backup.

Un workout è un contenitore condiviso: tutti gli utenti assegnati a quel
workout ne vedono i dati. Per persone che devono avere dati separati crea
workout distinti. Le conversazioni AI sono della singola utenza; la libreria
esercizi è comune. Gli amministratori gestiscono utenti e assegnazioni, quindi
devono essere persone fidate. Gli allenatori hanno accesso in sola lettura.

## Quando partono richieste esterne

| Funzione | Destinazione e contenuto |
|---|---|
| Webapp senza AI | Il server configurato dall'utente. Font e risorse UI sono inclusi nella build; nessun caricamento da Google Fonts. |
| AI Anthropic/Gemini | Il provider selezionato riceve la domanda, la conversazione e il contesto degli allenamenti, comprese note, peso e diario dolori; gli strumenti possono leggere ulteriori dati e modificarli. Attiva il servizio solo se accetti questo invio e consulta le condizioni del provider. |
| Ollama | L'host configurato in `OLLAMA_HOST`. È locale solo se l'host e il modello scelti lo sono; non abilitare modelli remoti se vuoi evitare il cloud. |
| Android ufficiale | GitHub viene contattato all'avvio e al ritorno nell'app per verificare e scaricare aggiornamenti. Riceve i normali metadati di connessione, non il database degli allenamenti. |
| Samsung Health | Il telefono e l'app ponte inviano i dati selezionati al tuo server tramite il token del workout. L'import manuale carica lo storico sullo stesso server. |
| Installazione/aggiornamento | pip, npm e gli strumenti di build scaricano pacchetti dai rispettivi registri. |

La telemetria Capgo è disabilitata. Le build Android locali senza repository e
chiave pubblica degli aggiornamenti non contattano GitHub automaticamente.
Le chiavi dei provider rimangono sul server, in `.env` o nell'ambiente.
I font Barlow sono distribuiti con la licenza SIL OFL e i crediti originali
in `frontend/public/licenses/`, inclusi anche nelle build web e Android.

I dati restano salvati finché vengono eliminati dall'app o dal responsabile
dell'installazione; cancellare una riga non elimina copie presenti nei backup.
I log tecnici possono contenere indirizzi IP, percorsi ed errori: trattali come
materiale privato e non allegarli pubblicamente senza revisarli. L'ingest
evita intenzionalmente di registrare valori sanitari e valori degli header.

Per condividere il codice usa il download sorgenti GitHub o `git archive`.
Non comprimere l'intera cartella di lavoro: `.gitignore` non protegge uno ZIP
manuale e non rimuove file già committati o vecchi log e release.
