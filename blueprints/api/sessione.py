"""API REST per la sessione di allenamento attiva (avvio, serie live, chiusura).

`registra_serie`/`elimina_serie` erano già endpoint JSON prima della
migrazione: qui restano la stessa logica, solo adattata all'envelope
`{"data": ...}` comune a tutta l'API.
"""

from datetime import date, datetime

from flask import Blueprint, request

from models import (
    EsercizioLibreria,
    EsercizioSaltato,
    EsercizioSessione,
    Impostazione,
    NotaDolore,
    Scheda,
    SerieEseguita,
    Sessione,
    db,
)
from schemas import ApiError, SessioneManualeSchema, api_ok
from serializers import (
    serialize_esercizio_libreria,
    serialize_esercizio_sessione,
    serialize_serie,
    serialize_sessione,
)
from services.pr import controlla_pr, record_corrente, ricalcola_pr, tipo_pr

bp = Blueprint("api_sessione", __name__, url_prefix="/api")


def sessione_in_corso():
    return (
        db.session.query(Sessione)
        .filter_by(completata=False)
        .order_by(Sessione.id.desc())
        .first()
    )


def _sessione_o_404(sessione_id):
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None:
        raise ApiError("NOT_FOUND", "Sessione non trovata.", 404)
    return sessione


def _voce_sessione_o_404(voce_id):
    voce = db.session.get(EsercizioSessione, voce_id)
    if voce is None:
        raise ApiError("NOT_FOUND", "Esercizio della sessione non trovato.", 404)
    return voce


def _serie_registrate(voce_sessione_id):
    return (
        db.session.query(SerieEseguita)
        .filter_by(esercizio_sessione_id=voce_sessione_id)
        .count()
    )


def _blocchi_attivi(sessione):
    """Un blocco per esercizio della sessione, con le serie già registrate e
    il record attuale da battere — gli stessi dati che servivano a
    sessione.html, letti pero' dallo snapshot EsercizioSessione invece che
    dalla scheda live: cosi' regge anche gli esercizi ad-hoc aggiunti durante
    l'allenamento e l'ordine reale di registrazione, non solo quello statico
    della scheda.
    """
    timer_default = Impostazione.get_int("timer_default_sec", 90)
    gia_fatte = {}
    for serie in sessione.serie:
        gia_fatte.setdefault(serie.esercizio_sessione_id, []).append(serie)
    saltati = {
        s.esercizio_scheda_id for s in sessione.esercizi_saltati if s.esercizio_scheda_id
    }

    blocchi = []
    for voce in sessione.esercizi:
        esercizio = voce.esercizio
        record = record_corrente(esercizio.id, tipo_pr(esercizio))
        blocchi.append(
            {
                "voce": serialize_esercizio_sessione(voce),
                "serie": [
                    serialize_serie(s)
                    for s in sorted(
                        gia_fatte.get(voce.id, []), key=lambda s: s.numero_serie
                    )
                ],
                "timer_secondi": voce.timer_recupero_secondi or timer_default,
                "record": record.etichetta if record else None,
                "saltato": voce.esercizio_scheda_id in saltati,
            }
        )
    return blocchi


@bp.post("/sessioni")
def avvia_route():
    in_corso = sessione_in_corso()
    if in_corso is not None:
        raise ApiError(
            "SESSIONE_IN_CORSO",
            "Hai già una sessione in corso.",
            409,
            fields={"sessione_id": in_corso.id},
        )

    corpo = request.get_json(force=True, silent=True) or {}
    scheda_id = corpo.get("scheda_id")
    scheda = db.session.get(Scheda, scheda_id) if scheda_id else None

    sessione = Sessione(
        data=date.today(),
        iniziata_alle=datetime.now(),
        scheda_id=scheda.id if scheda else None,
        completata=False,
    )
    db.session.add(sessione)
    db.session.flush()

    # Snapshot degli esercizi della scheda al momento dell'avvio: la sessione
    # ne tiene una copia propria (EsercizioSessione), cosi' aggiungere/togliere
    # esercizi durante l'allenamento non tocca la scheda template, e
    # modificarla dopo non altera retroattivamente questa sessione.
    if scheda:
        for voce in scheda.esercizi:
            db.session.add(
                EsercizioSessione(
                    sessione_id=sessione.id,
                    esercizio_libreria_id=voce.esercizio_libreria_id,
                    esercizio_scheda_id=voce.id,
                    ordine=voce.ordine,
                    serie_target=voce.serie_target,
                    rep_target=voce.rep_target,
                    durata_target_sec=voce.durata_target_sec,
                    peso_suggerito_kg=voce.peso_suggerito_kg,
                    note=voce.note,
                    timer_recupero_secondi=voce.timer_recupero_secondi,
                )
            )
    db.session.commit()
    return api_ok(serialize_sessione(sessione), status=201)


