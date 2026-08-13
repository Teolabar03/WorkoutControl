"""CRUD schede di allenamento e libreria esercizi."""

from datetime import date

from flask import Blueprint, flash, redirect, render_template, request, url_for

from models import (
    LOAD_BAND,
    LOAD_BODYWEIGHT,
    LOAD_WEIGHT,
    MEASURE_REPS,
    MEASURE_TIME,
    EsercizioLibreria,
    EsercizioScheda,
    Impostazione,
    Scheda,
    db,
)

bp = Blueprint("schede", __name__, url_prefix="/schede")


def _libreria():
    return (
        db.session.query(EsercizioLibreria)
        .filter_by(archiviato=False)
        .order_by(EsercizioLibreria.gruppo_muscolare, EsercizioLibreria.nome)
        .all()
    )


@bp.route("/")
def elenco():
    schede = (
        db.session.query(Scheda)
        .order_by(Scheda.attiva.desc(), Scheda.nome)
        .all()
    )
    return render_template("schede.html", schede=schede)


@bp.route("/nuova", methods=["GET", "POST"])
def nuova():
    if request.method == "POST":
        nome = request.form.get("nome", "").strip()
        if not nome:
            flash("Il nome della scheda e' obbligatorio.", "error")
            return redirect(url_for("schede.nuova"))
        scheda = Scheda(
            nome=nome,
            descrizione=request.form.get("descrizione", "").strip(),
            obiettivo=request.form.get("obiettivo", "").strip(),
            data_creazione=date.today(),
        )
        db.session.add(scheda)
        db.session.commit()
        flash("Scheda creata. Ora aggiungi gli esercizi.", "success")
        return redirect(url_for("schede.dettaglio", scheda_id=scheda.id))
    return render_template("scheda_form.html", scheda=None)


@bp.route("/<int:scheda_id>")
def dettaglio(scheda_id):
    scheda = db.session.get(Scheda, scheda_id)
    if scheda is None:
        flash("Scheda non trovata.", "error")
        return redirect(url_for("schede.elenco"))
    return render_template(
        "scheda_dettaglio.html",
        scheda=scheda,
        libreria=_libreria(),
        timer_default=Impostazione.get_int("timer_default_sec", 60),
    )


@bp.route("/<int:scheda_id>/modifica", methods=["GET", "POST"])
def modifica(scheda_id):
    scheda = db.session.get(Scheda, scheda_id)
    if scheda is None:
        flash("Scheda non trovata.", "error")
        return redirect(url_for("schede.elenco"))

    if request.method == "POST":
        nome = request.form.get("nome", "").strip()
        if not nome:
            flash("Il nome della scheda e' obbligatorio.", "error")
            return redirect(url_for("schede.modifica", scheda_id=scheda.id))
        scheda.nome = nome
        scheda.descrizione = request.form.get("descrizione", "").strip()
        scheda.obiettivo = request.form.get("obiettivo", "").strip()
        scheda.attiva = request.form.get("attiva") == "on"
        db.session.commit()
        flash("Scheda aggiornata.", "success")
        return redirect(url_for("schede.dettaglio", scheda_id=scheda.id))

    return render_template("scheda_form.html", scheda=scheda)


