# WorkoutTracker

Webapp locale per tenere traccia degli allenamenti a casa. Single-user, nessun
login, dati su SQLite in `instance/workout.db`.

## Avvio

```bash
pip install -r requirements.txt
python app.py
```

L'app parte su <http://127.0.0.1:8456>. Al primo avvio crea il database e ci
carica la libreria esercizi e le due schede prese da `Schede.txt`.

Il frontend (React) va compilato una volta prima del primo avvio:

```bash
cd frontend
npm install
npm run build
cd ..
python app.py
```

`avvia.bat` fa tutto questo da solo — compila il frontend se manca o se i
sorgenti sono più recenti dell'ultima build, poi avvia `python app.py` — quindi
di norma basta lanciare quello.

### Sviluppo sul frontend

Per lavorare sul frontend con hot-reload servono due processi in parallelo:

```bash
python app.py                 # API su :8456
cd frontend && npm run dev    # Vite su :5173, proxy /api verso :8456
```

Si sviluppa aprendo <http://localhost:5173>; `npm run build` genera
`frontend/dist`, servito poi da `python app.py` da solo.

### Usarla dal telefono

Copia `.env.example` in `.env` (contiene già `WORKOUT_HOST=0.0.0.0`), riavvia e
apri `http://IP-DEL-PC:8456` dal telefono collegato alla stessa rete WiFi.
Al primo avvio del timer concedi il permesso alle notifiche: serve a sentire la
fine del recupero anche con lo schermo spento.

## Registrare un allenamento

Due strade:

- **Sessione live** — "Avvia" dal calendario o da una scheda: registri le serie
  una a una mentre ti alleni, con timer di recupero e segnalazione dei PR.
- **Inserimento manuale** — "Inserisci manualmente": scegli data e scheda e
  compili tutte le serie in un colpo solo, anche per giorni passati. Le righe
  arrivano già precompilate con i target della scheda.

Nell'inserimento manuale ogni esercizio ha:

| Controllo | Cosa fa |
|---|---|
| **− / +** accanto a ripetizioni e secondi | Correggono il valore senza digitare, comodi da telefono |
| **+ Serie** e **✕** sulla riga | Aggiungono o tolgono serie: puoi registrarne più o meno di quelle previste |
| **Saltato** | Segna l'esercizio come non svolto, con un motivo facoltativo |
| **Svuota** | Azzera i campi lasciando l'esercizio in elenco |

"Saltato" e "Svuota" non sono la stessa cosa: **saltato viene registrato** e
compare nel dettaglio della giornata e nel contesto dell'assistente AI, che può
così notare un esercizio evitato spesso. Svuotare invece lascia semplicemente
l'esercizio senza serie, senza dire perché.

## Correggere un allenamento salvato

Nel dettaglio della giornata, il pulsante **✎ Modifica** riapre l'allenamento
nello stesso form dell'inserimento manuale, con i valori già registrati: si
correggono pesi, ripetizioni, note e data, si aggiungono o tolgono serie e si
cambia lo stato "saltato". Vale per qualsiasi allenamento completato, sia
inserito a mano sia registrato in sessione live.

Salvando, i **record personali vengono ricalcolati** su tutto lo storico: se il
peso corretto era in realtà un PR il record compare, se il PR era frutto di un
valore sbagliato sparisce. Lo stesso succede eliminando una sessione.

Sotto le serie resta "Modifica rapida", per cambiare solo durata, rating e note
senza riaprire tutto il form.

## Assistente AI (facoltativo)

La sezione **Assistente AI** è una **chat**: fai domande sui tuoi allenamenti e
l'assistente risponde vedendo le ultime sedute con serie, pesi e note, il diario
dolori e il peso corporeo. Le conversazioni restano salvate e si rileggono nel
tempo.

### Cosa può fare, oltre a rispondere

L'assistente non è in sola lettura: ha accesso all'app tramite una serie di
strumenti e può **fare le cose al posto tuo**.

