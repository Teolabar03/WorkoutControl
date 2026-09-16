# WorkoutControl

Webapp per allenamenti a casa, installabile sul proprio computer o server.
Backend Python/Flask, frontend React/TypeScript e database SQLite persistente.
Non serve un servizio cloud per registrare allenamenti. L'assistente AI è
facoltativo. L'accesso richiede un account: il primo amministratore viene
creato durante la configurazione iniziale.

## Prima installazione

1. Installa **Python 3.11-3.13** e **Node.js 22.12 o successivo**, con npm,
   e assicurati che siano disponibili nel terminale. Su Linux può servire
   anche il pacchetto `python3-venv` della distribuzione.
2. Scarica lo ZIP dei sorgenti da GitHub ed estrailo, oppure clona il repository.
3. Apri il terminale nella cartella che contiene `app.py` ed esegui:

```sh
python install.py
```

Su Linux/macOS il comando può chiamarsi `python3 install.py`.
La procedura crea `.venv`, installa le dipendenze bloccate alle versioni
verificate, prepara `.env`, chiede nome e password del primo admin, compila
il frontend e inizializza il database. Richiede internet per scaricare i
pacchetti. Ripeterla conserva le impostazioni e gli account già presenti.
La password non viene mostrata mentre la digiti. Minimo 8 caratteri;
preferisci una frase lunga e unica.

Avvia quindi **`avvia.bat` su Windows**. Su Linux/macOS:

```sh
.venv/bin/python app.py
```

Oppure attiva l'ambiente virtuale ed esegui `python app.py`.
Apri <http://127.0.0.1:8456> e accedi con le credenziali scelte.
Il normale avvio usa Waitress, senza debugger. Non cancellare `instance/`:
contiene database e chiave di sessione.

### Installazione manuale

```sh
python -m venv .venv
```

Attiva l'ambiente: Windows PowerShell `.venv\Scripts\Activate.ps1`,
Windows cmd `.venv\Scripts\activate.bat`, Linux/macOS `source .venv/bin/activate`.
Se PowerShell blocca lo script puoi usare direttamente `.venv\Scripts\python.exe`.

```sh
python -m pip install -r requirements.txt
```

Copia `.env.example` in `.env` e imposta **`WORKOUT_PASSWORD`**; opzionalmente
imposta `WORKOUT_USERNAME` (default `admin`). Questi valori creano il primo
admin solo quando non esiste alcuna utenza. In seguito le password si cambiano
nell'app: modificare `.env` non reimposta un account esistente.

```sh
cd frontend
npm ci
npm run build
cd ..
python app.py
```

`avvia.bat` ricompila il frontend se necessario e segnala dipendenze mancanti,
ma la prima installazione va fatta con `install.py`.
Per installazioni automatiche: `python install.py --non-interactive`, con
`WORKOUT_PASSWORD` già nell'ambiente o in `.env`. Non scrivere password nei comandi
salvati nella cronologia del terminale.

## Utenti e dati

Da **Impostazioni → Utenze** l'admin crea utenti e workout.
Un workout è un insieme di dati: utenti dello stesso workout vedono gli stessi
allenamenti, peso, salute e impostazioni. Per dati indipendenti crea workout
separati. Le chat AI sono della singola utenza; la libreria esercizi è condivisa.

- **Admin:** usa l'app e gestisce utenti e workout.
- **Standard:** legge e modifica i dati del proprio workout.
- **Allenatore:** sola lettura e nessun assistente AI.

L'assistente richiede inoltre l'abilitazione della singola utenza.
Al primo avvio vengono caricate una libreria di esercizi casalinghi e due schede
di esempio, già incluse in `seed.py`: non serve alcun file `Schede.txt`.
Personalizza schede, attrezzatura e timer dalle Impostazioni.

## Funzioni

Calendario con storico; creazione e duplicazione schede; sessioni live con
serie, peso, ripetizioni, note e recupero; inserimento e modifica di sessioni
passate; record personali e grafici; peso e altezza; diario dolori.
I record vengono ricalcolati quando si corregge o elimina un allenamento.
Per gli esercizi con due manubri il peso è quello del singolo manubrio.

Samsung Health è facoltativo: da Impostazioni configura l'app ponte Health
Connect con il token del workout, oppure importa lo storico esportato.
Le sezioni Salute e Nutrizione compaiono quando ci sono dati. L'import accetta
ZIP fino a 300 MB, con CSV utili fino a 32 MB ciascuno e 100 MB complessivi
non compressi. Sul reverse proxy va consentito anche l'upload di queste dimensioni.
Se l'import dall'APK non funziona, usa il browser.

## Telefono e accesso remoto

Per usare il **browser del telefono sulla stessa rete** imposta
`WORKOUT_HOST=0.0.0.0` in `.env`, riavvia e apri `http://IP-DEL-PC:8456`.
Consenti la porta nel firewall solo sulla rete privata. HTTP non cifra password
e dati: per reti non fidate o accesso da internet usa HTTPS.
Le notifiche del browser dipendono da HTTPS, permessi e gestione del risparmio
energetico: su HTTP di rete locale e a schermo bloccato non sono garantite.

L'**APK Android** è un client e richiede un server **HTTPS** già configurato.
Non sostituisce l'installazione Python. Download dalle release e istruzioni
per compilare un proprio APK: [guida Android](docs/android.md).

