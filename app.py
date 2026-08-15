"""WorkoutTracker — webapp locale per gli allenamenti a casa.

Avvio: `python app.py`. Flask espone solo l'API JSON sotto `/api/*`; per il
resto serve il build statico di React (`frontend/dist`), con fallback a
`index.html` per lasciare il routing alla SPA (`spa()` più sotto).
"""

import os
import secrets
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, abort, request, send_from_directory, session
from flask_cors import CORS

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

    db.init_app(app)
    register_error_handlers(app)

    @app.before_request
    def _richiedi_autenticazione():
        """Protegge tutta l'API dietro il login a password singola.

        L'app gira in genere con WORKOUT_HOST=0.0.0.0 per essere raggiungibile
        dal telefono in casa: questo la espone a chiunque sia sulla stessa
        rete WiFi, da qui la necessita' di un accesso protetto anche per un
        uso single-user. Le route non-API (SPA/asset statici) restano
        pubbliche: e' il frontend a mostrare la schermata di login finche'
        /api/auth/me non conferma la sessione.
        """
        if not request.path.startswith("/api/"):
            return None
        if request.path.startswith("/api/auth/"):
            return None
        if not session.get("authenticated"):
            return api_error("UNAUTHORIZED", "Accesso non autenticato.", 401)
        return None

    # In dev il frontend Vite gira su :5173 e proxya /api verso questo
    # server: CORS serve solo come fallback (es. se il proxy non e' in uso).
    origini_frontend = os.environ.get(
        "WORKOUT_FRONTEND_ORIGIN", "http://127.0.0.1:5173,http://localhost:5173"
    ).split(",")
    CORS(app, resources={r"/api/*": {"origins": origini_frontend}})

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
        applica_seed()
        print("Seed applicato.")

    with app.app_context():
        from seed import applica_seed

        db.create_all()
        colonne_nuove = _allinea_schema()
        if ("pr", "peso_kg") in colonne_nuove:
            _ripristina_pr_peso_kg()
        applica_seed()

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
    app.run(host=host, port=port, debug=True)
