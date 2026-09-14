"""Gestione di utenze e workout, riservata agli admin.

E' l'unica parte dell'app che attraversa i workout: tutto il resto vede solo
quello dell'utenza collegata (tenancy.py). Il controllo del ruolo lo fa gia'
`controlla_accesso` per ogni percorso /api/admin/*.
"""

from flask import Blueprint, g, request

import tenancy
from models import (
    RUOLI,
    RUOLO_ADMIN,
    RUOLO_STANDARD,
    Conversazione,
    DatiWorkout,
    Impostazione,
    Utente,
    Workout,
    db,
)
from schemas import ApiError, api_ok
from serializers import serialize_utente, serialize_workout

from .auth import valida_password

bp = Blueprint("api_utenze", __name__, url_prefix="/api/admin")


def _corpo():
    return request.get_json(force=True, silent=True) or {}


def _workout_o_404(workout_id):
    workout = db.session.get(Workout, workout_id) if workout_id else None
    if workout is None:
        raise ApiError("NOT_FOUND", "Workout non trovato.", 404)
    return workout


def _utente_o_404(utente_id):
    utente = db.session.get(Utente, utente_id)
    if utente is None:
        raise ApiError("NOT_FOUND", "Utenza non trovata.", 404)
    return utente


def _json_workout(workout):
    return serialize_workout(workout, n_utenti=len(workout.utenti), con_token=True)


# --- Workout -------------------------------------------------------------


def _nome_workout(valore, escluso_id=None):
    nome = str(valore or "").strip()
    if not nome or len(nome) > 80:
        raise ApiError("VALIDATION_ERROR", "Il nome del workout deve avere fra 1 e 80 caratteri.", 422)
    doppione = db.session.query(Workout).filter(Workout.nome == nome, Workout.id != escluso_id).first()
    if doppione is not None:
        raise ApiError("VALIDATION_ERROR", "Esiste gia' un workout con questo nome.", 422)
    return nome


def _ha_dati(workout_id):
    with tenancy.senza_filtro():
        for mapper in db.Model.registry.mappers:
            modello = mapper.class_
            if not issubclass(modello, DatiWorkout):
                continue
            if db.session.query(modello.id).filter(modello.workout_id == workout_id).first():
                return True
    return False


@bp.get("/workout")
def elenco_workout_route():
    workout = db.session.query(Workout).order_by(Workout.nome).all()
    return api_ok([_json_workout(w) for w in workout])


@bp.post("/workout")
def crea_workout_route():
    workout = Workout(nome=_nome_workout(_corpo().get("nome")))
    db.session.add(workout)
    db.session.commit()
    return api_ok(_json_workout(workout), status=201)


@bp.patch("/workout/<int:workout_id>")
def modifica_workout_route(workout_id):
    workout = _workout_o_404(workout_id)
    corpo = _corpo()
    if "nome" in corpo:
        workout.nome = _nome_workout(corpo["nome"], escluso_id=workout.id)
    db.session.commit()
    return api_ok(_json_workout(workout))


@bp.post("/workout/<int:workout_id>/token")
def genera_token_route(workout_id):
    """Nuovo token Samsung Health: quello vecchio smette subito di funzionare."""
    workout = _workout_o_404(workout_id)
    workout.genera_token()
    db.session.commit()
    return api_ok(_json_workout(workout))


@bp.delete("/workout/<int:workout_id>")
def elimina_workout_route(workout_id):
    """Solo un workout vuoto: niente utenze e niente dati.

    I dati di un workout non si recuperano da nessun'altra parte, quindi non si
    cancellano di sponda eliminando il contenitore.
    """
    workout = _workout_o_404(workout_id)
    if workout.utenti:
        raise ApiError(
            "CONFLICT", "Il workout ha ancora delle utenze: spostale o eliminale prima.", 409
        )
    if _ha_dati(workout.id):
        raise ApiError(
            "CONFLICT", "Il workout contiene dati (schede, allenamenti, misure): non si elimina.", 409
        )
    db.session.query(Impostazione).filter_by(workout_id=workout.id).delete()
    db.session.delete(workout)
    db.session.commit()
    return "", 204


