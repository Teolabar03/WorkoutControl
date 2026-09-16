"""WorkoutTracker — webapp locale per gli allenamenti a casa.

Avvio: `python app.py`. Flask espone solo l'API JSON sotto `/api/*`; per il
resto serve il build statico di React (`frontend/dist`), con fallback a
`index.html` per lasciare il routing alla SPA (`spa()` più sotto).
"""

import os
import secrets
from datetime import datetime, timedelta

from dotenv import load_dotenv
from flask import Flask, abort, request, send_from_directory
from flask_cors import CORS

import tenancy
from models import db
from schemas import api_error, register_error_handlers

load_dotenv()

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")


def create_app():
    # static_folder=None disabilita la route statica automatica di Flask:
    # altrimenti intercetterebbe /<path:path> prima di spa() qui sotto e
    # risponderebbe 404 raw (senza fallback a index.html) per ogni URL che
    # non e' un file reale, rompendo il routing lato client di react-router.
    app = Flask(__name__, instance_relative_config=True, static_folder=None)
    os.makedirs(app.instance_path, exist_ok=True)

    # Di norma il database sta in instance/workout.db. WORKOUT_DB_PATH permette
    # di puntarlo altrove (backup, prove) senza toccare il codice.
    percorso_db = os.environ.get(
        "WORKOUT_DB_PATH", os.path.join(app.instance_path, "workout.db")
    )

    app.config.update(
        SQLALCHEMY_DATABASE_URI="sqlite:///" + percorso_db,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        MAX_FORM_MEMORY_SIZE=512 * 1024,
        MAX_FORM_PARTS=4,
        # Firma il cookie di sessione del login (vedi blueprints/api/auth.py).
        SECRET_KEY=_secret_key(app.instance_path),
        # "Ricordami": quanto resta valido il login su un dispositivo se
        # l'utente spunta la casella in fase di accesso.
        PERMANENT_SESSION_LIFETIME=timedelta(days=90),
        SESSION_COOKIE_SAMESITE="Lax",
        # Nome proprio (non il "session" di default di Flask) e percorso
        # configurabile: dietro un reverse proxy l'app puo' condividere l'origin
        # con altre app Flask (es. https://IP/ e https://IP/workout/), e con i
        # default ognuna sovrascriverebbe il cookie di login delle altre.
        # WORKOUT_COOKIE_PATH va valorizzato col prefisso pubblico (es.
        # "/workout/"), che il proxy toglie prima di passare la richiesta qui.
        SESSION_COOKIE_NAME=os.environ.get("WORKOUT_COOKIE_NAME", "workout_session"),
        SESSION_COOKIE_PATH=os.environ.get("WORKOUT_COOKIE_PATH", "/"),
        # Solo su HTTPS: da attivare in un deploy con certificato, non in
        # locale, dove l'app gira in chiaro e il cookie non partirebbe mai.
        SESSION_COOKIE_SECURE=os.environ.get("WORKOUT_COOKIE_SECURE", "").strip()
        in ("1", "true", "True"),
        JSON_SORT_KEYS=False,
    )

    # Dietro un reverse proxy `remote_addr` e' l'IP del proxy (127.0.0.1) ed e'
    # identico per ogni visitatore: il blocco anti-forza-bruta del login
    # (blueprints/api/auth.py) finirebbe per chiudere fuori tutti insieme
    # invece del singolo attaccante. ProxyFix legge l'IP vero dagli header
    # X-Forwarded-*, ma solo un proxy fidato puo' scriverli: da qui il numero
    # di hop, da valorizzare unicamente se davanti c'e' davvero un proxy.
    # Lasciato a 0 in locale, dove quegli header sarebbero falsificabili.
    hop_proxy = int(os.environ.get("WORKOUT_PROXY_HOPS", "0") or 0)
    if hop_proxy > 0:
        from werkzeug.middleware.proxy_fix import ProxyFix

        app.wsgi_app = ProxyFix(
            app.wsgi_app, x_for=hop_proxy, x_proto=hop_proxy, x_host=hop_proxy
        )

    db.init_app(app)
    tenancy.installa()
    register_error_handlers(app)

    @app.before_request
    def _richiedi_autenticazione():
        """Protegge l'API dietro il login e fissa il workout della richiesta.

        Le route non-API (SPA/asset statici) restano pubbliche: e' il frontend
        a mostrare la schermata di login finche' /api/auth/me non conferma la
        sessione. Da qui in poi ogni query vede solo i dati del workout
        dell'utenza (tenancy.py); prima del login non ne vede nessuno.
        """
        if not request.path.startswith("/api/"):
            return None
        # Set the limit before Flask parses multipart data or JSON. JSON-only
        # writes cannot be submitted by a cross-site HTML form. The one
        # multipart route requires a custom header (and thus CORS preflight).
        if request.path == "/api/salute/import":
            request.max_content_length = 300 * 1024 * 1024
        if request.method not in ("GET", "HEAD", "OPTIONS") and request.path != "/api/health/ingest":
            if request.path == "/api/salute/import":
                if request.headers.get("X-Requested-With") != "WorkoutControl":
                    return api_error("FORBIDDEN", "Richiesta di importazione non autorizzata.", 403)
            elif not request.is_json:
                return api_error("UNSUPPORTED_MEDIA_TYPE", "Usa Content-Type: application/json.", 415)
        from blueprints.api.auth import carica_utente, controlla_accesso

        tenancy.imposta(tenancy.NESSUN_WORKOUT)
        utente = carica_utente()
        if request.path.startswith("/api/auth/"):
            return None
        # L'ingest dei dati di salute lo chiama un'app Android, che un cookie
        # di sessione non ce l'ha: si autentica con il token del workout e il
        # workout lo fissa da se' (vedi blueprints/api/salute.py).
        if request.path == "/api/health/ingest":
            return None
        if utente is None:
            return api_error("UNAUTHORIZED", "Accesso non autenticato.", 401)
        return controlla_accesso(utente)

    @app.teardown_request
    def _dimentica_contesto(_errore):
        # I thread di gunicorn servono piu' richieste: il workout della
        # precedente non deve restare appeso.
        tenancy.azzera()

    # In dev il frontend Vite gira su :5173 e proxya /api verso questo
    # server: CORS serve solo come fallback (es. se il proxy non e' in uso).
    origini_frontend = [origin.strip() for origin in os.environ.get(
        "WORKOUT_FRONTEND_ORIGIN", ""
    ).split(",") if origin.strip()]
    if "*" in origini_frontend:
        raise ValueError("WORKOUT_FRONTEND_ORIGIN richiede origini esplicite, non '*'.")
    if origini_frontend:
        CORS(app, resources={r"/api/*": {"origins": origini_frontend}})

    @app.after_request
    def protect_response(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    from blueprints.api import register_all as register_api_blueprints

    register_api_blueprints(app)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path):
        """Serve la SPA React: file statico se esiste, altrimenti index.html
        così il routing lato client (react-router) gestisce l'URL. Le
        richieste /api/* non arrivano mai qui — le route dei blueprint sopra
        sono più specifiche e vincono sempre sul catch-all — ma un path
        /api/... senza corrispondenza deve restare un 404 JSON, non la SPA.
        """
        if path.startswith("api/"):
            abort(404)
        if not os.path.isfile(os.path.join(FRONTEND_DIST, "index.html")):
            return (
                "Frontend non compilato: esegui `npm install` e `npm run build` "
                "dentro frontend/, poi riavvia `python app.py`.",
                503,
            )
        full = os.path.join(FRONTEND_DIST, path)
        if path and os.path.isfile(full):
            return send_from_directory(FRONTEND_DIST, path)
        return send_from_directory(FRONTEND_DIST, "index.html")

    @app.cli.command("seed")
    def comando_seed():
        """Ricrea le tabelle mancanti e applica il seed iniziale."""
        from seed import applica_seed

        db.create_all()
        applica_seed(_workout_iniziale())
        print("Seed applicato.")

    with app.app_context():
        from sqlalchemy import inspect

        from seed import applica_seed

        tabelle_prima = set(inspect(db.engine).get_table_names())
        # Il passaggio alle utenze riscrive alcune tabelle del database
        # esistente: prima se ne fa una copia.
        migrazione_utenze = bool(tabelle_prima) and "workout" not in tabelle_prima
        if migrazione_utenze:
            _copia_di_sicurezza(percorso_db, "pre-utenze")

        db.create_all()
        workout_iniziale = _workout_iniziale()
        _ricostruisci_con_workout(workout_iniziale)
        colonne_nuove = _allinea_schema()
        if migrazione_utenze:
            _assegna_workout_iniziale(workout_iniziale)
        if ("pr", "peso_kg") in colonne_nuove:
            _ripristina_pr_peso_kg()
        _crea_admin_iniziale(workout_iniziale)
        _arrotonda_pesi_corporei()
        applica_seed(workout_iniziale)

    return app