@bp.get("/sessioni/<int:sessione_id>")
def dettaglio_sessione_route(sessione_id):
    sessione = _sessione_o_404(sessione_id)
    return api_ok(
        {
            "sessione": serialize_sessione(sessione, con_dettaglio=True),
            "blocchi": _blocchi_attivi(sessione),
        }
    )


@bp.post("/sessioni/<int:sessione_id>/serie")
def registra_serie_route(sessione_id):
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None or sessione.completata:
        raise ApiError("SESSIONE_NON_ATTIVA", "Sessione non attiva.", 404)

    dati = request.get_json(force=True, silent=True) or {}
    voce_id = dati.get("esercizio_sessione_id")
    voce = db.session.get(EsercizioSessione, voce_id) if voce_id else None
    if voce is None or voce.sessione_id != sessione.id:
        raise ApiError("VALIDATION_ERROR", "Esercizio non valido.", 422)

    def numero(chiave, cast):
        valore = dati.get(chiave)
        if valore in (None, ""):
            return None
        try:
            return cast(valore)
        except (TypeError, ValueError):
            return None

    ripetizioni = numero("ripetizioni", int)
    durata = numero("durata_secondi", int)
    peso = numero("peso_kg", float)

    if ripetizioni is None and durata is None:
        raise ApiError(
            "VALIDATION_ERROR",
            "Inserisci le ripetizioni (o i secondi) della serie.",
            422,
        )

    gia_fatte = sum(1 for s in sessione.serie if s.esercizio_sessione_id == voce.id)

    serie = SerieEseguita(
        sessione_id=sessione.id,
        esercizio_sessione_id=voce.id,
        esercizio_scheda_id=voce.esercizio_scheda_id,
        esercizio_libreria_id=voce.esercizio_libreria_id,
        numero_serie=gia_fatte + 1,
        peso_kg=peso,
        ripetizioni=ripetizioni,
        durata_secondi=durata,
        note=(dati.get("note") or "").strip(),
    )
    db.session.add(serie)

    # Se l'esercizio era stato segnato "saltato", registrare una serie vuol
    # dire che l'utente ha cambiato idea: il salto va annullato, altrimenti
    # resterebbe segnato come non svolto pur avendo delle serie.
    if voce.esercizio_scheda_id is not None:
        db.session.query(EsercizioSaltato).filter_by(
            sessione_id=sessione.id, esercizio_scheda_id=voce.esercizio_scheda_id
        ).delete(synchronize_session=False)

    # Il PR va valutato con la serie gia' collegata alla sessione, perche' usa
    # la data della sessione: flush prima del controllo.
    db.session.flush()

    e_pr = controlla_pr(serie)
    db.session.commit()

    record = record_corrente(voce.esercizio_libreria_id, tipo_pr(voce.esercizio))

    return api_ok(
        {
            "serie": serialize_serie(serie),
            "nuovo_pr": e_pr,
            "record": record.etichetta if record else None,
            "timer_secondi": voce.timer_recupero_secondi
            or Impostazione.get_int("timer_default_sec", 90),
        },
        status=201,
    )


