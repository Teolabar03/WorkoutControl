# CLAUDE.md — WorkoutTracker

## Panoramica del progetto

Webapp **locale** (uso personale, single-user) per tenere traccia degli allenamenti a casa. Deve girare in locale con `python app.py` e usare uno storage persistente su file (SQLite), niente servizi cloud richiesti — tranne, opzionalmente, la chiamata a un'API AI per l'analisi statistica. Nessun sistema di account/utenti multipli: solo un accesso protetto da **password singola condivisa** (schermata di login), necessario perché l'app gira con `WORKOUT_HOST=0.0.0.0` per essere raggiungibile dal telefono in casa e questo la espone a chiunque sia sulla stessa rete WiFi.

**Contesto d'uso:** allenamenti a casa (no palestra), quindi niente concetti tipo "macchine", "sale", prenotazioni ecc. Attrezzatura presumibilmente limitata (manubri, corpo libero, elastici, panca...) — da confermare con l'utente in fase di setup iniziale.

## Stack tecnico

- **Backend:** Python 3 + Flask, esposto come **pura API JSON** sotto `/api/*` (envelope uniforme `{"data": ...}` / `{"error": {...}}`, vedi `schemas.py`). Nessun rendering HTML lato server.
- **Database:** SQLite via SQLAlchemy (`models.py`).
- **Frontend:** React 18 + TypeScript + Vite, styling con Tailwind CSS v4 + shadcn/ui (Radix UI). Grafici con Recharts. Routing con react-router-dom, data fetching con TanStack Query, drag&drop con @dnd-kit. Design system "Neon Graphite" (dark-native): primario arancione neon (`--primary #FF5722`) + accento verde lime per PR/highlight (`--accent #76FF03`), su superfici nero/grafite (`#121212` / `#242424`). App nativamente in dark mode (`index.html` con `class="dark"` fissa); light mode resta disponibile via token semantici in `frontend/src/index.css` ma non è il path predefinito. Tipografia Barlow Condensed/Barlow invariata.
- **AI:** provider intercambiabili (Anthropic, Gemini, Ollama locale) via `services/ai.py`, con 24 tool di function-calling in `services/ai_tools.py` riusati sia dall'assistente sia dagli endpoint REST di scrittura, per non duplicare la logica di dominio. Chiavi da variabili d'ambiente (`.env`, mai hardcoded).
- **Auth:** login a credenziali singole (`blueprints/api/auth.py`), username/password in `WORKOUT_USERNAME` (default `admin`) e `WORKOUT_PASSWORD` (`.env`). Sessione Flask firmata con una `SECRET_KEY` auto-generata e persistita in `instance/secret_key.txt` se `WORKOUT_SECRET_KEY` non è impostata. Un `before_request` in `app.py` blocca tutta l'API sotto `/api/*` (tranne `/api/auth/*`) finché la sessione non è autenticata; il frontend mostra `LoginPage` finché `/api/auth/me` non conferma l'accesso. Il flag "ricordami" in login decide se la sessione dura solo il browser corrente o 90 giorni.

**Avvio:**
- **Produzione locale** (comando unico invariato): `python app.py` — Flask serve `frontend/dist` (buildato) con fallback SPA per il routing client-side, oltre all'API. `avvia.bat` compila il frontend automaticamente se mancante o più vecchio dei sorgenti.
- **Sviluppo**: due processi — `python app.py` (solo API su :8456) + `npm run dev` dentro `frontend/` (Vite su :5173, con proxy `/api` verso :8456, niente CORS necessario).

## Deploy sulla VPS

Oltre all'uso locale, l'app gira sulla VPS Netsons (`81.28.9.98`) come servizio
systemd `workoutcontrol`, in `/var/www/workoutcontrol`, ed è raggiungibile da
fuori casa su **https://81.28.9.98/workout/**.

**Il codice si allinea solo via GitHub, mai a mano.** Un push su `main` fa
partire un webhook che sulla VPS esegue `git reset --hard origin/main`,
reinstalla le dipendenze, ricompila il frontend e riavvia il servizio. Quindi:
modifica in locale → commit → `git push` → la VPS si aggiorna da sola in circa
un minuto. Non modificare i file direttamente sulla VPS: il prossimo deploy
cancella tutto quello che non è passato dal repo.

Differenze rispetto all'esecuzione locale, tutte pilotate da variabili
d'ambiente perché il codice resti identico nei due ambienti:

