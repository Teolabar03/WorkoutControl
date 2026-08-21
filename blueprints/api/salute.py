"""API REST della sezione Salute: ingest dal telefono e lettura dei dati.

`POST /api/health/ingest` e' l'unico endpoint dell'app raggiungibile senza aver
fatto il login: chi lo chiama e' un'app Android (HC Webhook), che una sessione
Flask non ce l'ha e non puo' averla. Al posto del cookie usa un token fisso in
`WORKOUT_INGEST_TOKEN`, e per questo qui i controlli sono piu' stretti che
altrove: token assente in configurazione vuol dire endpoint spento, non
endpoint aperto.
"""

import os
import secrets
from datetime import date, timedelta

from flask import Blueprint, current_app, request

from schemas import ApiError, api_ok
from services import salute

bp = Blueprint("api_salute", __name__, url_prefix="/api")

# Il payload di una sincronizzazione e' qualche decina di kB: oltre questa
# soglia non e' piu' una sincronizzazione, e va rifiutata prima di leggerla.
MAX_PAYLOAD_BYTE = 2 * 1024 * 1024

# Quanti giorni mostra la pagina Salute se non viene chiesto un periodo.
GIORNI_DEFAULT = 30


def _token_configurato():
    return (os.environ.get("WORKOUT_INGEST_TOKEN") or "").strip()


@bp.post("/health/ingest")
def ingest_route():
    """Riceve un payload di HC Webhook e ne salva sonno, peso e alimentazione.

    Risponde 200 anche quando non c'e' niente da salvare: l'app ponte considera
    un errore qualsiasi risposta non 2xx e la riproverebbe a ogni ciclo.
    """
    atteso = _token_configurato()
    if not atteso:
        raise ApiError(
            "INGEST_DISABILITATO",
            "Sincronizzazione non configurata: manca WORKOUT_INGEST_TOKEN.",
            503,
        )

    intestazione = request.headers.get("Authorization", "")
    fornito = intestazione[7:].strip() if intestazione.startswith("Bearer ") else ""
    if not secrets.compare_digest(fornito, atteso):
        raise ApiError("UNAUTHORIZED", "Token di sincronizzazione non valido.", 401)

    if (request.content_length or 0) > MAX_PAYLOAD_BYTE:
        raise ApiError("PAYLOAD_TROPPO_GRANDE", "Payload troppo grande.", 413)

    payload = request.get_json(force=True, silent=True) or {}
    return api_ok(salute.ingerisci_health_connect(payload))


def _giorno(nome, default):
    valore = (request.args.get(nome) or "").strip()
    if not valore:
        return default
    try:
        return date.fromisoformat(valore)
    except ValueError:
        raise ApiError("VALIDATION_ERROR", f"{nome} deve essere in formato AAAA-MM-GG.", 422)


@bp.get("/salute")
def elenco_salute_route():
    al = _giorno("al", date.today())
    dal = _giorno("dal", al - timedelta(days=GIORNI_DEFAULT - 1))
    if dal > al:
        raise ApiError("VALIDATION_ERROR", "L'intervallo di date e' rovesciato.", 422)
    return api_ok(salute.giorni_salute(dal, al))


@bp.get("/salute/stato")
def stato_salute_route():
    """Stato del collegamento, per il pannello in Impostazioni."""
    # SESSION_COOKIE_PATH contiene gia' il prefisso pubblico sotto cui gira
    # l'app ("/workout/" sulla VPS, "/" in locale): il proxy lo toglie prima di
    # passare la richiesta, quindi e' l'unico posto da cui ricostruire l'URL
    # completo da incollare nell'app del telefono.
    prefisso = (current_app.config.get("SESSION_COOKIE_PATH") or "/").rstrip("/")
    return api_ok(
        {
            "ingest_attivo": bool(_token_configurato()),
            "collegata": salute.ci_sono_dati(),
            "url_webhook": request.url_root.rstrip("/") + prefisso + "/api/health/ingest",
            **salute.ultimo_aggiornamento(),
        }
    )