def _secret_key(instance_path):
    """Chiave per firmare il cookie di sessione del login.

    WORKOUT_SECRET_KEY in .env ha precedenza; altrimenti ne genera una e la
    persiste in instance/secret_key.txt, cosi' non serve configurarla a mano
    e i login restano validi tra un riavvio e l'altro (rigenerarla invalida
    tutte le sessioni aperte).
    """
    dalla_env = os.environ.get("WORKOUT_SECRET_KEY")
    if dalla_env:
        return dalla_env

    percorso = os.path.join(instance_path, "secret_key.txt")
    if os.path.isfile(percorso):
        with open(percorso, "r", encoding="utf-8") as f:
            chiave = f.read().strip()
        if chiave:
            return chiave

    os.makedirs(instance_path, exist_ok=True)
    chiave = secrets.token_hex(32)
    with open(percorso, "w", encoding="utf-8") as f:
        f.write(chiave)
    return chiave


def _copia_di_sicurezza(percorso_db, motivo):
    """Copia del database prima di una migrazione che riscrive delle tabelle.

    Sulla VPS quel file e' l'unica copia buona dei dati (vedi CLAUDE.md): se la
    migrazione andasse storta, basta rimettere questa al suo posto. Si usa
    l'API di backup di SQLite e non una copia del file, che con una scrittura
    in corso potrebbe venire incoerente.
    """
    import sqlite3

    if not os.path.isfile(percorso_db):
        return
    destinazione = f"{percorso_db}.{motivo}-{datetime.now():%Y%m%d-%H%M%S}.bak"
    sorgente = sqlite3.connect(percorso_db)
    copia = sqlite3.connect(destinazione)
    try:
        sorgente.backup(copia)
    finally:
        copia.close()
        sorgente.close()
    print(f"schema: copia di sicurezza in {destinazione}")


