"""API REST per la chat con l'assistente AI e per lo stato di Ollama.

Le route di invio/rigenerazione messaggio e di stato/avvio Ollama erano già
JSON prima della migrazione: qui restano la stessa logica di
`services/ai.py` (invariata), solo riorganizzata sotto `/api/*` con
l'envelope comune invece delle risposte `{"ok": ...}` ad hoc.
"""

from flask import Blueprint, request

from models import RUOLO_UTENTE, Conversazione, Impostazione, MessaggioChat, db
from schemas import ApiError, api_ok
from serializers import serialize_conversazione, serialize_messaggio
from services import ai

bp = Blueprint("api_chat", __name__, url_prefix="/api")


def _conversazione_o_404(conversazione_id):
    conversazione = db.session.get(Conversazione, conversazione_id)
    if conversazione is None:
        raise ApiError("NOT_FOUND", "Conversazione non trovata.", 404)
    return conversazione


def _id_ultimo_utente(conversazione):
    for messaggio in reversed(conversazione.messaggi):
        if messaggio.ruolo == RUOLO_UTENTE:
            return messaggio.id
    return None


def _n_sessioni(valore):
    """Quanti allenamenti mettere nel contesto: la scelta resta salvata come
    ultima usata, così la chat la ripropone alla riapertura."""
    n = valore or Impostazione.get_int("analisi_n_sessioni", 10)
    try:
        n = max(1, min(int(n), 100))
    except (TypeError, ValueError):
        n = 10
    Impostazione.set("analisi_n_sessioni", n)
    db.session.commit()
    return n


def _gestisci_errore_ai(exc):
    if isinstance(exc, ai.AIOllamaSpentoError):
        raise ApiError("OLLAMA_SPENTO", str(exc), 502, fields={"ollama_da_avviare": True})
    if isinstance(exc, ai.AIRequestError):
        raise ApiError("AI_REQUEST_ERROR", str(exc), 502)
    raise ApiError("AI_CONFIG_ERROR", str(exc), 400)


# --- Conversazioni -----------------------------------------------------


@bp.get("/conversazioni")
def elenco_conversazioni_route():
    if not ai.disponibile():
        raise ApiError("AI_NON_DISPONIBILE", "Assistente AI non configurato.", 400)
    return api_ok([serialize_conversazione(c) for c in ai.conversazioni()])


@bp.get("/conversazioni/<int:conversazione_id>")
def dettaglio_conversazione_route(conversazione_id):
    conversazione = _conversazione_o_404(conversazione_id)
    return api_ok(serialize_conversazione(conversazione, con_messaggi=True))


@bp.post("/conversazioni")
def nuova_conversazione_route():
    if not ai.disponibile():
        raise ApiError("AI_NON_DISPONIBILE", "Assistente AI non configurato.", 400)
    conversazione = ai.nuova_conversazione()
    return api_ok(serialize_conversazione(conversazione), status=201)


@bp.delete("/conversazioni/<int:conversazione_id>")
def elimina_conversazione_route(conversazione_id):
    conversazione = _conversazione_o_404(conversazione_id)
    db.session.delete(conversazione)
    db.session.commit()
    return "", 204


@bp.post("/conversazioni/<int:conversazione_id>/messaggi")
def invia_messaggio_route(conversazione_id):
    if not ai.disponibile():
        raise ApiError("AI_NON_DISPONIBILE", "Assistente AI non configurato.", 400)
    conversazione = _conversazione_o_404(conversazione_id)

    dati = request.get_json(force=True, silent=True) or {}
    testo = (dati.get("testo") or "").strip()
    n = _n_sessioni(dati.get("n_sessioni"))

    try:
        messaggio = ai.rispondi(conversazione, testo, n)
    except (ai.AIConfigError, ai.AIRequestError) as exc:
        _gestisci_errore_ai(exc)

    return api_ok(
        {
            "messaggio": serialize_messaggio(messaggio),
            "titolo": conversazione.titolo,
            "id_utente": _id_ultimo_utente(conversazione),
        },
        status=201,
    )


