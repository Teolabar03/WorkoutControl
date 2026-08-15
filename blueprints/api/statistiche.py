"""API REST per la dashboard statistiche (sola lettura).

Split in un endpoint per grafico invece di un'unica vista aggregata: il
frontend React può così fare fetch paralleli e mostrare skeleton indipendenti
per ogni pannello, invece di aspettare tutta la pagina prima di mostrare
qualcosa. Riusa `services/stats.py` e `services/pr.py` cosi' come sono.
"""

from flask import Blueprint, request

from schemas import api_ok
from serializers import serialize_esercizio_libreria, serialize_pr
from services import stats
from services.pr import pr_attuali, storico_pr

bp = Blueprint("api_statistiche", __name__, url_prefix="/api/statistiche")
bp_pr = Blueprint("api_pr", __name__, url_prefix="/api")


@bp.get("/riepilogo")
def riepilogo_route():
    dati = stats.riepilogo()
    if dati["ultima_sessione"] is not None:
        dati["ultima_sessione"] = dati["ultima_sessione"].isoformat()
    return api_ok(dati)


@bp.get("/volume")
def volume_route():
    return api_ok(stats.volume_nel_tempo())


@bp.get("/ripetizioni")
def ripetizioni_route():
    return api_ok(stats.ripetizioni_nel_tempo())


@bp.get("/frequenza")
def frequenza_route():
    settimane = request.args.get("settimane", type=int) or 12
    return api_ok(stats.frequenza_settimanale(settimane))


@bp.get("/aderenza")
def aderenza_route():
    limite = request.args.get("limite", type=int) or 15
    return api_ok(
        {
            "sessioni": stats.aderenza_schede(limite),
            "riepilogo": stats.aderenza_riepilogo(limite),
        }
    )


@bp.get("/progressione")
def progressione_route():
    esercizio_id = request.args.get("esercizio_id", type=int)
    if not esercizio_id:
        return api_ok({"labels": [], "valori": [], "unita": "", "nome": ""})
    return api_ok(stats.progressione_esercizio(esercizio_id))


@bp.get("/esercizi-con-dati")
def esercizi_con_dati_route():
    return api_ok([serialize_esercizio_libreria(e) for e in stats.esercizi_con_dati()])


@bp_pr.get("/pr")
def pr_route():
    if request.args.get("storico"):
        limite = request.args.get("limite", type=int) or 100
        record = storico_pr()[:limite]
    else:
        record = pr_attuali()
    return api_ok([serialize_pr(p) for p in record])