def _workout_iniziale():
    """Il primo workout, creato al primo avvio con le utenze.

    Eredita WORKOUT_INGEST_TOKEN da .env, cosi' il telefono gia' configurato
    continua a sincronizzare senza toccarlo.
    """
    from models import Workout

    workout = db.session.query(Workout).order_by(Workout.id).first()
    if workout is None:
        token = (os.environ.get("WORKOUT_INGEST_TOKEN") or "").strip() or None
        workout = Workout(nome="Principale", ingest_token=token)
        db.session.add(workout)
        db.session.commit()
    return workout.id


# Tabelle il cui vincolo di unicita' ora comprende il workout.
TABELLE_DA_RICOSTRUIRE = (
    "impostazione",
    "peso_corporeo",
    "sonno_notte",
    "pasto_nutrizione",
    "misura_salute",
)


def _ricostruisci_con_workout(workout_id):
    """Riscrive le tabelle con un vincolo di unicita' che ora vale per workout.

    Un peso al giorno, una notte per orario di inizio, un'impostazione per
    chiave: con piu' workout valgono per workout, non per tutta l'app. SQLite
    non sa cambiare un vincolo su una tabella esistente, quindi si crea la
    tabella nuova, ci si copiano le righe assegnandole al workout iniziale e si
    butta la vecchia. Gira una volta sola: dopo, la colonna workout_id c'e'.
    """
    from sqlalchemy import inspect, text

    from models import Impostazione

    inspector = inspect(db.engine)
    presenti = set(inspector.get_table_names())
    for nome in TABELLE_DA_RICOSTRUIRE:
        if nome not in presenti:
            continue
        colonne = [c["name"] for c in inspector.get_columns(nome)]
        if "workout_id" in colonne:
            continue

        tabella = db.metadata.tables[nome]
        indici = [i["name"] for i in inspector.get_indexes(nome)]
        vecchia = f"{nome}__pre_utenze"
        comuni = ", ".join(f'"{c}"' for c in colonne if c in tabella.c)
        if nome == "impostazione":
            # Le chiavi globali restano senza workout: vedi Impostazione.GLOBALI.
            globali = ", ".join(f"'{c}'" for c in sorted(Impostazione.GLOBALI))
            valore_workout = f"CASE WHEN chiave IN ({globali}) THEN NULL ELSE :workout END"
        else:
            valore_workout = ":workout"

        db.session.execute(text(f'ALTER TABLE "{nome}" RENAME TO "{vecchia}"'))
        # Gli indici seguono la tabella rinominata ma tengono il nome: senza
        # toglierli, quelli della tabella nuova andrebbero in conflitto.
        for indice in indici:
            db.session.execute(text(f'DROP INDEX IF EXISTS "{indice}"'))
        tabella.create(db.session.connection())
        db.session.execute(
            text(
                f'INSERT INTO "{nome}" ({comuni}, workout_id) '
                f'SELECT {comuni}, {valore_workout} FROM "{vecchia}"'
            ),
            {"workout": workout_id},
        )
        db.session.execute(text(f'DROP TABLE "{vecchia}"'))
        db.session.commit()
        print(f"schema: tabella {nome} riscritta con il workout")


