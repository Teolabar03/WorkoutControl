"""API REST per le preferenze dell'app (timer di default, contesto AI,
attrezzatura disponibile, altezza e target giornalieri).

La scelta del modello AI/Ollama vive invece in `blueprints/api/chat.py`: è
strettamente legata al catalogo provider (`services/ai.py`), non una
preferenza indipendente come queste.
"""

from flask import Blueprint, request

from models import Impostazione
from schemas import ApiError, api_ok
from services.ai_tools import (
    ErroreStrumento,
    imposta_attrezzatura,
    imposta_preferenza,
)

bp = Blueprint("api_impostazioni", __name__, url_prefix="/api")

# Preferenze numeriche gestite tutte allo stesso modo: il controllo dei limiti
# sta in `imposta_preferenza`, che è anche lo strumento usato dall'assistente.
# L'altezza serve al BMI nella pagina del peso e vale sempre; i target
# giornalieri disegnano le linee di riferimento nella sezione Salute.
CHIAVI_NUMERICHE = (
    "timer_default_sec",
    "analisi_n_sessioni",
    "altezza_cm",
    "target_kcal",
    "target_proteine_g",
    "target_carboidrati_g",
    "target_grassi_g",
    "target_sonno_minuti",
)


def _dati():
    dati = {chiave: Impostazione.get_int(chiave, 0) for chiave in CHIAVI_NUMERICHE}
    dati["attrezzatura_disponibile"] = (
        Impostazione.get("attrezzatura_disponibile") or ""
    )
    return dati


@bp.get("/impostazioni")
def leggi_impostazioni_route():
    return api_ok(_dati())


@bp.patch("/impostazioni")
def modifica_impostazioni_route():
    corpo = request.get_json(force=True, silent=True) or {}
    try:
        for chiave in CHIAVI_NUMERICHE:
            if chiave in corpo:
                imposta_preferenza(chiave, corpo[chiave])
        if "attrezzatura_disponibile" in corpo:
            imposta_attrezzatura(corpo["attrezzatura_disponibile"])
    except ErroreStrumento as exc:
        raise ApiError("VALIDATION_ERROR", str(exc), 422)
    return api_ok(_dati())
