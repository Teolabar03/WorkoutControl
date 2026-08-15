"""API REST per schede di allenamento e libreria esercizi.

Le mutazioni riusano le funzioni di dominio già scritte per l'assistente AI in
`services/ai_tools.py` (crea_scheda, aggiorna_scheda, ...): il decoratore
`@strumento` le registra ma restituisce la funzione originale invariata, sono
quindi chiamabili direttamente da qui senza duplicare la logica (validazioni,
gestione degli esercizi, commit). Le letture invece usano serializzatori
dedicati in `serializers.py`, più ricchi di quelli — volutamente compatti —
pensati per il modello AI.
"""

from flask import Blueprint, request

from models import EsercizioLibreria, EsercizioScheda, Scheda, db
from schemas import ApiError, api_ok
from serializers import (
    serialize_esercizio_libreria,
    serialize_esercizio_scheda,
    serialize_scheda,
)
from services.ai_tools import (
    ErroreStrumento,
    aggiorna_esercizio_scheda,
    aggiorna_scheda,
    aggiungi_esercizio_a_scheda,
    crea_esercizio_libreria,
    crea_scheda,
    duplica_scheda,
    elimina_scheda,
    rimuovi_esercizio_da_scheda,
)

bp = Blueprint("api_schede", __name__, url_prefix="/api")


def _chiama(funzione, **kwargs):
    """Esegue uno strumento di dominio traducendo ErroreStrumento in ApiError."""
    try:
        return funzione(**kwargs)
    except ErroreStrumento as exc:
        raise ApiError("VALIDATION_ERROR", str(exc), 422)


def _scheda_o_404(scheda_id):
    scheda = db.session.get(Scheda, scheda_id)
    if scheda is None:
        raise ApiError("NOT_FOUND", "Scheda non trovata.", 404)
    return scheda


def _voce_o_404(voce_id):
    voce = db.session.get(EsercizioScheda, voce_id)
    if voce is None:
        raise ApiError("NOT_FOUND", "Esercizio di scheda non trovato.", 404)
    return voce


# --- Schede ------------------------------------------------------------


@bp.get("/schede")
def elenco_schede_route():
    query = db.session.query(Scheda)
    solo_attive = request.args.get("attiva")
    if solo_attive is not None:
        query = query.filter_by(attiva=solo_attive.lower() in ("1", "true", "si"))
    schede = query.order_by(Scheda.attiva.desc(), Scheda.nome).all()
    return api_ok([serialize_scheda(s, con_esercizi=False) for s in schede])


@bp.post("/schede")
def crea_scheda_route():
    corpo = request.get_json(force=True, silent=True) or {}
    nome = (corpo.get("nome") or "").strip()
    if not nome:
        raise ApiError("VALIDATION_ERROR", "Il nome della scheda è obbligatorio.", 422)

    esercizi = [
        dict(e, esercizio=e.get("esercizio_libreria_id"))
        for e in corpo.get("esercizi") or []
    ]
    risultato = _chiama(
        crea_scheda,
        nome=nome,
        descrizione=corpo.get("descrizione", ""),
        obiettivo=corpo.get("obiettivo", ""),
        esercizi=esercizi,
    )
    scheda = _scheda_o_404(risultato["scheda_id"])
    return api_ok(serialize_scheda(scheda), status=201)


@bp.get("/schede/<int:scheda_id>")
def dettaglio_scheda_route(scheda_id):
    return api_ok(serialize_scheda(_scheda_o_404(scheda_id)))


@bp.patch("/schede/<int:scheda_id>")
def modifica_scheda_route(scheda_id):
    _scheda_o_404(scheda_id)
    corpo = request.get_json(force=True, silent=True) or {}
    _chiama(
        aggiorna_scheda,
        scheda_id=scheda_id,
        nome=corpo.get("nome"),
        descrizione=corpo.get("descrizione"),
        obiettivo=corpo.get("obiettivo"),
        attiva=corpo.get("attiva"),
    )
    return api_ok(serialize_scheda(_scheda_o_404(scheda_id)))


@bp.delete("/schede/<int:scheda_id>")
def elimina_scheda_route(scheda_id):
    _scheda_o_404(scheda_id)
    risultato = _chiama(elimina_scheda, scheda_id=scheda_id)
    return api_ok({"archiviata": risultato.get("archiviata", False)})


@bp.post("/schede/<int:scheda_id>/duplica")
def duplica_scheda_route(scheda_id):
    _scheda_o_404(scheda_id)
    corpo = request.get_json(force=True, silent=True) or {}
    risultato = _chiama(
        duplica_scheda, scheda_id=scheda_id, nuovo_nome=corpo.get("nuovo_nome")
    )
    copia = _scheda_o_404(risultato["scheda_id"])
    return api_ok(serialize_scheda(copia), status=201)