- Il frontend viene compilato con `VITE_BASE=/workout/` (vedi `base` in
  `vite.config.ts`), perché nginx serve l'app sotto quel prefisso invece che
  sulla root — che sulla VPS è già occupata da un'altra webapp.
- `.env` sulla VPS imposta `WORKOUT_COOKIE_PATH=/workout/` e
  `WORKOUT_COOKIE_SECURE=1`: sullo stesso indirizzo girano più app Flask e senza
  questo i login si scalzerebbero a vicenda.
- Al posto di `python app.py` c'è gunicorn (1 worker, 4 thread) su
  `127.0.0.1:5002`, dietro nginx.

**Il database di riferimento è quello della VPS** (`instance/workout.db` sul
server). È lì che finiscono gli allenamenti registrati dal telefono, quindi è
l'unica copia buona: il `instance/` locale è solo un ambiente di prova e non va
mai ricopiato sul server. `instance/` è in `.gitignore`, perciò i deploy
aggiornano il codice senza toccare i dati.

## Struttura del progetto

```
WorkoutControl/
├── app.py                  # factory Flask, API /api/*, catch-all SPA verso frontend/dist
├── models.py                # modelli SQLAlchemy
├── schemas.py                # envelope api_ok/api_error, schema marshmallow di validazione
├── serializers.py             # dict-builder per le risposte JSON
├── requirements.txt
├── .env.example
├── instance/
│   └── workout.db
├── blueprints/
│   └── api/                  # blueprint REST, uno per risorsa (schede, sessione, statistiche, chat, ...)
├── services/
│   ├── pr.py                  # motore record personali
│   ├── stats.py                # aggregazioni per i grafici
│   ├── ai.py                   # orchestrazione provider AI
│   └── ai_tools.py             # tool di function-calling, riusati anche dall'API REST
├── frontend/                  # progetto Vite/React/TypeScript
│   ├── src/
│   │   ├── api/                 # client fetch + tipi per risorsa
│   │   ├── hooks/                # hook TanStack Query
│   │   ├── components/            # ui/ (shadcn) + componenti di dominio
│   │   └── pages/                 # una per rotta
│   └── dist/                     # build di produzione, servito da app.py (generato, non versionato)
├── old/                       # frontend Jinja/vanilla JS precedente la migrazione a React, tenuto per riferimento
└── CLAUDE.md
```

## Funzionalità richieste

### 1. Calendario allenamenti
- Vista mensile (o settimanale) in cui ogni giorno mostra se c'è stato un allenamento.
- Cliccando su un giorno: vedo/inserisco data, **durata**, **scheda usata**, eventuali note generali della sessione.
- Deve poter mostrare anche i giorni passati per consultazione storica.

### 2. Sezione "Schede"
- CRUD completo: creare, modificare, eliminare schede di allenamento.
- Ogni scheda ha: nome, eventuale descrizione/obiettivo (es. "forza", "ipertrofia"), lista di esercizi.
- Ogni esercizio nella scheda: nome, serie, ripetizioni target, eventuale peso suggerito, note tecniche (es. "controllo eccentrico").
- Possibilità di duplicare una scheda per crearne varianti (utile per progressioni nel tempo).

### 3. Modalità "Sessione attiva"
- Quando avvio un allenamento, seleziono la scheda e parte una sessione.
- Per ogni esercizio della scheda posso inserire, per ogni serie: **peso usato**, ripetizioni fatte, e una nota libera (es. "pesante", "RIR 2", "male alla spalla").
- Un campo di **stato generale** della sessione (es. energia, sonno, umore — anche solo un rating 1-5 + nota testuale).
- Al termine, la sessione si salva collegata al calendario (data, durata, scheda, dettaglio serie).

### 4. Statistiche + AI
- Vista con grafici sull'andamento: volume totale nel tempo, progressione dei pesi per esercizio, frequenza allenamenti, aderenza alla scheda, andamento peso corporeo, storico PR.
- Bottone "Analizza i miei ultimi allenamenti": invia gli ultimi N allenamenti (dati strutturati, non testo libero grezzo) — comprese le note su dolori/recupero — all'API Claude con un prompt che chiede di individuare pattern, ristagni, squilibri, possibili segnali di sovraccarico, e dare consigli pratici.
- I consigli AI vanno salvati/loggati (con data) così posso rivederli nel tempo, non solo mostrati e persi.

