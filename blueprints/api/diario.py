"""API REST per il diario recupero/dolori."""

from flask import Blueprint, request

from models import NotaDolore, db
from schemas import ApiError, api_ok
from serializers import serialize_nota_dolore
from services.ai_tools import ErroreStrumento, aggiungi_nota_dolore

bp = Blueprint("api_diario", __name__, url_prefix="/api")


@bp.get("/diario")
def elenco_diario_route():
    note = db.session.query(NotaDolore).order_by(NotaDolore.data.desc()).all()
    return api_ok([serialize_nota_dolore(n) for n in note])


@bp.post("/diario")
def nuova_nota_route():
    corpo = request.get_json(force=True, silent=True) or {}
    try:
        risultato = aggiungi_nota_dolore(
            zona_corporea=corpo.get("zona_corporea", ""),
            descrizione=corpo.get("descrizione", ""),
            gravita=corpo.get("gravita", 1),
            data=corpo.get("data"),
            sessione_id=corpo.get("sessione_id"),
        )
    except ErroreStrumento as exc:
        raise ApiError("VALIDATION_ERROR", str(exc), 422)

    nota = db.session.get(NotaDolore, risultato["nota_id"])
    return api_ok(serialize_nota_dolore(nota), status=201)


@bp.delete("/diario/<int:nota_id>")
def elimina_nota_route(nota_id):
    nota = db.session.get(NotaDolore, nota_id)
    if nota is None:
        raise ApiError("NOT_FOUND", "Nota non trovata.", 404)
    db.session.delete(nota)
    db.session.commit()
    return "", 204
