"""Login a password singola: protegge l'app quando e' esposta sulla rete
WiFi di casa (WORKOUT_HOST=0.0.0.0). Nessun account/utente, solo una
password condivisa letta da WORKOUT_PASSWORD (.env), mai salvata nel db.
"""

import os
import secrets

from flask import Blueprint, request, session

from schemas import ApiError, api_ok

bp = Blueprint("api_auth", __name__, url_prefix="/api/auth")


@bp.get("/me")
def me_route():
    return api_ok({"authenticated": bool(session.get("authenticated"))})


@bp.post("/login")
def login_route():
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
        raise ApiError("INVALID_PASSWORD", "Nome utente o password errati.", 401)

    session.clear()
    session["authenticated"] = True
    session.permanent = ricordami
    return api_ok({"authenticated": True})


@bp.post("/logout")
def logout_route():
    session.clear()
    return api_ok({"authenticated": False})