Per un server pubblico usa un reverse proxy HTTPS e un server WSGI:
Waitress è incluso; su Linux puoi installare separatamente gunicorn e usare,
per esempio, `gunicorn --workers 1 --threads 4 --bind 127.0.0.1:8456 app:app`.
Il limite dei tentativi di login è in memoria per processo: con più worker
occorre un limitatore condiviso o sul proxy. Non esporre il debugger.

Se pubblichi sotto `/workout/`, compila impostando `VITE_BASE=/workout/` e
configura il proxy perché rimuova quel prefisso inoltrando le richieste.
Imposta `WORKOUT_COOKIE_PATH=/workout/`, `WORKOUT_COOKIE_SECURE=1` e
`WORKOUT_PROXY_HOPS=1` soltanto se c'è un proxy fidato che riscrive gli header.
Il database di un server esistente non va sostituito con quello di sviluppo.

## Assistente AI e privacy

Tutti i provider sono disattivati in `.env.example`. Per abilitarne uno imposta
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY` oppure `OLLAMA_MODEL`, poi riavvia.
Ollama richiede il servizio avviato e il modello già scaricato, ad esempio con
`ollama pull NOME-MODELLO`. Dimensioni e requisiti dipendono dal modello scelto.
In Impostazioni puoi scegliere il provider/modello e il numero di allenamenti
nel contesto. Chiavi e modelli disponibili dipendono dal proprio account:
controlla prezzi e condizioni del provider, senza presumere un piano gratuito.

L'assistente può leggere e modificare i dati tramite strumenti. Controlla il
riepilogo delle azioni e conserva backup: la richiesta di conferma delle azioni
distruttive nel prompt non equivale a un'autorizzazione tecnica separata.
Le conversazioni e le azioni eseguite restano salvate nel database.
Con provider remoti vengono inviati anche dati come peso e note sui dolori.
Leggi [dati e connessioni esterne](docs/privacy.md) prima di abilitarli.

## Configurazione essenziale

| Variabile | Default | Uso |
|---|---|---|
| `WORKOUT_USERNAME` | `admin` | Primo amministratore |
| `WORKOUT_PASSWORD` | vuota | Obbligatoria per creare il primo admin |
| `WORKOUT_HOST` | `127.0.0.1` | Indirizzo di ascolto |
| `WORKOUT_PORT` | `8456` | Porta |
| `WORKOUT_DEBUG` | `0` | Debugger solo per sviluppo esplicito |
| `WORKOUT_DB_PATH` | `instance/workout.db` | Percorso alternativo; preferisci un percorso assoluto |
| `WORKOUT_SECRET_KEY` | generata | Firma delle sessioni; salvata in `instance/secret_key.txt` |
| `WORKOUT_COOKIE_SECURE` | disattivo | Attivare su HTTPS |
| `WORKOUT_COOKIE_PATH` | `/` | Prefisso pubblico |
| `WORKOUT_PROXY_HOPS` | `0` | Numero di proxy fidati |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Host del provider locale |

Vedi `.env.example` per le altre opzioni. Riavvia dopo aver cambiato `.env`.
Le API di scrittura richiedono `Content-Type: application/json`; l'import
multipart richiede `X-Requested-With: WorkoutControl`. L'ingest Health Connect
usa invece il token Bearer e non richiede una sessione.

## Backup, ripristino e aggiornamenti

Per un backup semplice **ferma il server** e copia `instance/` e `.env` in una
posizione privata. Per un backup a server acceso usa l'API backup di SQLite,
non una semplice copia del file durante le scritture. I backup contengono dati
personali e segreti; non vanno su GitHub.

Per ripristinare: ferma il server, conserva una copia della situazione attuale,
ripristina il database del backup e la configurazione, quindi riavvia con una
versione del codice compatibile. Ripristinare la chiave di sessione mantiene
le sessioni; cambiarla le invalida. Prima di tornare a codice precedente dopo
una migrazione, ripristina anche il database compatibile dal backup.

Per aggiornare: fai un backup, ferma il server, scarica la nuova versione
(o `git pull`), esegui `python install.py` e riavvia. Non sovrascrivere `.env`
o `instance/` con quelli di un'altra installazione. Gli aggiornamenti Android
non aggiornano automaticamente il tuo backend.

Le versioni delle dipendenze Python sono fissate in `requirements.txt`;
`requirements.in` elenca quelle dirette. Per aggiornarle risolvi in un ambiente
pulito, rigenera il lock e prova l'installazione su Windows e Linux. Per npm
usa `npm ci` con il lockfile versionato.

## Sviluppo e verifiche

Avvia `python app.py` e, in un secondo terminale, `npm run dev` da `frontend/`.
Apri <http://localhost:5173>: Vite inoltra `/api` a Flask senza bisogno di CORS.
Il debugger Python è facoltativo (`WORKOUT_DEBUG=1`, soltanto in sviluppo).

```sh
python -m unittest discover -s tests -v
npm --prefix frontend test
npm --prefix frontend run build
```

I test usano database temporanei. GitHub Actions prova l'installazione da zero,
i permessi, l'isolamento, gli upload e la verifica degli aggiornamenti, ed
esegue una scansione dei segreti. Per segnalazioni riservate vedi [SECURITY.md](SECURITY.md).

Il codice corrente è in `blueprints/api/`, `services/` e `frontend/src/`.
`old/` contiene il frontend precedente, non utilizzato dall'app.
La licenza con attribuzione è in [LICENSE.md](LICENSE.md).
