"""API REST dei suoni personalizzati per l'avviso di fine recupero.

L'elenco non porta il contenuto dei file: serve a disegnare la scelta in
Impostazioni. Il contenuto si chiede per un suono alla volta, quello scelto o
quello da ascoltare in anteprima.
"""

from flask import Blueprint, request

from schemas import ApiError, api_ok
from services import suoni
from services.ai_tools import ErroreStrumento

bp = Blueprint("api_suoni", __name__, url_prefix="/api")


def _suono_o_404(suono_id):
    suono = suoni.trova(suono_id)
    if suono is None:
        raise ApiError("NOT_FOUND", "Suono non trovato.", 404)
    return suono


@bp.get("/suoni")
def elenco_suoni_route():
    return api_ok(suoni.elenco())


@bp.get("/suoni/<int:suono_id>")
def leggi_suono_route(suono_id):
    return api_ok(suoni.serializza(_suono_o_404(suono_id), contenuto=True))


@bp.post("/suoni")
def crea_suono_route():
    corpo = request.get_json(force=True, silent=True) or {}
    try:
        suono = suoni.crea(corpo.get("nome"), corpo.get("mime"), corpo.get("contenuto"))
    except ErroreStrumento as exc:
        raise ApiError("VALIDATION_ERROR", str(exc), 422)
    return api_ok(suono)


@bp.delete("/suoni/<int:suono_id>")
def elimina_suono_route(suono_id):
    suoni.elimina(_suono_o_404(suono_id))
    return api_ok({"id": suono_id})
