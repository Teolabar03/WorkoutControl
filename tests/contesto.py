"""Ambiente isolato per i test: mai il database o il .env dello sviluppatore.

Sta in un modulo a parte perche' `app` e' un oggetto unico, creato al primo
import: le variabili d'ambiente vanno quindi fissate una volta sola, prima di
quell'import. Se ogni file di test se le impostasse per conto suo, il secondo
arriverebbe a cose fatte e finirebbe per lavorare sul database temporaneo del
primo — che nel frattempo verrebbe cancellato sotto i piedi.
"""
import atexit
import os
import tempfile
from pathlib import Path

_temporanea = tempfile.TemporaryDirectory(prefix="workout-tests-")

os.environ["PYTHON_DOTENV_DISABLED"] = "1"
os.environ["WORKOUT_DB_PATH"] = str(Path(_temporanea.name) / "test.db")
os.environ["WORKOUT_SECRET_KEY"] = "isolated-test-key"
os.environ["WORKOUT_PASSWORD"] = "test-admin-password"
os.environ["WORKOUT_USERNAME"] = "admin"
os.environ["WORKOUT_FRONTEND_ORIGIN"] = ""
os.environ["WORKOUT_COOKIE_SECURE"] = "0"
os.environ["WORKOUT_COOKIE_PATH"] = "/"
for _nome in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_KEY",
              "OLLAMA_MODEL", "WORKOUT_INGEST_TOKEN"):
    os.environ.pop(_nome, None)

from app import app  # noqa: E402
from models import db  # noqa: E402


@atexit.register
def _chiudi():
    """Alla fine di tutti i test, non alla fine di una singola classe: la
    connessione e la cartella sono condivise da tutti i file."""
    with app.app_context():
        db.session.remove()
        db.engine.dispose()
    try:
        _temporanea.cleanup()
    except OSError:
        # Su Windows il file puo' restare agganciato un istante dopo dispose():
        # non vale un test rosso, la cartella temporanea la ripulisce il sistema.
        pass


__all__ = ["app", "db"]