# --- Utenze --------------------------------------------------------------


def _username(valore, escluso_id=None):
    username = str(valore or "").strip()
    if not 3 <= len(username) <= 80:
        raise ApiError("VALIDATION_ERROR", "Il nome utente deve avere fra 3 e 80 caratteri.", 422)
    doppione = (
        db.session.query(Utente)
        .filter(Utente.username == username, Utente.id != escluso_id)
        .first()
    )
    if doppione is not None:
        raise ApiError("VALIDATION_ERROR", "Esiste gia' un'utenza con questo nome.", 422)
    return username


def _ruolo(valore):
    if valore not in RUOLI:
        raise ApiError("VALIDATION_ERROR", "Ruolo non valido.", 422)
    return valore


def _verifica_admin_rimasti():
    """Senza un admin attivo nessuno potrebbe piu' gestire le utenze."""
    db.session.flush()
    if db.session.query(Utente.id).filter_by(ruolo=RUOLO_ADMIN, attivo=True).first() is None:
        db.session.rollback()
        raise ApiError("VALIDATION_ERROR", "Deve restare almeno un admin attivo.", 422)


@bp.get("/utenti")
def elenco_utenti_route():
    utenti = db.session.query(Utente).order_by(Utente.username).all()
    return api_ok([serialize_utente(u) for u in utenti])


@bp.post("/utenti")
def crea_utente_route():
    corpo = _corpo()
    password = str(corpo.get("password") or "")
    valida_password(password)
    utente = Utente(
        username=_username(corpo.get("username")),
        ruolo=_ruolo(corpo.get("ruolo") or RUOLO_STANDARD),
        workout_id=_workout_o_404(corpo.get("workout_id")).id,
        ai_abilitata=bool(corpo.get("ai_abilitata")),
    )
    utente.imposta_password(password)
    db.session.add(utente)
    db.session.commit()
    return api_ok(serialize_utente(utente), status=201)


@bp.patch("/utenti/<int:utente_id>")
def modifica_utente_route(utente_id):
    utente = _utente_o_404(utente_id)
    corpo = _corpo()
    se_stesso = utente.id == g.utente.id

    if "username" in corpo:
        utente.username = _username(corpo["username"], escluso_id=utente.id)
    if "ruolo" in corpo:
        ruolo = _ruolo(corpo["ruolo"])
        if se_stesso and ruolo != utente.ruolo:
            raise ApiError("VALIDATION_ERROR", "Non puoi cambiare il ruolo della tua utenza.", 422)
        utente.ruolo = ruolo
    if "workout_id" in corpo:
        utente.workout_id = _workout_o_404(corpo["workout_id"]).id
    if "ai_abilitata" in corpo:
        utente.ai_abilitata = bool(corpo["ai_abilitata"])
    if "attivo" in corpo:
        if se_stesso and not corpo["attivo"]:
            raise ApiError("VALIDATION_ERROR", "Non puoi disattivare la tua utenza.", 422)
        utente.attivo = bool(corpo["attivo"])
    if corpo.get("password"):
        password = str(corpo["password"])
        valida_password(password)
        utente.imposta_password(password)

    _verifica_admin_rimasti()
    db.session.commit()
    return api_ok(serialize_utente(utente))


@bp.delete("/utenti/<int:utente_id>")
def elimina_utente_route(utente_id):
    """Con l'utenza vanno le sue chat; i dati del workout restano."""
    utente = _utente_o_404(utente_id)
    if utente.id == g.utente.id:
        raise ApiError("VALIDATION_ERROR", "Non puoi eliminare la tua utenza.", 422)

    with tenancy.senza_filtro():
        for conversazione in db.session.query(Conversazione).filter_by(utente_id=utente.id):
            db.session.delete(conversazione)
        db.session.delete(utente)
        _verifica_admin_rimasti()
        db.session.commit()
    return "", 204