### 5. Timer di recupero tra le serie
- Durante la sessione attiva, dopo aver registrato una serie, possibilità di avviare un timer di recupero (durata predefinita configurabile per esercizio o scheda, es. 90s, 2min).
- Notifica sonora/visiva a fine recupero. Deve funzionare bene anche da mobile/tablet (schermo spesso in background durante il recupero).

### 6. Libreria esercizi predefinita
- Catalogo di esercizi base (corpo libero, manubri, elastici, panca, ecc.) con campo **attrezzatura richiesta**.
- Quando crei/modifichi una scheda, scegli gli esercizi da questa libreria (con possibilità di aggiungerne di custom).
- Utile per filtrare rapidamente "cosa posso fare con quello che ho in casa".
- Seed iniziale del DB con un set base di esercizi comuni per allenamento casalingo.

### 7. Tracking peso corporeo
- Sezione separata dalle sessioni per registrare il peso corporeo nel tempo (data + valore, eventuale nota).
- Grafico andamento nella sezione statistiche, incrociabile con volume/progressione carichi.

### 8. PR (Personal Record) tracker
- Per ogni esercizio, tenere traccia automaticamente del peso massimo sollevato (e/o massime ripetizioni a un dato peso).
- Quando in sessione attiva si registra una serie che batte il record precedente, segnalarlo (es. badge "Nuovo PR!").
- Storico dei PR nel tempo consultabile in statistiche.

### 9. Diario recupero / dolori articolari
- Campo separato dalle note della singola serie: un "diario infortuni/dolori" collegato alla sessione (o indipendente, con data).
- Es. "dolore spalla destra dopo panca", "ginocchio ok oggi".
- L'analisi AI deve poter incrociare questi dati con gli esercizi svolti per segnalare pattern potenzialmente rischiosi (es. dolore ricorrente dopo un determinato esercizio).

## Modello dati (bozza)

- **Scheda** (id, nome, descrizione, data_creazione, attiva/archiviata)
- **EsercizioLibreria** (id, nome, attrezzatura_richiesta, gruppo_muscolare, note, is_custom)
- **EsercizioScheda** (id, scheda_id, esercizio_libreria_id, serie_target, rep_target, peso_suggerito, note, ordine, timer_recupero_secondi)
- **Sessione** (id, data, scheda_id, durata_minuti, stato_energia, note_generali)
- **SerieEseguita** (id, sessione_id, esercizio_id, numero_serie, peso, ripetizioni, note, is_pr)
- **PesoCorporeo** (id, data, valore_kg, note)
- **PR** (id, esercizio_libreria_id, peso, ripetizioni, data, sessione_id)
- **NotaDolore** (id, data, sessione_id, zona_corporea, descrizione, gravita)
- **Conversazione** (id, titolo, data_creazione, data_ultimo_messaggio) — chat con l'assistente AI, salvate per rileggerle nel tempo
- **MessaggioChat** (id, conversazione_id, ruolo, contenuto, data, n_sessioni_contesto)

## Convenzioni di sviluppo

- Codice in italiano o inglese: **scegli inglese per nomi di variabili/funzioni**, italiano va bene solo per testi mostrati all'utente (UI).
- Nessuna autenticazione richiesta (uso singolo utente locale), ma strutturare comunque il codice in modo pulito: blueprint Flask separati per risorsa sotto `blueprints/api/` (schede, calendario, sessione, statistiche, peso, diario, chat, impostazioni), consumati dal frontend React — non più `render_template`.
- Le mutazioni lato API riusano le funzioni di dominio di `services/ai_tools.py` (usate anche dal tool-calling dell'assistente) invece di duplicare la logica scrittura/validazione.
- Gestire bene i casi vuoti (nessuna scheda ancora creata, nessun allenamento nel mese).
- Mobile-friendly: molto probabilmente userai il telefono/tablet durante l'allenamento in casa per inserire pesi in tempo reale, quindi il layout React/Tailwind deve restare responsive fin dall'inizio (breakpoint 375/768/1024/1440, touch target ≥44px).

## Da confermare con l'utente prima di iniziare

- Attrezzatura disponibile a casa (elenco specifico per popolare correttamente la libreria esercizi)
- Durata di default del timer di recupero (globale o per esercizio)
- Numero di allenamenti recenti (N) da considerare di default per l'analisi AI