@bp.delete("/serie/<int:serie_id>")
def elimina_serie_route(serie_id):
    serie = db.session.get(SerieEseguita, serie_id)
    if serie is None:
        raise ApiError("NOT_FOUND", "Serie non trovata.", 404)

    sessione_id = serie.sessione_id
    voce_id = serie.esercizio_sessione_id
    esercizio_id = serie.esercizio_libreria_id
    # Va letto prima della delete: dopo, l'oggetto e' detached e la relationship
    # non e' piu' raggiungibile.
    tipo = tipo_pr(serie.esercizio)

    db.session.delete(serie)
    db.session.flush()

    rimanenti = (
        db.session.query(SerieEseguita)
        .filter_by(sessione_id=sessione_id, esercizio_sessione_id=voce_id)
        .order_by(SerieEseguita.id.asc())
        .all()
    )
    for indice, rimasta in enumerate(rimanenti, start=1):
        rimasta.numero_serie = indice

    ricalcola_pr({esercizio_id})
    db.session.commit()

    record = record_corrente(esercizio_id, tipo)
    return api_ok({"record": record.etichetta if record else None})


@bp.post("/sessioni/<int:sessione_id>/esercizi")
def aggiungi_esercizio_sessione_route(sessione_id):
    """Aggiunge un esercizio ad-hoc alla sessione attiva, senza toccare la scheda."""
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None or sessione.completata:
        raise ApiError("SESSIONE_NON_ATTIVA", "Sessione non attiva.", 404)

    corpo = request.get_json(force=True, silent=True) or {}
    esercizio_id = corpo.get("esercizio_libreria_id")
    esercizio = db.session.get(EsercizioLibreria, esercizio_id) if esercizio_id else None
    if esercizio is None:
        raise ApiError("VALIDATION_ERROR", "esercizio_libreria_id è obbligatorio.", 422)

    ordine_max = max((v.ordine for v in sessione.esercizi), default=-1)
    voce = EsercizioSessione(
        sessione_id=sessione.id,
        esercizio_libreria_id=esercizio.id,
        esercizio_scheda_id=None,
        ordine=ordine_max + 1,
        serie_target=corpo.get("serie_target") or 4,
        rep_target=corpo.get("rep_target"),
        durata_target_sec=corpo.get("durata_target_sec"),
        peso_suggerito_kg=corpo.get("peso_suggerito_kg"),
        note=corpo.get("note", ""),
        timer_recupero_secondi=corpo.get("timer_recupero_secondi"),
    )
    db.session.add(voce)
    db.session.commit()
    return api_ok(serialize_esercizio_sessione(voce), status=201)


@bp.put("/sessioni/<int:sessione_id>/esercizi/ordine")
def riordina_esercizi_sessione_route(sessione_id):
    """Riordino bulk (drag&drop): body {"ordine": [esercizio_sessione_id, ...]}."""
    sessione = _sessione_o_404(sessione_id)
    corpo = request.get_json(force=True, silent=True) or {}
    ordine_richiesto = corpo.get("ordine")
    if not isinstance(ordine_richiesto, list):
        raise ApiError("VALIDATION_ERROR", "ordine deve essere un elenco di id.", 422)

    voci_per_id = {v.id: v for v in sessione.esercizi}
    if set(ordine_richiesto) != set(voci_per_id):
        raise ApiError(
            "VALIDATION_ERROR",
            "ordine deve contenere esattamente gli id degli esercizi della sessione.",
            422,
        )

    for indice, voce_id in enumerate(ordine_richiesto):
        voci_per_id[voce_id].ordine = indice
    db.session.commit()
    return api_ok(_blocchi_attivi(sessione))


@bp.delete("/esercizi-sessione/<int:voce_id>")
def rimuovi_esercizio_sessione_route(voce_id):
    """Cancella un esercizio ad-hoc dalla sessione attiva.

    Un esercizio pianificato dalla scheda (esercizio_scheda_id valorizzato)
    non si cancella mai da qui: si salta con l'endpoint /salta, cosi' la
    sessione ne tiene comunque traccia per l'aderenza alla scheda.
    """
    voce = _voce_sessione_o_404(voce_id)
    if voce.esercizio_scheda_id is not None:
        raise ApiError(
            "ESERCIZIO_PIANIFICATO",
            "Questo esercizio è previsto dalla scheda: puoi solo saltarlo, non cancellarlo.",
            422,
        )
    if _serie_registrate(voce.id) > 0:
        raise ApiError(
            "SERIE_PRESENTI",
            "Cancella prima le serie registrate per questo esercizio.",
            422,
        )
    db.session.delete(voce)
    db.session.commit()
    return "", 204