| Ambito | Cosa può fare |
|---|---|
| Schede | Elencarle, leggerle, crearle, modificarle, duplicarle, archiviarle; aggiungere, cambiare e togliere esercizi |
| Libreria | Cercare esercizi per nome, gruppo muscolare o attrezzatura; aggiungerne di nuovi |
| Calendario | Elencare e leggere gli allenamenti, registrarne di nuovi, correggere una singola serie, spostare la data, eliminarli |
| Peso e dolori | Registrare una misurazione, aggiungere una nota al diario |
| Preferenze | Cambiare il timer di recupero di default e quanti allenamenti tenere nel contesto |

Esempi di richieste che ora funzionano: *"crea una scheda per la schiena con
quello che ho in casa"*, *"le alzate laterali del 28/7 erano da 1,5 kg, non
0,5"*, *"segna l'allenamento di ieri: stessa Sessione 1, ma solo 3 serie di
dip"*, *"aumenta di una serie tutti gli esercizi di spinta della Sessione 2"*.

**Ogni modifica ai dati viene mostrata sotto la risposta**, in un riquadro con
la lista di cosa è cambiato, e resta salvata insieme al messaggio: rileggendo la
conversazione mesi dopo si vede ancora cosa aveva toccato. Le letture non
compaiono, solo le scritture.

Le azioni distruttive (eliminare un allenamento o una scheda) le chiede prima;
una scheda con allenamenti collegati viene comunque archiviata invece che
cancellata. Se sbaglia qualcosa, tutto resta modificabile a mano dall'interfaccia
come prima — e conviene fare ogni tanto una copia di `instance/workout.db`.

Funziona con **Anthropic**, con **Gemini** o con **Ollama in locale**: basta
configurare uno dei tre in `.env`.

```
ANTHROPIC_API_KEY=sk-ant-...     # se c'è questa, viene usata questa
GEMINI_API_KEY=...               # altrimenti si usa Gemini
OLLAMA_MODEL=qwen3.5:9b          # altrimenti il modello locale
```

Per Gemini vanno bene anche `GOOGLE_API_KEY` o `GEMINI_KEY`. Le chiavi si
leggono solo dall'ambiente e non finiscono mai nel database.

**Senza nessuno dei tre la sezione assistente sparisce dall'app** — voce di menu
compresa — e tutto il resto continua a funzionare normalmente.

### Scegliere il modello

L'ordine qui sopra è solo il predefinito. Il modello vero e proprio si sceglie
**dal menu nella barra della chat**, o da *Impostazioni → Assistente AI*:
l'elenco raggruppa per provider tutti i modelli a cui le tue chiavi hanno
accesso, chiesti ai provider stessi e non scritti in un file — appena aggiungi
`ANTHROPIC_API_KEY` e riavvii, i modelli Claude compaiono da soli.

La scelta vale dal messaggio successivo, senza riavviare, e resta anche fra una
sessione e l'altra. `ANTHROPIC_MODEL` e `GEMINI_MODEL` in `.env` restano i
predefiniti a cui si torna scegliendo *Automatico*.

I parametri della richiesta si adattano al modello scelto: `effort` e il
fallback lato server vengono mandati solo ai modelli Anthropic che li
dichiarano, perché su un modello che non li supporta sarebbero un errore.

### Provider locale (Ollama)

Con `OLLAMA_MODEL` valorizzata e Ollama in esecuzione sul PC, l'assistente gira
in locale: nessuna chiave, nessuna quota, e i dati di allenamento non escono
dalla macchina. Il modello ha accesso agli stessi strumenti degli altri provider,
quindi legge e modifica l'app allo stesso modo.

Ollama fa anche da **riserva a Gemini**: se Gemini non risponde — quota
esaurita, rete giù, errore del servizio — il turno viene rigiocato in locale.
Succede però solo se l'assistente non aveva ancora modificato nulla: ripartire
da capo dopo una scrittura la duplicherebbe, quindi in quel caso l'errore arriva
a te. **Quando il turno viene rigiocato, la risposta lo dice**: sotto il testo
compare un avviso con il motivo del fallimento remoto e il nome del modello
locale che ha risposto al suo posto.

