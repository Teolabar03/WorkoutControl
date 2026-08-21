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
from services.samsung_export import ErroreImport, importa_export

bp = Blueprint("api_salute", __name__, url_prefix="/api")

# Il payload di una sincronizzazione e' qualche decina di kB: oltre questa
# soglia non e' piu' una sincronizzazione, e va rifiutata prima di leggerla.
MAX_PAYLOAD_BYTE = 2 * 1024 * 1024

# Quanti giorni mostra la pagina Salute se non viene chiesto un periodo.
GIORNI_DEFAULT = 30

# L'export completo di Samsung Health puo' pesare parecchio: si leggono solo i
# quattro CSV che servono, ma il file va comunque caricato per intero.
MAX_EXPORT_BYTE = 300 * 1024 * 1024


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

    if not _token_valido(atteso):
        # Il rifiuto va spiegato: dall'altra parte c'e' un'app di terze parti
        # configurata a mano, e "401" da solo non dice se l'header manca o se il
        # token e' sbagliato. Si annotano i NOMI degli header, mai i valori.
        current_app.logger.warning(
            "Ingest rifiutato da %s: header presenti = %s",
            request.remote_addr,
            sorted(request.headers.keys()),
        )
        raise ApiError(
            "UNAUTHORIZED",
            "Token di sincronizzazione mancante o errato. Attesi: header "
            "'Authorization: Bearer <token>' oppure 'X-Ingest-Token: <token>'.",
            401,
        )

    if (request.content_length or 0) > MAX_PAYLOAD_BYTE:
        raise ApiError("PAYLOAD_TROPPO_GRANDE", "Payload troppo grande.", 413)

    payload = request.get_json(force=True, silent=True) or {}
    conteggi = salute.ingerisci_health_connect(payload)

    if not any(conteggi.values()):
        # Una sincronizzazione che non produce niente e' ambigua: puo' voler dire
        # che il telefono non aveva dati nuovi, oppure che li manda sotto nomi
        # che non riconosciamo. Si annota la FORMA del payload — nomi delle
        # chiavi e quanti elementi ciascuna — mai i valori, che sono dati
        # sanitari. Senza, l'unica alternativa sarebbe tirare a indovinare.
        # warning e non info: in produzione il logger di Flask sta a WARNING e
        # una riga info verrebbe scartata in silenzio, proprio quando serve.
        current_app.logger.warning(
            "Ingest senza dati utili: %s",
            {
                chiave: (len(valore) if isinstance(valore, list) else type(valore).__name__)
                for chiave, valore in payload.items()
            }
            if isinstance(payload, dict)
            else type(payload).__name__,
        )
    return api_ok(conteggi)


def _token_valido(atteso):
    """Il token, accettato in tutte le forme che le app di webhook producono.

    HC Webhook fa scrivere nome e valore dell'header in due campi separati, e
    il prefisso "Bearer " finisce facilmente perso o duplicato: accettare le
    varianti costa nulla e toglie di mezzo un'intera classe di errori di
    configurazione, senza indebolire niente — il segreto resta lo stesso.
    """
    candidati = []
    intestazione = (request.headers.get("Authorization") or "").strip()
    if intestazione:
        prefisso, _, resto = intestazione.partition(" ")
        candidati.append(resto.strip() if prefisso.lower() == "bearer" else intestazione)
    for nome in ("X-Ingest-Token", "X-Auth-Token"):
        valore = (request.headers.get(nome) or "").strip()
        if valore:
            candidati.append(valore)
    return any(secrets.compare_digest(c, atteso) for c in candidati)


@bp.post("/salute/import")
def import_export_route():
    """Carica lo storico dall'export "Scarica dati personali" di Samsung Health.

    Sta dietro al login, al contrario dell'ingest: questa la chiama l'utente dal
    browser, non il telefono.
    """
    caricato = request.files.get("file")
    if caricato is None or not caricato.filename:
        raise ApiError("VALIDATION_ERROR", "Nessun file caricato.", 422)
    if (request.content_length or 0) > MAX_EXPORT_BYTE:
        raise ApiError("PAYLOAD_TROPPO_GRANDE", "File troppo grande.", 413)

    try:
        conteggi = importa_export(caricato.stream, caricato.filename)
    except ErroreImport as exc:
        raise ApiError("VALIDATION_ERROR", str(exc), 422)
    return api_ok(conteggi)


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
