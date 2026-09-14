"""Isolamento dei dati per workout, e delle chat per utente.

Ogni utenza appartiene a un workout: utenze dello stesso workout vedono gli
stessi dati, workout diversi non si vedono fra loro. Invece di aggiungere un
filtro a mano alle circa novanta query dell'app (e ai 27 strumenti
dell'assistente, che le riusano), il filtro lo mette SQLAlchemy da solo a ogni
SELECT, UPDATE e DELETE sui modelli che ereditano `DatiWorkout`: una query
dimenticata non puo' mostrare i dati di un altro workout. Allo stesso modo le
righe nuove ricevono il workout corrente al flush. Le conversazioni con
l'assistente seguono la stessa regola, ma per utente.

Il contesto vive in una ContextVar. Lo imposta `before_request` in app.py per
ogni chiamata /api/*; fuori da una richiesta (avvio, migrazioni, seed) resta
vuoto, cioe' nessun filtro. In una richiesta non autenticata vale
NESSUN_WORKOUT, che non corrisponde a nessuna riga.
"""

import contextvars
from contextlib import contextmanager

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

NESSUN_WORKOUT = -1
_NESSUN_UTENTE = -1

_workout = contextvars.ContextVar("workout_id", default=None)
_utente = contextvars.ContextVar("utente_id", default=None)


def workout_corrente():
    return _workout.get()


def imposta(workout_id, utente_id=None):
    _workout.set(workout_id)
    _utente.set(utente_id)


def azzera():
    imposta(None, None)


@contextmanager
def senza_filtro():
    """Per le poche operazioni che attraversano i workout (gestione utenze)."""
    token_workout = _workout.set(None)
    token_utente = _utente.set(None)
    try:
        yield
    finally:
        _workout.reset(token_workout)
        _utente.reset(token_utente)


def _filtra(stato):
    workout_id = _workout.get()
    # I refresh di colonne riguardano un oggetto gia' caricato, quindi gia'
    # passato dal filtro: rifiltrarli non aggiunge niente.
    if workout_id is None or stato.is_column_load:
        return
    if not (stato.is_select or stato.is_update or stato.is_delete):
        return

    from models import Conversazione, DatiWorkout

    utente_id = _utente.get() or _NESSUN_UTENTE
    stato.statement = stato.statement.options(
        with_loader_criteria(
            DatiWorkout, lambda cls: cls.workout_id == workout_id, include_aliases=True
        ),
        with_loader_criteria(
            Conversazione, lambda cls: cls.utente_id == utente_id, include_aliases=True
        ),
    )


def _assegna(session, _contesto_flush, _istanze):
    workout_id = _workout.get()
    if workout_id is None:
        return

    from models import Conversazione, DatiWorkout

    for oggetto in session.new:
        if isinstance(oggetto, DatiWorkout) and oggetto.workout_id is None:
            if workout_id == NESSUN_WORKOUT:
                raise RuntimeError("Scrittura di dati senza workout in una richiesta non autenticata.")
            oggetto.workout_id = workout_id
        elif isinstance(oggetto, Conversazione) and oggetto.utente_id is None:
            oggetto.utente_id = _utente.get()


def installa():
    if not event.contains(Session, "do_orm_execute", _filtra):
        event.listen(Session, "do_orm_execute", _filtra)
        event.listen(Session, "before_flush", _assegna)