Se il server non è raggiungibile la chat lo dice esplicitamente e **non ripiega
sul cloud**: nessun dato parte senza che tu l'abbia deciso. Da
*Impostazioni → Provider locale* vedi se il server è acceso e lo avvii con un
pulsante, senza aspettare che sia un messaggio fallito a dirtelo.

**La scelta del modello conta più di quanto sembri**, per due motivi che tirano
in direzioni opposte: l'affidabilità con gli strumenti (l'assistente ne ha 24) e
la memoria della scheda video.

| Modello | Peso | Usa lo strumento | Tempo |
|---|---|---|---|
| `qwen3.5:9b` | 6,6 GB | 3 volte su 5 | ~5 s |
| `qwen2.5-coder:14b` | 9,0 GB | da misurare | da misurare |
| `qwen3-coder:30b` | 18,6 GB | 5 volte su 5 | ~17 s |

Il difetto di `qwen3.5:9b` è insidioso: risponde «ho aggiunto il Plank alla
scheda» senza aver chiamato nessuno strumento. Il campo *azioni* del messaggio
resta vuoto — è lì che si vede cosa è stato davvero eseguito — ma il testo
sembra convincente.

Per questo, quando un turno locale finisce **senza nessuna chiamata a strumenti
e la richiesta era di fare qualcosa** (crea, aggiungi, modifica, elimina…),
l'app lo sollecita una volta sola, chiedendo esplicitamente di eseguire invece
di descrivere. Costa una generazione in più e solo in quel caso; se non basta,
sotto la risposta compare un avviso che dice che non è stato modificato niente —
così non resta il dubbio.

Il modello grande però va scelto guardando la VRAM: **quello che non entra nella
scheda video finisce nella RAM di sistema**, e da lì la risposta rallenta di
molto mentre il resto del computer arranca. Su una scheda da 12 GB,
`qwen3-coder:30b` sfora di parecchio: tienilo per quando ti serve far
*modificare* qualcosa e il PC non sta facendo altro, e usa il 9b per domande e
analisi. Con `ollama ps` vedi la ripartizione fra GPU e CPU del modello caricato.

Proprio perché conviene alternarli, i modelli installati compaiono nel menu
della chat insieme a quelli remoti, con la loro dimensione accanto al nome. In
*Impostazioni → Provider locale* c'è un secondo menu, con uno scopo diverso: dice
**quale modello locale usare quando tocca a Ollama**, riserva compresa — l'unico
modo per sceglierlo mentre a rispondere è un provider remoto. In entrambi i casi
il modello che lascia il posto viene tolto subito dalla memoria invece di
restarci per tutto il `keep_alive` del server, e `OLLAMA_MODEL` in `.env` resta
il predefinito.

Due famiglie da non usare qui: i **modelli di ragionamento** (`deepseek-r1` e
simili), perché il pensiero è disattivato di proposito — vedi `OLLAMA_THINK` — ed
è l'unica cosa per cui varrebbe la pena caricarli; e i **modelli di embedding**
(`nomic-embed-text`), che non sono conversazionali e non compaiono utilmente nel
menu.

Altre tre cose da sapere:

- Il numero di allenamenti inviati è regolabile dall'interfaccia fino a 100, ma
  il contesto locale è limitato (`OLLAMA_NUM_CTX`, 32768 di default). Quando non
  ci stanno tutti, **l'app scarta da sola i più vecchi** finché non rientrano:
  senza, Ollama taglierebbe in silenzio partendo dall'inizio, cioè dalle
  istruzioni. Sotto la risposta trovi quanti allenamenti ha visto davvero.
