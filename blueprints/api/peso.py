"""API REST per il tracking del peso corporeo."""

from datetime import date

from flask import Blueprint, request

from models import PesoCorporeo, db
from schemas import ApiError, api_ok
from serializers import serialize_peso_corporeo
from services.ai_tools import ErroreStrumento, registra_peso_corporeo

bp = Blueprint("api_peso", __name__, url_prefix="/api")


@bp.get("/peso")
def elenco_peso_route():
    misure = db.session.query(PesoCorporeo).order_by(PesoCorporeo.data.desc()).all()
    return api_ok([serialize_peso_corporeo(m) for m in misure])


@bp.post("/peso")
def nuovo_peso_route():
    corpo = request.get_json(force=True, silent=True) or {}
    try:
        risultato = registra_peso_corporeo(
            valore_kg=corpo.get("valore_kg"),
            data=corpo.get("data"),
            note=corpo.get("note", ""),
        )
    except ErroreStrumento as exc:
        raise ApiError("VALIDATION_ERROR", str(exc), 422)

    giorno = date.fromisoformat(risultato["data"])
    misura = db.session.query(PesoCorporeo).filter_by(data=giorno).first()
    return api_ok(serialize_peso_corporeo(misura), status=201)


@bp.delete("/peso/<int:misura_id>")
def elimina_peso_route(misura_id):
    misura = db.session.get(PesoCorporeo, misura_id)
    if misura is None:
        raise ApiError("NOT_FOUND", "Misura non trovata.", 404)
    db.session.delete(misura)
    db.session.commit()
    return "", 204