@bp.post("/esercizi-sessione/<int:voce_id>/salta")
def salta_esercizio_sessione_route(voce_id):
    """Segna come saltato un esercizio pianificato dalla scheda."""
    voce = _voce_sessione_o_404(voce_id)
    if voce.esercizio_scheda_id is None:
        raise ApiError(
            "ESERCIZIO_AD_HOC",
            "Questo esercizio non è previsto dalla scheda: puoi cancellarlo, non saltarlo.",
            422,
        )
    if _serie_registrate(voce.id) > 0:
        raise ApiError(
            "SERIE_PRESENTI",
            "Non puoi saltare un esercizio per cui hai già registrato delle serie.",
            422,
        )

    esistente = (
        db.session.query(EsercizioSaltato)
        .filter_by(sessione_id=voce.sessione_id, esercizio_scheda_id=voce.esercizio_scheda_id)
        .first()
    )
    if esistente is None:
        db.session.add(
            EsercizioSaltato(
                sessione_id=voce.sessione_id,
                esercizio_scheda_id=voce.esercizio_scheda_id,
                esercizio_libreria_id=voce.esercizio_libreria_id,
                motivo=(request.get_json(force=True, silent=True) or {}).get("motivo", ""),
            )
        )
        db.session.commit()
    return api_ok(_blocchi_attivi(voce.sessione))


@bp.delete("/esercizi-sessione/<int:voce_id>/salta")
def annulla_salta_esercizio_sessione_route(voce_id):
    """Annulla il salto di un esercizio pianificato, senza dover riavviare."""
    voce = _voce_sessione_o_404(voce_id)
    db.session.query(EsercizioSaltato).filter_by(
        sessione_id=voce.sessione_id, esercizio_scheda_id=voce.esercizio_scheda_id
    ).delete(synchronize_session=False)
    db.session.commit()
    return api_ok(_blocchi_attivi(voce.sessione))


@bp.post("/sessioni/<int:sessione_id>/termina")
def termina_route(sessione_id):
    sessione = _sessione_o_404(sessione_id)
    corpo = request.get_json(force=True, silent=True) or {}

    durata = corpo.get("durata_minuti")
    if durata is None:
        trascorsi = (datetime.now() - sessione.iniziata_alle).total_seconds() / 60
        durata = max(1, round(trascorsi))
    sessione.durata_minuti = durata

    for campo in ("energia", "sonno", "umore"):
        if campo in corpo:
            setattr(sessione, campo, corpo.get(campo))
    sessione.note_generali = corpo.get("note_generali", "").strip()
    sessione.completata = True

    nota = corpo.get("nota_dolore") or {}
    zona = (nota.get("zona_corporea") or "").strip()
    if zona:
        db.session.add(
            NotaDolore(
                data=sessione.data,
                sessione_id=sessione.id,
                zona_corporea=zona,
                descrizione=(nota.get("descrizione") or "").strip(),
                gravita=nota.get("gravita") or 1,
            )
        )

    db.session.commit()
    return api_ok(serialize_sessione(sessione, con_dettaglio=True))


# --- Sessione manuale / modifica (payload strutturato) ---------------------
#
# Sostituisce il parsing posizionale del form (`serie-v{id}-{indice}-reps`,
# vedi la versione Jinja di questo blueprint prima della migrazione): qui le
# righe serie arrivano già come array JSON dentro ogni blocco, validate da
# `SessioneManualeSchema` invece che lette a mano dai nomi dei campi.


def _scheda_o_404(scheda_id):
    scheda = db.session.get(Scheda, scheda_id)
    if scheda is None:
        raise ApiError("NOT_FOUND", "Scheda non trovata.", 404)
    return scheda


