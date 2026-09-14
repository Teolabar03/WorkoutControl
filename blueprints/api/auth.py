"""Login con utenze salvate nel database, e controllo di cosa puo' fare chi.

Ogni utenza ha un ruolo (admin, standard, allenatore), il flag dell'assistente
AI e un workout: il workout decide quali dati vede (tenancy.py), il ruolo cosa
ci puo' fare (`controlla_accesso`). Le password sono salvate solo come hash.

L'app e' raggiungibile da internet: il login e' la barriera e va protetto dai
tentativi a ripetizione (vedi `_registra_fallimento`).
"""

import secrets
import threading
import time
from functools import lru_cache

from flask import Blueprint, g, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import tenancy
from models import Utente, db
from schemas import ApiError, api_error, api_ok
from serializers import serialize_utente

bp = Blueprint("api_auth", __name__, url_prefix="/api/auth")

LUNGHEZZA_MINIMA_PASSWORD = 8

_METODI_LETTURA = frozenset({"GET", "HEAD", "OPTIONS"})
# Modello dell'assistente e server Ollama sono unici per tutta l'installazione:
# cambiarli vale per tutti, quindi e' una decisione da admin.
_AI_GLOBALI = frozenset({"/api/ai/modello", "/api/ai/ollama-modello", "/api/ollama/avvia"})

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


def valida_password(password):
    if len(password) < LUNGHEZZA_MINIMA_PASSWORD:
        raise ApiError(
            "VALIDATION_ERROR",
            f"La password deve avere almeno {LUNGHEZZA_MINIMA_PASSWORD} caratteri.",
            422,
        )


def _firma(utente):
    """Impronta della password tenuta nel cookie di sessione.

    Quando la password cambia (o la reimposta un admin) l'impronta non
    corrisponde piu' e le sessioni aperte con quella vecchia si chiudono da sole.
    """
    return utente.password_hash[-16:]


@lru_cache(maxsize=1)
def _hash_fittizio():
    return generate_password_hash(secrets.token_hex(16))


def carica_utente():
    """L'utenza della sessione, se ancora valida, e il workout che ne deriva."""
    utente_id = session.get("utente_id")
    if not utente_id:
        return None
    utente = db.session.get(Utente, utente_id)
    if utente is None or not utente.attivo or session.get("firma") != _firma(utente):
        session.clear()
        return None
    g.utente = utente
    tenancy.imposta(utente.workout_id, utente.id)
    return utente


def controlla_accesso(utente):
    """Il ruolo contro il percorso chiesto: una risposta 403, o None se passa.

    Sta qui, su tutta l'API in un punto solo, e non route per route: un
    endpoint nuovo e' protetto senza doverselo ricordare. Il frontend nasconde
    gli stessi pulsanti, ma e' questo il controllo che conta.
    """
    percorso = request.path
    scrive = request.method not in _METODI_LETTURA

    if percorso.startswith("/api/admin/") and not utente.admin:
        return api_error("FORBIDDEN", "Serve un'utenza admin.", 403)

    if percorso.startswith(("/api/ai/", "/api/ollama/")):
        if percorso in _AI_GLOBALI and scrive:
            if not utente.admin:
                return api_error(
                    "FORBIDDEN", "Solo un admin puo' cambiare il modello dell'assistente.", 403
                )
        elif not (utente.admin or utente.usa_assistente):
            return api_error("FORBIDDEN", "Assistente AI non abilitato per questa utenza.", 403)

    if percorso.startswith("/api/conversazioni") and not utente.usa_assistente:
        return api_error("FORBIDDEN", "Assistente AI non abilitato per questa utenza.", 403)

    if scrive and not utente.puo_scrivere:
        return api_error("FORBIDDEN", "Utenza in sola lettura: puoi solo consultare i dati.", 403)
    return None


def _stato(utente):
    if utente is None:
        return {"authenticated": False, "utente": None}
    return {"authenticated": True, "utente": serialize_utente(utente)}


@bp.get("/me")
def me_route():
    return api_ok(_stato(g.get("utente")))


@bp.post("/login")
def login_route():
    ip = _ip_chiamante()
    _verifica_blocco(ip)

    corpo = request.get_json(force=True, silent=True) or {}
    username = str(corpo.get("username") or "").strip()
    password = str(corpo.get("password") or "")
    ricordami = bool(corpo.get("remember"))

    if db.session.query(Utente.id).first() is None:
        raise ApiError(
            "AUTH_NOT_CONFIGURED",
            "Nessuna utenza configurata: imposta WORKOUT_PASSWORD nel file .env e riavvia l'app.",
            500,
        )

    utente = db.session.query(Utente).filter_by(username=username).first()
    # La password si verifica anche per un nome inesistente: senza, la risposta
    # arriverebbe prima e i tempi direbbero quali nomi utente esistono.
    if utente is not None:
        password_ok = utente.verifica_password(password)
    else:
        password_ok = check_password_hash(_hash_fittizio(), password)

    if utente is None or not password_ok:
        _registra_fallimento(ip)
        raise ApiError("INVALID_PASSWORD", "Nome utente o password errati.", 401)
    if not utente.attivo:
        raise ApiError("UTENZA_DISATTIVATA", "Utenza disattivata: chiedi a un admin.", 403)

    _azzera_tentativi(ip)
    session.clear()
    session["utente_id"] = utente.id
    session["firma"] = _firma(utente)
    session.permanent = ricordami
    return api_ok(_stato(utente))


@bp.post("/password")
def cambia_password_route():
    """Ogni utenza cambia la propria password, allenatore compreso."""
    utente = g.get("utente")
    if utente is None:
        raise ApiError("UNAUTHORIZED", "Accesso non autenticato.", 401)

    corpo = request.get_json(force=True, silent=True) or {}
    if not utente.verifica_password(str(corpo.get("attuale") or "")):
        raise ApiError("VALIDATION_ERROR", "La password attuale non e' corretta.", 422)
    nuova = str(corpo.get("nuova") or "")
    valida_password(nuova)

    utente.imposta_password(nuova)
    db.session.commit()
    # Questa sessione resta aperta; le altre, con la firma vecchia, no.
    session["firma"] = _firma(utente)
    return api_ok(_stato(utente))


@bp.post("/logout")
def logout_route():
    session.clear()
    return api_ok(_stato(None))
