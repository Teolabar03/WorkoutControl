"""WorkoutTracker — webapp locale per gli allenamenti a casa.

Avvio: `python app.py`
"""

import os
from datetime import date

from dotenv import load_dotenv
from flask import Flask

from models import db

load_dotenv()


def create_app():
    app = Flask(__name__, instance_relative_config=True)
    os.makedirs(app.instance_path, exist_ok=True)

    # Di norma il database sta in instance/workout.db. WORKOUT_DB_PATH permette
    # di puntarlo altrove (backup, prove) senza toccare il codice.
    percorso_db = os.environ.get(
        "WORKOUT_DB_PATH", os.path.join(app.instance_path, "workout.db")
    )

    app.config.update(
        SQLALCHEMY_DATABASE_URI="sqlite:///" + percorso_db,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        # Uso locale single-user: la chiave serve solo ai messaggi flash.
        SECRET_KEY=os.environ.get("WORKOUT_SECRET_KEY", "workout-tracker-locale"),
        JSON_SORT_KEYS=False,
    )

    db.init_app(app)

    from blueprints import calendario, schede, sessione, statistiche

    app.register_blueprint(calendario.bp)
    app.register_blueprint(schede.bp)
    app.register_blueprint(sessione.bp)
    app.register_blueprint(statistiche.bp)

    @app.context_processor
    def inietta_globali():
        """Valori disponibili in tutti i template."""
        from services import ai
        from services.pr import tipo_pr

        return {
            "sessione_corrente": sessione.sessione_in_corso(),
            "oggi": date.today(),
            "tipo_pr": tipo_pr,
            # Senza chiavi API la sezione assistente sparisce dall'interfaccia.
            "ai_disponibile": ai.disponibile(),
        }

    @app.template_filter("data_it")
    def data_it(valore):
        if valore is None:
            return ""
        return valore.strftime("%d/%m/%Y")

    @app.template_filter("numero")
    def numero(valore):
        """Numeri senza zeri decimali inutili: 1.5 -> 1,5 e 2.0 -> 2."""
        if valore is None:
            return ""
        return f"{valore:g}".replace(".", ",")

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
        _allinea_schema()
        applica_seed()

    return app


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


app = create_app()


if __name__ == "__main__":
    host = os.environ.get("WORKOUT_HOST", "127.0.0.1")
    port = int(os.environ.get("WORKOUT_PORT", "5000"))
    print(f"\n  WorkoutTracker → http://{host}:{port}\n")
    app.run(host=host, port=port, debug=True)