def _crea_serie_e_saltati(sessione, blocchi):
    """Crea SerieEseguita/EsercizioSaltato dai blocchi già validati."""
    serie_create = []
    saltati = []
    for blocco in blocchi:
        esercizio_id = blocco["esercizio_libreria_id"]
        voce_id = blocco.get("esercizio_scheda_id")

        if blocco.get("saltato"):
            saltato = EsercizioSaltato(
                sessione_id=sessione.id,
                esercizio_scheda_id=voce_id,
                esercizio_libreria_id=esercizio_id,
                motivo=blocco.get("motivo_saltato", ""),
            )
            db.session.add(saltato)
            saltati.append(saltato)
            continue

        numero_serie = 0
        for riga in blocco.get("serie", []):
            if riga.get("ripetizioni") is None and riga.get("durata_secondi") is None:
                # Riga lasciata vuota = serie non svolta: si salta senza rumore.
                continue
            numero_serie += 1
            serie = SerieEseguita(
                sessione_id=sessione.id,
                esercizio_scheda_id=voce_id,
                esercizio_libreria_id=esercizio_id,
                numero_serie=numero_serie,
                peso_kg=riga.get("peso_kg"),
                ripetizioni=riga.get("ripetizioni"),
                durata_secondi=riga.get("durata_secondi"),
                note=riga.get("note", ""),
            )
            db.session.add(serie)
            serie_create.append(serie)

    return serie_create, saltati


@bp.get("/schede/<int:scheda_id>/blocchi-precompilati")
def blocchi_precompilati_route(scheda_id):
    """I target della scheda, per precompilare un nuovo inserimento manuale."""
    scheda = _scheda_o_404(scheda_id)
    return api_ok(
        [
            {
                "esercizio_scheda_id": voce.id,
                "esercizio": serialize_esercizio_libreria(voce.esercizio),
                "serie_target": voce.serie_target,
                "rep_target": voce.rep_target,
                "durata_target_sec": voce.durata_target_sec,
                "peso_suggerito_kg": voce.peso_suggerito_kg,
            }
            for voce in scheda.esercizi
        ]
    )


@bp.get("/sessioni/<int:sessione_id>/blocchi")
def blocchi_sessione_route(sessione_id):
    """Quello che è stato effettivamente registrato, per precompilare la modifica."""
    sessione = _sessione_o_404(sessione_id)

    voci = {v.id: v for v in (sessione.scheda.esercizi if sessione.scheda else [])}
    saltati = {s.esercizio_scheda_id: s for s in sessione.esercizi_saltati}

    per_voce, fuori_scheda = {}, {}
    for serie in sorted(sessione.serie, key=lambda s: (s.numero_serie, s.id)):
        if serie.esercizio_scheda_id in voci:
            per_voce.setdefault(serie.esercizio_scheda_id, []).append(serie)
        else:
            fuori_scheda.setdefault(serie.esercizio_libreria_id, []).append(serie)

    def _righe(serie_lista):
        return [
            {
                "peso_kg": s.peso_kg,
                "ripetizioni": s.ripetizioni,
                "durata_secondi": s.durata_secondi,
                "note": s.note,
            }
            for s in serie_lista
        ]

    blocchi = []
    for voce in voci.values():
        saltato = saltati.get(voce.id)
        blocchi.append(
            {
                "esercizio_scheda_id": voce.id,
                "esercizio_libreria_id": voce.esercizio_libreria_id,
                "esercizio": serialize_esercizio_libreria(voce.esercizio),
                "in_scheda": True,
                "saltato": saltato is not None,
                "motivo_saltato": saltato.motivo if saltato else "",
                "serie": _righe(per_voce.get(voce.id, [])),
            }
        )

    # Esercizi registrati ma non più presenti nella scheda (es. dopo averla
    # modificata): senza questi blocchi la modifica li cancellerebbe in silenzio.
    saltati_fuori = {
        s.esercizio_libreria_id: s
        for s in sessione.esercizi_saltati
        if s.esercizio_scheda_id not in voci
    }
    for esercizio_id in dict.fromkeys(list(fuori_scheda) + list(saltati_fuori)):
        registrate = fuori_scheda.get(esercizio_id, [])
        esercizio = (
            registrate[0].esercizio
            if registrate
            else saltati_fuori[esercizio_id].esercizio
        )
        saltato = saltati_fuori.get(esercizio_id)
        blocchi.append(
            {
                "esercizio_scheda_id": None,
                "esercizio_libreria_id": esercizio_id,
                "esercizio": serialize_esercizio_libreria(esercizio),
                "in_scheda": False,
                "saltato": saltato is not None,
                "motivo_saltato": saltato.motivo if saltato else "",
                "serie": _righe(registrate),
            }
        )

    return api_ok(blocchi)


