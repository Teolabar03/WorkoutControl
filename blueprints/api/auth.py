"""Login a password singola: protegge l'app quando e' esposta sulla rete
WiFi di casa (WORKOUT_HOST=0.0.0.0). Nessun account/utente, solo una
password condivisa letta da WORKOUT_PASSWORD (.env), mai salvata nel db.

Una password sola e nessun utente significa che chi la indovina entra: se
l'app e' raggiungibile da internet, il login e' l'unica barriera e va
protetto dai tentativi a ripetizione (vedi `_registra_fallimento`).
"""

import os
import secrets
import threading
import time

from flask import Blueprint, request, session

from schemas import ApiError, api_ok

bp = Blueprint("api_auth", __name__, url_prefix="/api/auth")

# Quanti tentativi falliti si tollerano prima di bloccare, e per quanto.
# Il blocco raddoppia a ogni tornata (1 min, 2, 4...) fino al tetto: chi
# sbaglia la password davvero riprova dopo un minuto, chi la sta indovinando
# a tentativi si ritrova fermo per un'ora dopo poche tornate.
_MAX_TENTATIVI = 5
_BLOCCO_INIZIALE_SECONDI = 60
_BLOCCO_MASSIMO_SECONDI = 3600

# Stato in memoria, per processo: il servizio gira con un solo worker
# gunicorn, quindi basta. Con piu' worker il conteggio si dividerebbe fra
# loro e il limite sarebbe piu' permissivo (mai piu' permissivo del numero
# di worker), non inefficace.
_tentativi: dict[str, dict] = {}
_tentativi_lock = threading.Lock()


def _ip_chiamante() -> str:
    """IP a cui attribuire i tentativi.

    Dietro un reverse proxy `remote_addr` e' quello del proxy (127.0.0.1) ed
    e' uguale per tutti: senza ProxyFix attivo (WORKOUT_PROXY_HOPS, vedi
    app.py) il primo attaccante bloccherebbe anche te. Vale quindi la pena
    tenerne conto solo se il deploy e' configurato per fidarsi del proxy.
    """
    return request.remote_addr or "sconosciuto"


def _verifica_blocco(ip: str) -> None:
    """Se l'IP e' sotto blocco, rifiuta senza nemmeno guardare la password."""
    with _tentativi_lock:
        stato = _tentativi.get(ip)
        if not stato:
            return
        rimasti = stato["bloccato_fino"] - time.monotonic()
        if rimasti <= 0:
            return
    raise ApiError(
        "TOO_MANY_ATTEMPTS",
        f"Troppi tentativi falliti. Riprova fra {int(rimasti) + 1} secondi.",
        429,
    )


def _registra_fallimento(ip: str) -> None:
    with _tentativi_lock:
        _dimentica_scaduti()
        stato = _tentativi.setdefault(
            ip,
            {"conteggio": 0, "blocchi": 0, "bloccato_fino": 0.0, "visto_a": 0.0},
        )
        stato["conteggio"] += 1
        stato["visto_a"] = time.monotonic()
        if stato["conteggio"] < _MAX_TENTATIVI:
            return
        # Soglia raggiunta: blocca, e riparti a contare per la tornata dopo.
        durata = min(
            _BLOCCO_INIZIALE_SECONDI * (2 ** stato["blocchi"]),
            _BLOCCO_MASSIMO_SECONDI,
        )
        stato["blocchi"] += 1
        stato["conteggio"] = 0
        stato["bloccato_fino"] = time.monotonic() + durata


def _azzera_tentativi(ip: str) -> None:
    with _tentativi_lock:
        _tentativi.pop(ip, None)


def _dimentica_scaduti() -> None:
    """Toglie gli IP fermi da un pezzo: senza questo il dizionario crescerebbe
    a ogni indirizzo che prova il login. Si guarda l'ultimo tentativo, non il
    blocco: chi sbaglia poche volte e aspetta non ha un blocco da far scadere,
    e cancellarlo subito gli regalerebbe tentativi infiniti a ritmo lento.
    Da chiamare col lock gia' preso."""
    limite = time.monotonic() - _BLOCCO_MASSIMO_SECONDI
    scaduti = [
        k
        for k, v in _tentativi.items()
        if v["visto_a"] < limite and v["bloccato_fino"] < time.monotonic()
    ]
    for chiave in scaduti:
        del _tentativi[chiave]


@bp.get("/me")
def me_route():
    return api_ok({"authenticated": bool(session.get("authenticated"))})


@bp.post("/login")
def login_route():
    ip = _ip_chiamante()
    _verifica_blocco(ip)

    corpo = request.get_json(force=True, silent=True) or {}
    username = str(corpo.get("username") or "")
    password = str(corpo.get("password") or "")
    ricordami = bool(corpo.get("remember"))

    password_attesa = os.environ.get("WORKOUT_PASSWORD", "")
    if not password_attesa:
        raise ApiError(
            "AUTH_NOT_CONFIGURED",
            "Nessuna password configurata: imposta WORKOUT_PASSWORD nel file .env.",
            500,
        )
    username_atteso = os.environ.get("WORKOUT_USERNAME", "admin")

    username_ok = secrets.compare_digest(username, username_atteso)
    password_ok = secrets.compare_digest(password, password_attesa)
    if not (username_ok and password_ok):
        _registra_fallimento(ip)
        raise ApiError("INVALID_PASSWORD", "Nome utente o password errati.", 401)

    _azzera_tentativi(ip)
    session.clear()
    session["authenticated"] = True
    session.permanent = ricordami
    return api_ok({"authenticated": True})


@bp.post("/logout")
def logout_route():
    session.clear()
    return api_ok({"authenticated": False})
