"""Tracking automatico dei record personali.

Ogni esercizio ha un tipo di record diverso a seconda di come si carica:
peso massimo per i manubri, ripetizioni massime per elastico e corpo libero,
secondi massimi per gli isometrici come il Plank.
"""

from models import (
    LOAD_WEIGHT,
    MEASURE_TIME,
    PR,
    PR_REPS,
    PR_TIME,
    PR_WEIGHT,
    SerieEseguita,
    Sessione,
    db,
)


def tipo_pr(esercizio):
    """Su quale grandezza si misura il record di questo esercizio."""
    if esercizio.tipo_misura == MEASURE_TIME:
        return PR_TIME
    if esercizio.tipo_carico == LOAD_WEIGHT:
        return PR_WEIGHT
    return PR_REPS


def _valore_serie(serie, tipo):
    if tipo == PR_WEIGHT:
        return serie.peso_kg
    if tipo == PR_TIME:
        return serie.durata_secondi
    return serie.ripetizioni


def record_corrente(esercizio_id, tipo):
    return (
        db.session.query(PR)
        .filter_by(esercizio_libreria_id=esercizio_id, tipo=tipo)
        .order_by(PR.valore.desc(), PR.data.desc())
        .first()
    )


def controlla_pr(serie):
    """Registra un PR se la serie batte il record, e restituisce se segnalarlo.

    Il valore di ritorno e' `False` alla primissima serie di un esercizio: il
    record viene salvato comunque (serve come baseline) ma non ha senso
    festeggiarlo, altrimenti ogni esercizio nuovo mostrerebbe un falso PR.
    """
    esercizio = serie.esercizio
    tipo = tipo_pr(esercizio)
    valore = _valore_serie(serie, tipo)
    if not valore:
        return False

    precedente = record_corrente(esercizio.id, tipo)

    if precedente is not None and valore <= precedente.valore:
        return False

    db.session.add(
        PR(
            esercizio_libreria_id=esercizio.id,
            tipo=tipo,
            valore=float(valore),
            ripetizioni=serie.ripetizioni,
            data=serie.sessione.data,
            sessione_id=serie.sessione_id,
        )
    )

    e_un_miglioramento = precedente is not None
    serie.is_pr = e_un_miglioramento
    return e_un_miglioramento


def ricalcola_pr(esercizi_ids):
    """Ricostruisce da zero lo storico PR degli esercizi indicati.

    Serve quando un allenamento gia' salvato viene modificato o cancellato: i
    record erano stati calcolati sui valori vecchi e resterebbero fermi su
    numeri che nel database non esistono piu'. Si rilegge tutto lo storico in
    ordine cronologico e si riapplica la stessa regola di `controlla_pr`.
    """
    ids = {identificativo for identificativo in esercizi_ids if identificativo}
    if not ids:
        return

    db.session.query(PR).filter(PR.esercizio_libreria_id.in_(ids)).delete(
        synchronize_session=False
    )

    serie_storiche = (
        db.session.query(SerieEseguita)
        .join(Sessione, SerieEseguita.sessione_id == Sessione.id)
        .filter(SerieEseguita.esercizio_libreria_id.in_(ids))
        .order_by(Sessione.data.asc(), SerieEseguita.id.asc())
        .all()
    )

    migliori = {}
    for serie in serie_storiche:
        tipo = tipo_pr(serie.esercizio)
        valore = _valore_serie(serie, tipo)
        precedente = migliori.get(serie.esercizio_libreria_id)

        if not valore or (precedente is not None and valore <= precedente):
            serie.is_pr = False
            continue

        db.session.add(
            PR(
                esercizio_libreria_id=serie.esercizio_libreria_id,
                tipo=tipo,
                valore=float(valore),
                ripetizioni=serie.ripetizioni,
                data=serie.sessione.data,
                sessione_id=serie.sessione_id,
            )
        )
        # Come in `controlla_pr`: il primo valore in assoluto e' solo la
        # baseline, non un miglioramento da festeggiare.
        serie.is_pr = precedente is not None
        migliori[serie.esercizio_libreria_id] = float(valore)


def storico_pr():
    """Tutti i PR dal piu' recente, per la vista statistiche."""
    return (
        db.session.query(PR)
        .order_by(PR.data.desc(), PR.id.desc())
        .all()
    )


def pr_attuali():
    """Il record migliore per ogni esercizio che ne ha almeno uno."""
    migliori = {}
    for pr in db.session.query(PR).order_by(PR.valore.asc(), PR.data.asc()).all():
        migliori[(pr.esercizio_libreria_id, pr.tipo)] = pr
    return sorted(migliori.values(), key=lambda p: p.esercizio.nome)
