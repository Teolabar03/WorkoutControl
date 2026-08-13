"""Calendario allenamenti: vista mensile e dettaglio del singolo giorno.

Il modulo si chiama `calendario` e non `calendar` per non confondersi con il
modulo omonimo della standard library, che qui viene usato.
"""

import calendar as stdlib_calendar
from datetime import date

from flask import Blueprint, flash, redirect, render_template, request, url_for

from models import NotaDolore, Scheda, Sessione, db
from services.pr import ricalcola_pr

bp = Blueprint("calendario", __name__)


def _mese_valido(anno, mese):
    try:
        return date(anno, mese, 1)
    except ValueError:
        return date.today().replace(day=1)


@bp.route("/")
@bp.route("/calendario")
def vista_mensile():
    oggi = date.today()
    anno = request.args.get("anno", type=int) or oggi.year
    mese = request.args.get("mese", type=int) or oggi.month
    primo = _mese_valido(anno, mese)
    anno, mese = primo.year, primo.month

    ultimo_giorno = stdlib_calendar.monthrange(anno, mese)[1]
    ultimo = date(anno, mese, ultimo_giorno)

    sessioni = (
        db.session.query(Sessione)
        .filter(Sessione.data >= primo, Sessione.data <= ultimo)
        .order_by(Sessione.data.asc())
        .all()
    )
    per_giorno = {}
    for sessione in sessioni:
        per_giorno.setdefault(sessione.data, []).append(sessione)

    dolori = (
        db.session.query(NotaDolore)
        .filter(NotaDolore.data >= primo, NotaDolore.data <= ultimo)
        .all()
    )
    giorni_con_dolore = {d.data for d in dolori}

    settimane = stdlib_calendar.Calendar(firstweekday=0).monthdatescalendar(anno, mese)

    mese_precedente = primo.replace(day=1)
    mese_precedente = (
        mese_precedente.replace(year=anno - 1, month=12)
        if mese == 1
        else mese_precedente.replace(month=mese - 1)
    )
    mese_successivo = (
        primo.replace(year=anno + 1, month=1) if mese == 12 else primo.replace(month=mese + 1)
    )

    return render_template(
        "calendario.html",
        anno=anno,
        mese=mese,
        nome_mese=NOMI_MESI[mese - 1],
        settimane=settimane,
        per_giorno=per_giorno,
        giorni_con_dolore=giorni_con_dolore,
        oggi=oggi,
        mese_precedente=mese_precedente,
        mese_successivo=mese_successivo,
        totale_mese=len(sessioni),
        schede=db.session.query(Scheda).filter_by(attiva=True).order_by(Scheda.nome).all(),
    )


@bp.route("/giorno/<giorno>")
def dettaglio_giorno(giorno):
    try:
        giorno_data = date.fromisoformat(giorno)
    except ValueError:
        flash("Data non valida.", "error")
        return redirect(url_for("calendario.vista_mensile"))

    sessioni = (
        db.session.query(Sessione)
        .filter_by(data=giorno_data)
        .order_by(Sessione.id.asc())
        .all()
    )
    dolori = db.session.query(NotaDolore).filter_by(data=giorno_data).all()

    # Le serie di ogni sessione raggruppate per esercizio, in ordine di scheda.
    dettagli = []
    for sessione in sessioni:
        gruppi = {}
        for serie in sessione.serie:
            gruppi.setdefault(serie.esercizio.nome, []).append(serie)
        dettagli.append((sessione, gruppi))

    return render_template(
        "giorno.html",
        giorno=giorno_data,
        dettagli=dettagli,
        dolori=dolori,
        schede=db.session.query(Scheda).filter_by(attiva=True).order_by(Scheda.nome).all(),
        e_futuro=giorno_data > date.today(),
    )


@bp.route("/sessione/<int:sessione_id>/modifica-rapida", methods=["POST"])
def modifica_sessione(sessione_id):
    """Aggiorna i dati generali di una sessione gia' salvata.

    Solo durata, rating e note: per correggere le serie c'e' la pagina di
    modifica completa in `sessione.modifica`, che di questo URL non deve
    prendere il posto.
    """
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None:
        flash("Sessione non trovata.", "error")
        return redirect(url_for("calendario.vista_mensile"))

    durata = request.form.get("durata_minuti", type=int)
    sessione.durata_minuti = durata
    sessione.note_generali = request.form.get("note_generali", "").strip()
    for campo in ("energia", "sonno", "umore"):
        setattr(sessione, campo, request.form.get(campo, type=int))

    scheda_id = request.form.get("scheda_id", type=int)
    sessione.scheda_id = scheda_id or None

    db.session.commit()
    flash("Sessione aggiornata.", "success")
    return redirect(url_for("calendario.dettaglio_giorno", giorno=sessione.data.isoformat()))


@bp.route("/sessione/<int:sessione_id>/elimina", methods=["POST"])
def elimina_sessione(sessione_id):
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None:
        flash("Sessione non trovata.", "error")
        return redirect(url_for("calendario.vista_mensile"))
    giorno = sessione.data.isoformat()
    # I record fatti in questa sessione vanno ricalcolati: senza, resterebbero
    # nello storico PR puntando a un allenamento che non c'e' piu'.
    esercizi_toccati = {serie.esercizio_libreria_id for serie in sessione.serie}
    db.session.delete(sessione)
    db.session.flush()
    ricalcola_pr(esercizi_toccati)
    db.session.commit()
    flash("Sessione eliminata.", "success")
    return redirect(url_for("calendario.dettaglio_giorno", giorno=giorno))


NOMI_MESI = [
    "Gennaio",
    "Febbraio",
    "Marzo",
    "Aprile",
    "Maggio",
    "Giugno",
    "Luglio",
    "Agosto",
    "Settembre",
    "Ottobre",
    "Novembre",
    "Dicembre",
]