def _assegna_workout_iniziale(workout_id):
    """Una tantum, al passaggio alle utenze: i dati che c'erano vanno al primo workout."""
    from sqlalchemy import text

    from models import DatiWorkout

    for mapper in db.Model.registry.mappers:
        if not issubclass(mapper.class_, DatiWorkout):
            continue
        tabella = mapper.class_.__tablename__
        db.session.execute(
            text(f'UPDATE "{tabella}" SET workout_id = :workout WHERE workout_id IS NULL'),
            {"workout": workout_id},
        )
        db.session.execute(
            text(f'CREATE INDEX IF NOT EXISTS "ix_{tabella}_workout_id" ON "{tabella}" (workout_id)')
        )
    db.session.commit()
    print("schema: dati esistenti assegnati al workout iniziale")


def _crea_admin_iniziale(workout_id):
    """Il primo admin, da WORKOUT_USERNAME e WORKOUT_PASSWORD di .env.

    Serve solo quando di utenze non ce n'e' nessuna (prima installazione, o
    passaggio dal vecchio login a password unica): da li' in poi le utenze si
    gestiscono dall'app. Le conversazioni gia' salvate diventano sue.
    """
    from sqlalchemy import text

    from models import RUOLO_ADMIN, Utente

    if db.session.query(Utente.id).first() is not None:
        return
    password = os.environ.get("WORKOUT_PASSWORD", "")
    if not password:
        print("utenze: nessuna utenza e WORKOUT_PASSWORD vuota, primo admin non creato")
        return

    from blueprints.api.auth import valida_password
    valida_password(password)

    admin = Utente(
        username=os.environ.get("WORKOUT_USERNAME", "admin"),
        ruolo=RUOLO_ADMIN,
        ai_abilitata=True,
        workout_id=workout_id,
    )
    admin.imposta_password(password)
    db.session.add(admin)
    db.session.flush()
    db.session.execute(
        text("UPDATE conversazione SET utente_id = :utente WHERE utente_id IS NULL"),
        {"utente": admin.id},
    )
    db.session.commit()
    print(f"utenze: creato l'admin «{admin.username}»")


