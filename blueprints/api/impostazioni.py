"""API REST per le preferenze dell'app (timer di default, contesto AI,
attrezzatura disponibile).

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


def _dati():
    return {
        "timer_default_sec": Impostazione.get_int("timer_default_sec", 90),
        "analisi_n_sessioni": Impostazione.get_int("analisi_n_sessioni", 10),
        "attrezzatura_disponibile": Impostazione.get("attrezzatura_disponibile") or "",
    }


@bp.get("/impostazioni")
def leggi_impostazioni_route():
    return api_ok(_dati())


@bp.patch("/impostazioni")
def modifica_impostazioni_route():
    corpo = request.get_json(force=True, silent=True) or {}
    try:
        if "timer_default_sec" in corpo:
            imposta_preferenza("timer_default_sec", corpo["timer_default_sec"])
        if "analisi_n_sessioni" in corpo:
            imposta_preferenza("analisi_n_sessioni", corpo["analisi_n_sessioni"])
        if "attrezzatura_disponibile" in corpo:
            imposta_attrezzatura(corpo["attrezzatura_disponibile"])
    except ErroreStrumento as exc:
        raise ApiError("VALIDATION_ERROR", str(exc), 422)
    return api_ok(_dati())