- Dopo aver risposto il modello resta caricato 5 minuti, poi libera la memoria
  (`OLLAMA_KEEP_ALIVE_CHAT`). È di proposito più corto del `OLLAMA_KEEP_ALIVE`
  del server: la chat è un uso saltuario e non deve tenere occupati diversi GB.
- Il "pensiero" dei modelli di ragionamento è disattivato di default: lasciato
  libero può saturare il contesto e bloccare la chat per minuti. Si riattiva con
  `OLLAMA_THINK=1`.

### Scegliere il modello Gemini

Il predefinito è `gemini-flash-latest`, l'unico incluso nel piano gratuito. Con
un piano a pagamento puoi cambiarlo:

```
GEMINI_MODEL=gemini-pro-latest
```

Se scegli un modello non incluso nel tuo piano, la chat lo dice esplicitamente
invece di fallire in modo oscuro.

## Come sono modellati i dati

Tre scelte non ovvie, dettate dagli esercizi reali in `Schede.txt`:

- **Esercizi a tempo.** Il Plank si misura in secondi, non in ripetizioni: ogni
  esercizio ha un `tipo_misura` e ogni serie può registrare ripetizioni *o*
  durata.
- **Esercizi senza carico.** Elastico e corpo libero non hanno kg. Il record
  personale per questi esercizi è sulle **ripetizioni** (o sui secondi), non sul
  peso.
- **Peso per manubrio.** Nel campo peso si inserisce quello che c'è scritto sul
  singolo manubrio. Ogni esercizio sa quanti manubri si impugnano
  (`carichi_per_serie`), così il volume è `peso × manubri × ripetizioni` ed è
  corretto anche con carichi da 0,5 kg.

## Struttura

```
app.py                  factory Flask, API /api/*, catch-all SPA verso frontend/dist
models.py               modelli SQLAlchemy
schemas.py               envelope risposte API, validazione marshmallow
serializers.py            dict-builder per le risposte JSON
seed.py                  libreria esercizi e schede iniziali (da Schede.txt)
blueprints/api/          endpoint REST, uno per risorsa
services/                PR tracker, aggregazioni statistiche, analisi AI
frontend/                React + TypeScript + Vite + Tailwind + shadcn/ui
old/                     frontend Jinja/vanilla JS precedente, tenuto per riferimento
```

## Variabili d'ambiente

| Variabile | Default | A cosa serve |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Assistente AI via Claude (ha la precedenza) |
| `GEMINI_API_KEY` | — | Assistente AI via Gemini (anche `GOOGLE_API_KEY` / `GEMINI_KEY`) |
| `GEMINI_MODEL` | `gemini-flash-latest` | Modello Gemini da usare |
| `OLLAMA_MODEL` | — | Assistente AI in locale via Ollama (ultima precedenza). Modello predefinito: da Impostazioni se ne sceglie un altro |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Indirizzo del server Ollama |
| `OLLAMA_NUM_CTX` | `32768` | Finestra di contesto del modello locale |
| `OLLAMA_TIMEOUT` | `180` | Secondi concessi a una risposta locale |
| `OLLAMA_KEEP_ALIVE_CHAT` | `5m` | Quanto il modello resta in memoria dopo la risposta |
| `OLLAMA_THINK` | disattivo | Lascia "pensare" il modello locale prima di rispondere |
| `OLLAMA_EXE` | cercato nel PATH | Percorso di `ollama.exe`, per il pulsante di avvio |
| `WORKOUT_HOST` | `127.0.0.1` | `0.0.0.0` per accedere dal telefono |
| `WORKOUT_PORT` | `8456` | Porta del server |
| `WORKOUT_DB_PATH` | `instance/workout.db` | Percorso alternativo del database |

Le variabili si leggono all'avvio: dopo aver modificato `.env` **ferma e
rilancia `python app.py`**. Il riavvio automatico del debugger non basta, perché
il processo figlio eredita l'ambiente di quello vecchio.

## Backup

Tutto sta in `instance/workout.db`: copiare quel file basta come backup.