@bp.post("/conversazioni/<int:conversazione_id>/messaggi/<int:messaggio_id>/rigenera")
def rigenera_messaggio_route(conversazione_id, messaggio_id):
    if not ai.disponibile():
        raise ApiError("AI_NON_DISPONIBILE", "Assistente AI non configurato.", 400)
    conversazione = _conversazione_o_404(conversazione_id)

    messaggio = db.session.get(MessaggioChat, messaggio_id)
    if messaggio is None or messaggio.conversazione_id != conversazione.id:
        raise ApiError("NOT_FOUND", "Messaggio non trovato.", 404)
    if messaggio.ruolo != RUOLO_UTENTE:
        raise ApiError("VALIDATION_ERROR", "Si può modificare solo un tuo messaggio.", 422)
    if messaggio.id != _id_ultimo_utente(conversazione):
        raise ApiError(
            "VALIDATION_ERROR", "Si può modificare solo l'ultimo messaggio inviato.", 422
        )

    dati = request.get_json(force=True, silent=True) or {}
    testo = (dati.get("testo") or "").strip()
    if not testo:
        raise ApiError("VALIDATION_ERROR", "Scrivi un messaggio.", 422)

    azioni_perse = [
        azione
        for m in conversazione.messaggi
        if m.id >= messaggio.id
        for azione in m.elenco_azioni
    ]
    if azioni_perse and not dati.get("conferma"):
        return api_ok({"conferma_richiesta": True, "azioni": azioni_perse})

    n = _n_sessioni(dati.get("n_sessioni"))
    try:
        nuovo = ai.rispondi(conversazione, testo, n, sostituisci_da=messaggio.id)
    except (ai.AIConfigError, ai.AIRequestError) as exc:
        _gestisci_errore_ai(exc)

    return api_ok(
        {
            "messaggio": serialize_messaggio(nuovo),
            "titolo": conversazione.titolo,
            "id_utente": _id_ultimo_utente(conversazione),
        }
    )


# --- Modello AI / Ollama -------------------------------------------------


def _salva_modello_ai(scelta):
    if scelta == (Impostazione.get("ai_modello") or "").strip():
        return
    if scelta and scelta not in ai.chiavi_valide():
        raise ApiError(
            "VALIDATION_ERROR",
            f"«{scelta}» non è fra i modelli disponibili: modello non cambiato.",
            422,
        )

    precedente = ai.modello_ollama()
    Impostazione.set("ai_modello", scelta)
    db.session.flush()
    ai.svuota_cache_catalogo()

    nuovo = ai.modello_ollama()
    if precedente and precedente != nuovo:
        ai.scarica_modello_ollama(precedente)


def _salva_modello_ollama(scelto):
    if scelto == (Impostazione.get("ollama_modello") or "").strip():
        return
    if scelto:
        utilizzabili = ai.modelli_utilizzabili_ollama()
        if utilizzabili is None:
            raise ApiError(
                "OLLAMA_NON_RISPONDE", "Ollama non risponde: modello locale non cambiato.", 502
            )
        if scelto not in [m["nome"] for m in utilizzabili]:
            raise ApiError(
                "VALIDATION_ERROR",
                f"«{scelto}» non è utilizzabile come assistente: modello non cambiato.",
                422,
            )

    precedente = ai.modello_ollama()
    Impostazione.set("ollama_modello", scelto)
    db.session.flush()
    ai.svuota_cache_catalogo(ai.PROVIDER_OLLAMA)
    nuovo = ai.modello_ollama()
    if precedente and precedente != nuovo:
        ai.scarica_modello_ollama(precedente)


@bp.get("/ai/modelli")
def modelli_ai_route():
    if request.args.get("ricarica"):
        ai.svuota_cache_catalogo()
    return api_ok(
        {
            "attivo": ai.chiave_modello_attivo(),
            "gruppi": ai.catalogo_modelli(),
            "provider": ai.etichetta_provider(),
            "modello_attivo": ai.modello_attivo(),
            "modello_riserva": ai.modello_riserva(),
        }
    )


@bp.post("/ai/modello")
def cambia_modello_ai_route():
    dati = request.get_json(force=True, silent=True) or {}
    _salva_modello_ai((dati.get("modello") or "").strip())
    db.session.commit()
    return api_ok(
        {
            "attivo": ai.chiave_modello_attivo(),
            "modello": ai.modello_attivo(),
            "provider": ai.etichetta_provider(),
            "riserva": ai.modello_riserva(),
        }
    )


@bp.post("/ai/ollama-modello")
def cambia_modello_ollama_route():
    dati = request.get_json(force=True, silent=True) or {}
    _salva_modello_ollama((dati.get("modello") or "").strip())
    db.session.commit()
    return api_ok({"ollama_modello": Impostazione.get("ollama_modello") or ""})


@bp.get("/ollama/stato")
def stato_ollama_route():
    return api_ok(ai.stato_ollama())


@bp.post("/ollama/avvia")
def avvia_ollama_route():
    ok, messaggio = ai.avvia_ollama()
    if not ok:
        raise ApiError("OLLAMA_AVVIO_FALLITO", messaggio, 502)
    return api_ok({"messaggio": messaggio})
