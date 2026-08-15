"""Envelope uniforme per le risposte dell'API JSON (`/api/*`).

Ogni endpoint deve rispondere con `api_ok(...)` in caso di successo o
sollevare `ApiError`/`marshmallow.ValidationError` in caso di errore: gli
error handler registrati in `app.py` si occupano di tradurli nello stesso
envelope `{"error": {...}}`, cosi' il frontend gestisce sempre la stessa
forma di risposta indipendentemente dall'endpoint.
"""

from flask import jsonify
from marshmallow import EXCLUDE, Schema, fields


class SerieInputSchema(Schema):
    """Una riga serie nel payload strutturato di sessione manuale/modifica."""

    class Meta:
        unknown = EXCLUDE

    peso_kg = fields.Float(allow_none=True, load_default=None)
    ripetizioni = fields.Int(allow_none=True, load_default=None)
    durata_secondi = fields.Int(allow_none=True, load_default=None)
    note = fields.Str(load_default="")


class BloccoInputSchema(Schema):
    """Un esercizio del payload strutturato, con le sue righe serie.

    Sostituisce il parsing posizionale (`serie-v{id}-{indice}-reps`) che
    serviva solo perché il form HTML non poteva esprimere un array: qui
    `serie` è già un array JSON, letto direttamente.
    """

    class Meta:
        unknown = EXCLUDE

    esercizio_scheda_id = fields.Int(allow_none=True, load_default=None)
    esercizio_libreria_id = fields.Int(required=True)
    saltato = fields.Bool(load_default=False)
    motivo_saltato = fields.Str(load_default="")
    serie = fields.List(fields.Nested(SerieInputSchema), load_default=list)


class SessioneManualeSchema(Schema):
    """Payload di `POST /api/sessioni/manuale` e `PUT /api/sessioni/<id>`."""

    class Meta:
        unknown = EXCLUDE

    data = fields.Date(required=True)
    scheda_id = fields.Int(allow_none=True, load_default=None)
    durata_minuti = fields.Int(allow_none=True, load_default=None)
    energia = fields.Int(allow_none=True, load_default=None)
    sonno = fields.Int(allow_none=True, load_default=None)
    umore = fields.Int(allow_none=True, load_default=None)
    note_generali = fields.Str(load_default="")
    blocchi = fields.List(fields.Nested(BloccoInputSchema), load_default=list)


class ApiError(Exception):
    """Errore applicativo con codice macchina, messaggio e status HTTP."""

    def __init__(self, code, message, status=400, fields=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.fields = fields


def api_ok(data, status=200, meta=None):
    body = {"data": data}
    if meta is not None:
        body["meta"] = meta
    return jsonify(body), status


def api_error(code, message, status=400, fields=None):
    err = {"code": code, "message": message}
    if fields is not None:
        err["fields"] = fields
    return jsonify({"error": err}), status


def register_error_handlers(app):
    """Registra gli error handler globali che garantiscono l'envelope su tutta l'app."""
    from marshmallow import ValidationError
    from werkzeug.exceptions import HTTPException

    @app.errorhandler(ApiError)
    def _handle_api_error(exc):
        return api_error(exc.code, exc.message, exc.status, exc.fields)

    @app.errorhandler(ValidationError)
    def _handle_validation_error(exc):
        return api_error(
            "VALIDATION_ERROR", "Dati non validi.", 422, fields=exc.messages
        )

    @app.errorhandler(HTTPException)
    def _handle_http_exception(exc):
        # Le route non-API (es. file statici) continuano a usare le pagine
        # di errore standard di Werkzeug/Flask.
        from flask import request

        if not request.path.startswith("/api/"):
            return exc
        return api_error(
            exc.name.upper().replace(" ", "_"), exc.description, exc.code
        )

    @app.errorhandler(Exception)
    def _handle_unexpected_error(exc):
        from flask import request

        app.logger.exception("Errore non gestito su %s", request.path)
        if not request.path.startswith("/api/"):
            raise exc
        return api_error(
            "INTERNAL_ERROR", "Errore interno del server.", 500
        )