@bp.post("/sessioni/manuale")
def salva_manuale_route():
    corpo = request.get_json(force=True, silent=True) or {}
    dati = SessioneManualeSchema().load(corpo)

    if dati["data"] > date.today():
        raise ApiError(
            "VALIDATION_ERROR",
            "Non puoi registrare un allenamento in una data futura.",
            422,
        )
    if not dati["scheda_id"]:
        raise ApiError("VALIDATION_ERROR", "Seleziona una scheda.", 422)
    scheda = _scheda_o_404(dati["scheda_id"])

    sessione = Sessione(
        data=dati["data"],
        iniziata_alle=datetime.combine(dati["data"], datetime.min.time()),
        scheda_id=scheda.id,
        durata_minuti=dati["durata_minuti"],
        energia=dati["energia"],
        sonno=dati["sonno"],
        umore=dati["umore"],
        note_generali=dati["note_generali"],
        completata=True,
    )
    db.session.add(sessione)
    db.session.flush()

    serie_create, saltati = _crea_serie_e_saltati(sessione, dati["blocchi"])
    if not serie_create:
        db.session.rollback()
        raise ApiError(
            "NESSUNA_SERIE",
            "Non hai compilato nessuna serie: l'allenamento non è stato salvato.",
            422,
        )

    db.session.flush()
    pr_trovati = sum(1 for serie in serie_create if controlla_pr(serie))
    db.session.commit()

    return api_ok(
        {
            "sessione": serialize_sessione(sessione, con_dettaglio=True),
            "n_serie": len(serie_create),
            "n_saltati": len(saltati),
            "n_pr": pr_trovati,
        },
        status=201,
    )


@bp.put("/sessioni/<int:sessione_id>")
def salva_modifica_route(sessione_id):
    sessione = _sessione_o_404(sessione_id)
    corpo = request.get_json(force=True, silent=True) or {}
    dati = SessioneManualeSchema().load(corpo)

    if dati["data"] > date.today():
        raise ApiError(
            "VALIDATION_ERROR",
            "Non puoi spostare un allenamento in una data futura.",
            422,
        )

    esercizi_toccati = {b["esercizio_libreria_id"] for b in dati["blocchi"]}
    esercizi_toccati |= {s.esercizio_libreria_id for s in sessione.serie}

    for serie in list(sessione.serie):
        db.session.delete(serie)
    for saltato in list(sessione.esercizi_saltati):
        db.session.delete(saltato)
    db.session.flush()

    serie_create, saltati = _crea_serie_e_saltati(sessione, dati["blocchi"])
    if not serie_create:
        db.session.rollback()
        raise ApiError(
            "NESSUNA_SERIE",
            "Non hai compilato nessuna serie: la modifica non è stata salvata. "
            "Per togliere del tutto l'allenamento usa l'eliminazione.",
            422,
        )

    if dati["scheda_id"] is not None:
        sessione.scheda_id = dati["scheda_id"]
    sessione.data = dati["data"]
    sessione.iniziata_alle = datetime.combine(
        dati["data"], sessione.iniziata_alle.time()
    )
    sessione.durata_minuti = dati["durata_minuti"]
    sessione.energia = dati["energia"]
    sessione.sonno = dati["sonno"]
    sessione.umore = dati["umore"]
    sessione.note_generali = dati["note_generali"]
    # Le note di dolore seguono la sessione, altrimenti resterebbero nel
    # diario del giorno vecchio.
    for nota in sessione.note_dolore:
        nota.data = dati["data"]

    db.session.flush()
    esercizi_toccati |= {s.esercizio_libreria_id for s in serie_create}
    ricalcola_pr(esercizi_toccati)
    db.session.commit()

    return api_ok(
        {
            "sessione": serialize_sessione(sessione, con_dettaglio=True),
            "n_serie": len(serie_create),
            "n_saltati": len(saltati),
        }
    )