def _allinea_schema():
    """Aggiunge le colonne nuove alle tabelle gia' esistenti.

    `create_all()` crea le tabelle mancanti ma non tocca quelle presenti: senza
    questo passaggio, aggiungere una colonna a un modello romperebbe l'app su un
    database gia' popolato. Aggiunge solo colonne nullable, l'unico caso che
    SQLite accetta senza riscrivere la tabella.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(db.engine)
    tabelle_presenti = set(inspector.get_table_names())
    aggiunte = set()

    for tabella in db.metadata.sorted_tables:
        if tabella.name not in tabelle_presenti:
            continue
        esistenti = {c["name"] for c in inspector.get_columns(tabella.name)}
        for colonna in tabella.columns:
            if colonna.name in esistenti or not colonna.nullable:
                continue
            tipo = colonna.type.compile(db.engine.dialect)
            db.session.execute(
                text(f'ALTER TABLE {tabella.name} ADD COLUMN "{colonna.name}" {tipo}')
            )
            db.session.commit()
            print(f"schema: aggiunta colonna {tabella.name}.{colonna.name}")
            aggiunte.add((tabella.name, colonna.name))

    return aggiunte


def _arrotonda_pesi_corporei():
    """Pulisce i pesi importati da Samsung Health prima dell'arrotondamento.

    Arrivavano come float a 32 bit (72.30000305175781) e l'app li mostrava con
    tutte le cifre. Adesso `registra_peso_corporeo` arrotonda al centesimo, ma
    le righe gia' salvate restano sporche: si sistemano qui. Idempotente e
    senza effetti quando non c'e' niente da correggere, quindi gira a ogni avvio.
    """
    from sqlalchemy import text

    corrette = db.session.execute(
        text(
            "UPDATE peso_corporeo SET valore_kg = ROUND(valore_kg, 2) "
            "WHERE valore_kg != ROUND(valore_kg, 2)"
        )
    ).rowcount
    db.session.commit()
    if corrette:
        print(f"schema: arrotondati {corrette} pesi corporei al centesimo")


def _ripristina_pr_peso_kg():
    """Backfill una tantum dopo l'aggiunta di PR.peso_kg.

    Le righe PR gia' salvate hanno 'valore' col vecchio significato (il peso
    puro sollevato, non il 1RM stimato introdotto insieme a questa colonna) e
    'peso_kg' vuoto: senza questo passaggio l'etichetta andrebbe in errore
    formattando None, e i nuovi PR si confronterebbero con un `valore` su una
    scala diversa dalla loro. Si ricalcola da zero lo storico PR degli
    esercizi coinvolti: ripopola sia `valore` (1RM) sia `peso_kg` (peso reale)
    in modo coerente, dalle serie gia' registrate.
    """
    from models import PR
    from services.pr import ricalcola_pr

    esercizi_ids = {
        riga[0] for riga in db.session.query(PR.esercizio_libreria_id).distinct()
    }
    if not esercizi_ids:
        return
    ricalcola_pr(esercizi_ids)
    db.session.commit()
    print(f"schema: ricalcolati i PR di {len(esercizi_ids)} esercizi (nuovo 1RM stimato)")


app = create_app()


if __name__ == "__main__":
    host = os.environ.get("WORKOUT_HOST", "127.0.0.1")
    port = int(os.environ.get("WORKOUT_PORT", "8456"))
    print(f"\n  WorkoutTracker → http://{host}:{port}\n")
    if os.environ.get("WORKOUT_DEBUG", "").lower() in ("1", "true"):
        app.run(host=host, port=port, debug=True)
    else:
        from waitress import serve
        serve(app, host=host, port=port, threads=4, max_request_body_size=300 * 1024 * 1024)