@bp.route("/<int:scheda_id>/duplica", methods=["POST"])
def duplica(scheda_id):
    """Crea una variante indipendente della scheda, utile per le progressioni."""
    originale = db.session.get(Scheda, scheda_id)
    if originale is None:
        flash("Scheda non trovata.", "error")
        return redirect(url_for("schede.elenco"))

    copia = Scheda(
        nome=f"{originale.nome} (copia)",
        descrizione=originale.descrizione,
        obiettivo=originale.obiettivo,
        data_creazione=date.today(),
    )
    db.session.add(copia)
    db.session.flush()

    for voce in originale.esercizi:
        db.session.add(
            EsercizioScheda(
                scheda_id=copia.id,
                esercizio_libreria_id=voce.esercizio_libreria_id,
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
    flash("Scheda duplicata.", "success")
    return redirect(url_for("schede.dettaglio", scheda_id=copia.id))


@bp.route("/<int:scheda_id>/elimina", methods=["POST"])
def elimina(scheda_id):
    scheda = db.session.get(Scheda, scheda_id)
    if scheda is None:
        flash("Scheda non trovata.", "error")
        return redirect(url_for("schede.elenco"))
    if scheda.sessioni:
        # Le sessioni gia' registrate puntano a questa scheda: archiviarla
        # conserva lo storico invece di romperne i riferimenti.
        scheda.attiva = False
        db.session.commit()
        flash(
            "La scheda ha allenamenti collegati: e' stata archiviata invece che "
            "eliminata, cosi' lo storico resta intatto.",
            "success",
        )
        return redirect(url_for("schede.elenco"))
    db.session.delete(scheda)
    db.session.commit()
    flash("Scheda eliminata.", "success")
    return redirect(url_for("schede.elenco"))


@bp.route("/<int:scheda_id>/esercizi", methods=["POST"])
def aggiungi_esercizio(scheda_id):
    scheda = db.session.get(Scheda, scheda_id)
    if scheda is None:
        flash("Scheda non trovata.", "error")
        return redirect(url_for("schede.elenco"))

    esercizio_id = request.form.get("esercizio_libreria_id", type=int)
    esercizio = db.session.get(EsercizioLibreria, esercizio_id) if esercizio_id else None
    if esercizio is None:
        flash("Seleziona un esercizio dalla libreria.", "error")
        return redirect(url_for("schede.dettaglio", scheda_id=scheda_id))

    ordine = max((e.ordine for e in scheda.esercizi), default=-1) + 1
    db.session.add(
        EsercizioScheda(
            scheda_id=scheda.id,
            esercizio_libreria_id=esercizio.id,
            ordine=ordine,
            serie_target=request.form.get("serie_target", type=int) or 4,
            rep_target=request.form.get("rep_target", type=int),
            durata_target_sec=request.form.get("durata_target_sec", type=int),
            peso_suggerito_kg=request.form.get("peso_suggerito_kg", type=float),
            note=request.form.get("note", "").strip(),
            timer_recupero_secondi=request.form.get("timer_recupero_secondi", type=int),
        )
    )
    db.session.commit()
    flash(f"{esercizio.nome} aggiunto alla scheda.", "success")
    return redirect(url_for("schede.dettaglio", scheda_id=scheda_id))


@bp.route("/esercizio-scheda/<int:voce_id>/modifica", methods=["POST"])
def modifica_esercizio(voce_id):
    voce = db.session.get(EsercizioScheda, voce_id)
    if voce is None:
        flash("Esercizio non trovato.", "error")
        return redirect(url_for("schede.elenco"))

    voce.serie_target = request.form.get("serie_target", type=int) or voce.serie_target
    voce.rep_target = request.form.get("rep_target", type=int)
    voce.durata_target_sec = request.form.get("durata_target_sec", type=int)
    voce.peso_suggerito_kg = request.form.get("peso_suggerito_kg", type=float)
    voce.note = request.form.get("note", "").strip()
    voce.timer_recupero_secondi = request.form.get("timer_recupero_secondi", type=int)
    db.session.commit()
    flash("Esercizio aggiornato.", "success")
    return redirect(url_for("schede.dettaglio", scheda_id=voce.scheda_id))


@bp.route("/esercizio-scheda/<int:voce_id>/elimina", methods=["POST"])
def rimuovi_esercizio(voce_id):
    voce = db.session.get(EsercizioScheda, voce_id)
    if voce is None:
        flash("Esercizio non trovato.", "error")
        return redirect(url_for("schede.elenco"))
    scheda_id = voce.scheda_id
    db.session.delete(voce)
    db.session.commit()
    flash("Esercizio rimosso dalla scheda.", "success")
    return redirect(url_for("schede.dettaglio", scheda_id=scheda_id))


@bp.route("/esercizio-scheda/<int:voce_id>/sposta", methods=["POST"])
def sposta_esercizio(voce_id):
    """Scambia l'ordine con l'esercizio adiacente."""
    voce = db.session.get(EsercizioScheda, voce_id)
    if voce is None:
        flash("Esercizio non trovato.", "error")
        return redirect(url_for("schede.elenco"))

    direzione = request.form.get("direzione", "giu")
    fratelli = voce.scheda.esercizi
    indice = fratelli.index(voce)
    nuovo_indice = indice - 1 if direzione == "su" else indice + 1

    if 0 <= nuovo_indice < len(fratelli):
        altro = fratelli[nuovo_indice]
        voce.ordine, altro.ordine = altro.ordine, voce.ordine
        db.session.commit()

    return redirect(url_for("schede.dettaglio", scheda_id=voce.scheda_id))


@bp.route("/libreria")
def libreria():
    esercizi = (
        db.session.query(EsercizioLibreria)
        .order_by(
            EsercizioLibreria.archiviato,
            EsercizioLibreria.gruppo_muscolare,
            EsercizioLibreria.nome,
        )
        .all()
    )
    attrezzature = sorted(
        {
            pezzo.strip()
            for e in esercizi
            for pezzo in e.attrezzatura.split(",")
            if pezzo.strip()
        }
    )
    return render_template(
        "libreria.html",
        esercizi=esercizi,
        attrezzature=attrezzature,
        tipi_carico=[LOAD_WEIGHT, LOAD_BAND, LOAD_BODYWEIGHT],
        tipi_misura=[MEASURE_REPS, MEASURE_TIME],
    )


@bp.route("/libreria/nuovo", methods=["POST"])
def nuovo_esercizio():
    nome = request.form.get("nome", "").strip()
    if not nome:
        flash("Il nome dell'esercizio e' obbligatorio.", "error")
        return redirect(url_for("schede.libreria"))
    if db.session.query(EsercizioLibreria).filter_by(nome=nome).first():
        flash(f"Esiste gia' un esercizio chiamato «{nome}».", "error")
        return redirect(url_for("schede.libreria"))

    tipo_carico = request.form.get("tipo_carico", LOAD_BODYWEIGHT)
    carichi = request.form.get("carichi_per_serie", type=int)
    if carichi is None:
        carichi = 2 if tipo_carico == LOAD_WEIGHT else 0

    db.session.add(
        EsercizioLibreria(
            nome=nome,
            attrezzatura=request.form.get("attrezzatura", "").strip(),
            gruppo_muscolare=request.form.get("gruppo_muscolare", "").strip(),
            tipo_carico=tipo_carico,
            tipo_misura=request.form.get("tipo_misura", MEASURE_REPS),
            carichi_per_serie=carichi,
            note_tecniche=request.form.get("note_tecniche", "").strip(),
            is_custom=True,
        )
    )
    db.session.commit()
    flash(f"«{nome}» aggiunto alla libreria.", "success")
    return redirect(url_for("schede.libreria"))


@bp.route("/libreria/<int:esercizio_id>/archivia", methods=["POST"])
def archivia_esercizio(esercizio_id):
    esercizio = db.session.get(EsercizioLibreria, esercizio_id)
    if esercizio is None:
        flash("Esercizio non trovato.", "error")
        return redirect(url_for("schede.libreria"))
    esercizio.archiviato = not esercizio.archiviato
    db.session.commit()
    stato = "archiviato" if esercizio.archiviato else "ripristinato"
    flash(f"«{esercizio.nome}» {stato}.", "success")
    return redirect(url_for("schede.libreria"))
