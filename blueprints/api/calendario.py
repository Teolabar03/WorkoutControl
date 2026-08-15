"""API REST per il calendario allenamenti (vista mensile e dettaglio giorno).

`PATCH`/`DELETE /api/sessioni/<id>` qui sotto coprono sia la "modifica
rapida"/eliminazione dal calendario sia quella che in `blueprints/sessione.py`
si chiamava `annulla`: nella UI Jinja erano due azioni separate con lo stesso
effetto, nell'API diventano un solo endpoint.
"""

import calendar as stdlib_calendar
from datetime import date

from flask import Blueprint, request

from models import NotaDolore, Sessione, db
from schemas import ApiError, api_ok
from serializers import serialize_nota_dolore, serialize_sessione
from services.ai_tools import ErroreStrumento, aggiorna_allenamento, elimina_allenamento

bp = Blueprint("api_calendario", __name__, url_prefix="/api")


def _chiama(funzione, **kwargs):
    try:
        return funzione(**kwargs)
    except ErroreStrumento as exc:
        raise ApiError("VALIDATION_ERROR", str(exc), 422)


def _sessione_o_404(sessione_id):
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None:
        raise ApiError("NOT_FOUND", "Sessione non trovata.", 404)
    return sessione


def _mese_valido(anno, mese):
    try:
        return date(anno, mese, 1)
    except ValueError:
        return date.today().replace(day=1)


@bp.get("/calendario")
def vista_mensile_route():
    oggi = date.today()
    anno = request.args.get("anno", type=int) or oggi.year
    mese = request.args.get("mese", type=int) or oggi.month
    primo = _mese_valido(anno, mese)
    anno, mese = primo.year, primo.month
    ultimo_giorno = stdlib_calendar.monthrange(anno, mese)[1]
    ultimo = date(anno, mese, ultimo_giorno)

    sessioni = (
        db.session.query(Sessione)
        .filter(Sessione.data >= primo, Sessione.data <= ultimo)
        .order_by(Sessione.data.asc())
        .all()
    )
    per_giorno = {}
    for sessione in sessioni:
        per_giorno.setdefault(sessione.data, []).append(sessione)

    giorni_con_dolore = {
        n.data
        for n in db.session.query(NotaDolore)
        .filter(NotaDolore.data >= primo, NotaDolore.data <= ultimo)
        .all()
    }

    giorni = [
        {
            "data": giorno.isoformat(),
            "sessioni": [serialize_sessione(s) for s in sessioni_giorno],
            "ha_dolore": giorno in giorni_con_dolore,
        }
        for giorno, sessioni_giorno in sorted(per_giorno.items())
    ]

    return api_ok(
        {
            "anno": anno,
            "mese": mese,
            "giorni_nel_mese": ultimo_giorno,
            # Lunedì=0 ... Domenica=6, per allineare la griglia lato frontend.
            "primo_giorno_settimana": primo.weekday(),
            "totale_mese": len(per_giorno),
            "giorni": giorni,
        }
    )


@bp.get("/calendario/giorni/<giorno>")
def dettaglio_giorno_route(giorno):
    try:
        giorno_data = date.fromisoformat(giorno)
    except ValueError:
        raise ApiError("VALIDATION_ERROR", "Data non valida.", 422)

    sessioni = (
        db.session.query(Sessione)
        .filter_by(data=giorno_data)
        .order_by(Sessione.id.asc())
        .all()
    )
    note_dolore = db.session.query(NotaDolore).filter_by(data=giorno_data).all()

    return api_ok(
        {
            "data": giorno_data.isoformat(),
            "e_futuro": giorno_data > date.today(),
            "sessioni": [serialize_sessione(s, con_dettaglio=True) for s in sessioni],
            "note_dolore": [serialize_nota_dolore(n) for n in note_dolore],
        }
    )


@bp.patch("/sessioni/<int:sessione_id>")
def modifica_sessione_route(sessione_id):
    sessione = _sessione_o_404(sessione_id)
    corpo = request.get_json(force=True, silent=True) or {}

    # aggiorna_allenamento non sa "svuotare" scheda_id (None vuol dire "non
    # toccarlo" per lei): l'allenamento libero si gestisce qui direttamente.
    if "scheda_id" in corpo and corpo["scheda_id"] is None:
        sessione.scheda_id = None
        db.session.commit()

    _chiama(
        aggiorna_allenamento,
        sessione_id=sessione_id,
        scheda_id=corpo.get("scheda_id"),
        durata_minuti=corpo.get("durata_minuti"),
        energia=corpo.get("energia"),
        sonno=corpo.get("sonno"),
        umore=corpo.get("umore"),
        note_generali=corpo.get("note_generali"),
    )
    return api_ok(serialize_sessione(_sessione_o_404(sessione_id)))


@bp.delete("/sessioni/<int:sessione_id>")
def elimina_sessione_route(sessione_id):
    _sessione_o_404(sessione_id)
    _chiama(elimina_allenamento, sessione_id=sessione_id)
    return "", 204
