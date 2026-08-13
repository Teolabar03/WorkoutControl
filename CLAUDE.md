# CLAUDE.md — WorkoutTracker

## Panoramica del progetto

Webapp **locale** (uso personale, single-user, no login/auth) per tenere traccia degli allenamenti a casa. Deve girare in locale con `python app.py` e usare uno storage persistente su file (SQLite), niente servizi cloud richiesti — tranne, opzionalmente, la chiamata a un'API AI per l'analisi statistica.

**Contesto d'uso:** allenamenti a casa (no palestra), quindi niente concetti tipo "macchine", "sale", prenotazioni ecc. Attrezzatura presumibilmente limitata (manubri, corpo libero, elastici, panca...) — da confermare con l'utente in fase di setup iniziale.

## Stack tecnico

- **Backend:** Python 3 + Flask
- **Database:** SQLite (via `sqlite3` o SQLAlchemy — preferire SQLAlchemy per migrazioni più facili)
- **Frontend:** template Jinja2 + HTML/CSS/JS vanilla (niente framework JS pesante, la app deve restare semplice e locale). Va bene un tocco di libreria leggera (es. Chart.js via CDN) per i grafici statistiche.
- **AI:** chiamata a API Anthropic (Claude) per la sezione statistiche/consigli. Chiave API da leggere da variabile d'ambiente (`.env`, mai hardcoded).

## Struttura del progetto (proposta)

```
workout-tracker/
├── app.py
├── models.py
├── requirements.txt
├── .env.example
├── instance/
│   └── workout.db
├── templates/
│   ├── base.html
│   ├── calendar.html
│   ├── schede.html
│   ├── sessione.html
│   └── statistiche.html
├── static/
│   ├── css/
│   └── js/
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
- Nessuna autenticazione richiesta (uso singolo utente locale), ma strutturare comunque il codice in modo pulito (blueprint Flask separati per calendar/schede/sessione/stats).
- Gestire bene i casi vuoti (nessuna scheda ancora creata, nessun allenamento nel mese).
- Mobile-friendly: molto probabilmente userai il telefono/tablet durante l'allenamento in casa per inserire pesi in tempo reale, quindi il CSS deve essere responsive fin dall'inizio.

## Da confermare con l'utente prima di iniziare

- Attrezzatura disponibile a casa (elenco specifico per popolare correttamente la libreria esercizi)
- Durata di default del timer di recupero (globale o per esercizio)
- Numero di allenamenti recenti (N) da considerare di default per l'analisi AI