@bp.post("/schede/<int:scheda_id>/esercizi")
def aggiungi_esercizio_route(scheda_id):
    _scheda_o_404(scheda_id)
    corpo = request.get_json(force=True, silent=True) or {}
    esercizio_id = corpo.get("esercizio_libreria_id")
    if not esercizio_id:
        raise ApiError("VALIDATION_ERROR", "esercizio_libreria_id è obbligatorio.", 422)

    risultato = _chiama(
        aggiungi_esercizio_a_scheda,
        scheda_id=scheda_id,
        esercizio=esercizio_id,
        serie_target=corpo.get("serie_target"),
        rep_target=corpo.get("rep_target"),
        durata_target_sec=corpo.get("durata_target_sec"),
        peso_suggerito_kg=corpo.get("peso_suggerito_kg"),
        note=corpo.get("note", ""),
        timer_recupero_secondi=corpo.get("timer_recupero_secondi"),
    )
    voce = _voce_o_404(risultato["voce"]["voce_id"])
    return api_ok(serialize_esercizio_scheda(voce), status=201)


@bp.put("/schede/<int:scheda_id>/esercizi/ordine")
def riordina_esercizi_route(scheda_id):
    """Riordino bulk (drag&drop): body {"ordine": [voce_id, voce_id, ...]}."""
    scheda = _scheda_o_404(scheda_id)
    corpo = request.get_json(force=True, silent=True) or {}
    ordine_richiesto = corpo.get("ordine")
    if not isinstance(ordine_richiesto, list):
        raise ApiError("VALIDATION_ERROR", "ordine deve essere un elenco di id.", 422)

    voci_per_id = {v.id: v for v in scheda.esercizi}
    if set(ordine_richiesto) != set(voci_per_id):
        raise ApiError(
            "VALIDATION_ERROR",
            "ordine deve contenere esattamente gli id degli esercizi della scheda.",
            422,
        )

    for indice, voce_id in enumerate(ordine_richiesto):
        voci_per_id[voce_id].ordine = indice
    db.session.commit()
    return api_ok(serialize_scheda(scheda))


@bp.patch("/esercizi-scheda/<int:voce_id>")
def modifica_esercizio_scheda_route(voce_id):
    _voce_o_404(voce_id)
    corpo = request.get_json(force=True, silent=True) or {}
    risultato = _chiama(
        aggiorna_esercizio_scheda,
        voce_id=voce_id,
        serie_target=corpo.get("serie_target"),
        rep_target=corpo.get("rep_target"),
        durata_target_sec=corpo.get("durata_target_sec"),
        peso_suggerito_kg=corpo.get("peso_suggerito_kg"),
        note=corpo.get("note"),
        timer_recupero_secondi=corpo.get("timer_recupero_secondi"),
    )
    voce = _voce_o_404(risultato["voce"]["voce_id"])
    return api_ok(serialize_esercizio_scheda(voce))


@bp.delete("/esercizi-scheda/<int:voce_id>")
def rimuovi_esercizio_scheda_route(voce_id):
    _voce_o_404(voce_id)
    _chiama(rimuovi_esercizio_da_scheda, voce_id=voce_id)
    return "", 204


# --- Libreria esercizi ---------------------------------------------------


@bp.get("/libreria-esercizi")
def libreria_route():
    query = db.session.query(EsercizioLibreria)

    attrezzatura = request.args.get("attrezzatura")
    if attrezzatura:
        query = query.filter(EsercizioLibreria.attrezzatura.ilike(f"%{attrezzatura}%"))

    gruppo = request.args.get("gruppo")
    if gruppo:
        query = query.filter(
            EsercizioLibreria.gruppo_muscolare.ilike(f"%{gruppo}%")
        )

    archiviato = request.args.get("archiviato")
    if archiviato is not None:
        query = query.filter_by(archiviato=archiviato.lower() in ("1", "true", "si"))

    esercizi = query.order_by(
        EsercizioLibreria.archiviato,
        EsercizioLibreria.gruppo_muscolare,
        EsercizioLibreria.nome,
    ).all()
    return api_ok([serialize_esercizio_libreria(e) for e in esercizi])


@bp.post("/libreria-esercizi")
def nuovo_esercizio_route():
    corpo = request.get_json(force=True, silent=True) or {}
    risultato = _chiama(
        crea_esercizio_libreria,
        nome=corpo.get("nome", ""),
        gruppo_muscolare=corpo.get("gruppo_muscolare", ""),
        attrezzatura=corpo.get("attrezzatura", ""),
        tipo_carico=corpo.get("tipo_carico", "corpo_libero"),
        tipo_misura=corpo.get("tipo_misura", "reps"),
        carichi_per_serie=corpo.get("carichi_per_serie"),
        note_tecniche=corpo.get("note_tecniche", ""),
    )
    esercizio = db.session.get(EsercizioLibreria, risultato["esercizio_id"])
    return api_ok(serialize_esercizio_libreria(esercizio), status=201)


@bp.patch("/libreria-esercizi/<int:esercizio_id>")
def modifica_esercizio_libreria_route(esercizio_id):
    esercizio = db.session.get(EsercizioLibreria, esercizio_id)
    if esercizio is None:
        raise ApiError("NOT_FOUND", "Esercizio non trovato.", 404)
    corpo = request.get_json(force=True, silent=True) or {}
    if "archiviato" in corpo:
        esercizio.archiviato = bool(corpo["archiviato"])
    db.session.commit()
    return api_ok(serialize_esercizio_libreria(esercizio))
