"""Modalita' "sessione attiva": avvio, registrazione serie live, chiusura.

La pagina della sessione registra le serie via fetch JSON, cosi' l'utente non
perde lo stato della pagina (e il timer di recupero) a ogni serie.
"""

from datetime import date, datetime

from flask import (
    Blueprint,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)

from models import (
    EsercizioSaltato,
    EsercizioScheda,
    Impostazione,
    NotaDolore,
    Scheda,
    SerieEseguita,
    Sessione,
    db,
)
from services.pr import controlla_pr, record_corrente, ricalcola_pr, tipo_pr

bp = Blueprint("sessione", __name__, url_prefix="/sessione")


def sessione_in_corso():
    return (
        db.session.query(Sessione)
        .filter_by(completata=False)
        .order_by(Sessione.id.desc())
        .first()
    )


@bp.route("/avvia", methods=["POST"])
def avvia():
    in_corso = sessione_in_corso()
    if in_corso is not None:
        flash("Hai gia' una sessione in corso.", "error")
        return redirect(url_for("sessione.attiva", sessione_id=in_corso.id))

    scheda_id = request.form.get("scheda_id", type=int)
    scheda = db.session.get(Scheda, scheda_id) if scheda_id else None

    sessione = Sessione(
        data=date.today(),
        iniziata_alle=datetime.now(),
        scheda_id=scheda.id if scheda else None,
        completata=False,
    )
    db.session.add(sessione)
    db.session.commit()
    return redirect(url_for("sessione.attiva", sessione_id=sessione.id))


@bp.route("/<int:sessione_id>")
def attiva(sessione_id):
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None:
        flash("Sessione non trovata.", "error")
        return redirect(url_for("calendario.vista_mensile"))
    if sessione.completata:
        return redirect(
            url_for("calendario.dettaglio_giorno", giorno=sessione.data.isoformat())
        )

    timer_default = Impostazione.get_int("timer_default_sec", 90)

    # Un blocco per esercizio della scheda, con le serie gia' registrate e
    # il record attuale da battere.
    blocchi = []
    if sessione.scheda:
        gia_fatte = {}
        for serie in sessione.serie:
            gia_fatte.setdefault(serie.esercizio_scheda_id, []).append(serie)

        for voce in sessione.scheda.esercizi:
            esercizio = voce.esercizio
            tipo = tipo_pr(esercizio)
            record = record_corrente(esercizio.id, tipo)
            blocchi.append(
                {
                    "voce": voce,
                    "esercizio": esercizio,
                    "serie": sorted(
                        gia_fatte.get(voce.id, []), key=lambda s: s.numero_serie
                    ),
                    "timer": voce.timer_recupero_secondi or timer_default,
                    "record": record,
                }
            )

    return render_template(
        "sessione.html",
        sessione=sessione,
        blocchi=blocchi,
        timer_default=timer_default,
    )


@bp.route("/<int:sessione_id>/serie", methods=["POST"])
def registra_serie(sessione_id):
    """Salva una serie e dice al client se e' un nuovo PR. Risponde JSON."""
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None or sessione.completata:
        return jsonify({"ok": False, "errore": "Sessione non attiva."}), 404

    dati = request.get_json(silent=True) or {}
    voce_id = dati.get("esercizio_scheda_id")
    voce = db.session.get(EsercizioScheda, voce_id) if voce_id else None
    if voce is None:
        return jsonify({"ok": False, "errore": "Esercizio non valido."}), 400

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
        return (
            jsonify(
                {
                    "ok": False,
                    "errore": "Inserisci le ripetizioni (o i secondi) della serie.",
                }
            ),
            400,
        )

    gia_fatte = sum(1 for s in sessione.serie if s.esercizio_scheda_id == voce.id)

    serie = SerieEseguita(
        sessione_id=sessione.id,
        esercizio_scheda_id=voce.id,
        esercizio_libreria_id=voce.esercizio_libreria_id,
        numero_serie=gia_fatte + 1,
        peso_kg=peso,
        ripetizioni=ripetizioni,
        durata_secondi=durata,
        note=(dati.get("note") or "").strip(),
    )
    db.session.add(serie)
    # Il PR va valutato con la serie gia' collegata alla sessione, perche' usa
    # la data della sessione: flush prima del controllo.
    db.session.flush()

    e_pr = controlla_pr(serie)
    db.session.commit()

    tipo = tipo_pr(voce.esercizio)
    record = record_corrente(voce.esercizio_libreria_id, tipo)

    return jsonify(
        {
            "ok": True,
            "serie": {
                "id": serie.id,
                "numero": serie.numero_serie,
                "peso_kg": serie.peso_kg,
                "ripetizioni": serie.ripetizioni,
                "durata_secondi": serie.durata_secondi,
                "note": serie.note,
                "is_pr": serie.is_pr,
            },
            "nuovo_pr": e_pr,
            "record": record.etichetta if record else None,
            "timer": voce.timer_recupero_secondi
            or Impostazione.get_int("timer_default_sec", 90),
        }
    )


@bp.route("/serie/<int:serie_id>/elimina", methods=["POST"])
def elimina_serie(serie_id):
    """Cancella una serie inserita per sbaglio e rinumera le rimanenti."""
    serie = db.session.get(SerieEseguita, serie_id)
    if serie is None:
        return jsonify({"ok": False, "errore": "Serie non trovata."}), 404

    sessione_id = serie.sessione_id
    voce_id = serie.esercizio_scheda_id
    esercizio_id = serie.esercizio_libreria_id
    # Va letto prima della delete: dopo, l'oggetto e' detached e la relationship
    # non e' piu' raggiungibile.
    tipo = tipo_pr(serie.esercizio)

    db.session.delete(serie)
    db.session.flush()

    rimanenti = (
        db.session.query(SerieEseguita)
        .filter_by(sessione_id=sessione_id, esercizio_scheda_id=voce_id)
        .order_by(SerieEseguita.id.asc())
        .all()
    )
    for indice, rimasta in enumerate(rimanenti, start=1):
        rimasta.numero_serie = indice

    # La serie cancellata potrebbe essere stata un PR: senza ricalcolo, il
    # record resterebbe "fantasma" in statistiche anche se non esiste piu'.
    ricalcola_pr({esercizio_id})
    db.session.commit()

    record = record_corrente(esercizio_id, tipo)
    return jsonify({"ok": True, "record": record.etichetta if record else None})


@bp.route("/<int:sessione_id>/termina", methods=["POST"])
def termina(sessione_id):
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None:
        flash("Sessione non trovata.", "error")
        return redirect(url_for("calendario.vista_mensile"))

    durata = request.form.get("durata_minuti", type=int)
    if durata is None:
        trascorsi = (datetime.now() - sessione.iniziata_alle).total_seconds() / 60
        durata = max(1, round(trascorsi))
    sessione.durata_minuti = durata

    for campo in ("energia", "sonno", "umore"):
        setattr(sessione, campo, request.form.get(campo, type=int))
    sessione.note_generali = request.form.get("note_generali", "").strip()
    sessione.completata = True

    zona = request.form.get("zona_corporea", "").strip()
    if zona:
        db.session.add(
            NotaDolore(
                data=sessione.data,
                sessione_id=sessione.id,
                zona_corporea=zona,
                descrizione=request.form.get("descrizione_dolore", "").strip(),
                gravita=request.form.get("gravita", type=int) or 1,
            )
        )

    db.session.commit()
    flash("Allenamento salvato.", "success")
    return redirect(
        url_for("calendario.dettaglio_giorno", giorno=sessione.data.isoformat())
    )


def _indici_serie(chiave_blocco):
    """Indici delle righe inviate per un esercizio, in ordine.

    Le righe possono essere aggiunte o rimosse dal browser, quindi gli indici
    non sono per forza 1..N contigui: vanno letti da quello che arriva.
    """
    prefisso = f"serie-{chiave_blocco}-"
    indici = set()
    for chiave in request.form:
        if not chiave.startswith(prefisso):
            continue
        resto = chiave[len(prefisso) :]
        numero, _, _ = resto.partition("-")
        if numero.isdigit():
            indici.add(int(numero))
    return sorted(indici)


def _numero_form(nome, cast):
    """Legge un campo numerico del form, tollerando la virgola decimale."""
    valore = request.form.get(nome, "").strip()
    if not valore:
        return None
    try:
        return cast(valore.replace(",", "."))
    except (TypeError, ValueError):
        return None


def _blocco(chiave, esercizio, righe, voce=None, saltato=False, motivo=""):
    """Un esercizio del form, con le sue righe serie.

    `chiave` identifica il blocco nei nomi dei campi: `v<id>` per un esercizio
    della scheda, `e<id>` per uno che nella scheda non c'e' (piu'), caso che
    capita modificando un allenamento vecchio dopo aver cambiato la scheda.
    """
    return {
        "chiave": chiave,
        "voce": voce,
        "esercizio": esercizio,
        "righe": righe,
        "saltato": saltato,
        "motivo": motivo,
        "usa_peso": esercizio.usa_peso,
        "a_tempo": esercizio.a_tempo,
        "peso_default": voce.peso_suggerito_kg if voce else None,
        "valore_default": (
            (voce.durata_target_sec if esercizio.a_tempo else voce.rep_target)
            if voce
            else None
        ),
    }


def _riga(indice, peso=None, valore=None, nota=""):
    return {"indice": indice, "peso": peso, "valore": valore, "nota": nota}


def _righe_da_target(voce, esercizio, vuote=False):
    """Una riga per ogni serie prevista dalla scheda.

    Con `vuote` i campi restano bianchi: in modifica un esercizio senza serie
    registrate non deve ritrovarsi precompilato come se fosse stato svolto.
    """
    valore = voce.durata_target_sec if esercizio.a_tempo else voce.rep_target
    return [
        _riga(numero) if vuote else _riga(numero, voce.peso_suggerito_kg, valore)
        for numero in range(1, max(voce.serie_target or 1, 1) + 1)
    ]


def blocchi_da_scheda(scheda):
    """Blocchi precompilati con i target della scheda, per un nuovo inserimento."""
    return [
        _blocco(
            f"v{voce.id}",
            voce.esercizio,
            _righe_da_target(voce, voce.esercizio),
            voce=voce,
        )
        for voce in scheda.esercizi
    ]


def blocchi_da_sessione(sessione):
    """Blocchi precompilati con quello che e' stato registrato nella sessione.

    Ricostruito dal database e non dal form, cosi' il salvataggio della modifica
    lavora sempre sulla stessa mappa chiave -> esercizio usata per disegnare la
    pagina, senza fidarsi di quello che torna dal browser.
    """
    voci = {voce.id: voce for voce in (sessione.scheda.esercizi if sessione.scheda else [])}
    saltati = {s.esercizio_scheda_id: s for s in sessione.esercizi_saltati}

    per_voce = {}
    fuori_scheda = {}
    for serie in sorted(sessione.serie, key=lambda s: (s.numero_serie, s.id)):
        if serie.esercizio_scheda_id in voci:
            per_voce.setdefault(serie.esercizio_scheda_id, []).append(serie)
        else:
            fuori_scheda.setdefault(serie.esercizio_libreria_id, []).append(serie)

    blocchi = []
    for voce in voci.values():
        esercizio = voce.esercizio
        registrate = per_voce.get(voce.id, [])
        righe = [
            _riga(numero, serie.peso_kg, serie.durata_secondi if esercizio.a_tempo else serie.ripetizioni, serie.note)
            for numero, serie in enumerate(registrate, start=1)
        ] or _righe_da_target(voce, esercizio, vuote=True)
        saltato = saltati.get(voce.id)
        blocchi.append(
            _blocco(
                f"v{voce.id}",
                esercizio,
                righe,
                voce=voce,
                saltato=saltato is not None,
                motivo=saltato.motivo if saltato else "",
            )
        )

    # Esercizi registrati ma non piu' presenti nella scheda: senza questi blocchi
    # sparirebbero dal form e il salvataggio li cancellerebbe in silenzio.
    saltati_fuori = {
        s.esercizio_libreria_id: s
        for s in sessione.esercizi_saltati
        if s.esercizio_scheda_id not in voci
    }
    for esercizio_id in list(fuori_scheda) + [
        i for i in saltati_fuori if i not in fuori_scheda
    ]:
        registrate = fuori_scheda.get(esercizio_id, [])
        esercizio = (
            registrate[0].esercizio
            if registrate
            else saltati_fuori[esercizio_id].esercizio
        )
        righe = [
            _riga(numero, serie.peso_kg, serie.durata_secondi if esercizio.a_tempo else serie.ripetizioni, serie.note)
            for numero, serie in enumerate(registrate, start=1)
        ] or [_riga(1)]
        saltato = saltati_fuori.get(esercizio_id)
        blocchi.append(
            _blocco(
                f"e{esercizio_id}",
                esercizio,
                righe,
                saltato=saltato is not None,
                motivo=saltato.motivo if saltato else "",
            )
        )

    return blocchi


def _leggi_blocchi(sessione, blocchi):
    """Crea serie ed esercizi saltati leggendo i campi del form.

    Restituisce le serie create e quelle saltate, gia' aggiunte alla sessione
    del database ma non ancora committate.
    """
    serie_create = []
    saltati = []

    for blocco in blocchi:
        chiave = blocco["chiave"]
        voce = blocco["voce"]
        esercizio_id = blocco["esercizio"].id

        if request.form.get(f"saltato-{chiave}") == "1":
            saltato = EsercizioSaltato(
                sessione_id=sessione.id,
                esercizio_scheda_id=voce.id if voce else None,
                esercizio_libreria_id=esercizio_id,
                motivo=request.form.get(f"motivo-saltato-{chiave}", "").strip(),
            )
            db.session.add(saltato)
            saltati.append(saltato)
            continue

        numero_serie = 0
        for indice in _indici_serie(chiave):
            prefisso = f"serie-{chiave}-{indice}"
            ripetizioni = _numero_form(f"{prefisso}-reps", int)
            durata = _numero_form(f"{prefisso}-durata", int)
            # Riga lasciata vuota = serie non svolta: si salta senza rumore.
            if ripetizioni is None and durata is None:
                continue
            numero_serie += 1
            serie = SerieEseguita(
                sessione_id=sessione.id,
                esercizio_scheda_id=voce.id if voce else None,
                esercizio_libreria_id=esercizio_id,
                numero_serie=numero_serie,
                peso_kg=_numero_form(f"{prefisso}-peso", float),
                ripetizioni=ripetizioni,
                durata_secondi=durata,
                note=request.form.get(f"{prefisso}-nota", "").strip(),
            )
            db.session.add(serie)
            serie_create.append(serie)

    return serie_create, saltati


def _dati_sessione(sessione):
    """Applica alla sessione i campi generali del form (durata, rating, note)."""
    sessione.durata_minuti = request.form.get("durata_minuti", type=int)
    sessione.note_generali = request.form.get("note_generali", "").strip()
    for campo in ("energia", "sonno", "umore"):
        setattr(sessione, campo, request.form.get(campo, type=int))


def _giorno_form(default):
    """Data inviata dal form, o `default` se manca/non e' valida."""
    valore = request.form.get("data")
    if not valore:
        return default
    try:
        return date.fromisoformat(valore)
    except ValueError:
        return None


@bp.route("/manuale", methods=["GET"])
def manuale():
    """Form per registrare a posteriori un allenamento gia' svolto."""
    schede = (
        db.session.query(Scheda).filter_by(attiva=True).order_by(Scheda.nome).all()
    )

    giorno_str = request.args.get("data") or date.today().isoformat()
    try:
        giorno = date.fromisoformat(giorno_str)
    except ValueError:
        giorno = date.today()

    scheda_id = request.args.get("scheda_id", type=int)
    scheda = db.session.get(Scheda, scheda_id) if scheda_id else None

    # Una riga per ogni serie prevista, precompilata con i target della scheda:
    # cosi' un allenamento svolto come da programma si salva senza digitare nulla.
    blocchi = blocchi_da_scheda(scheda) if scheda else []

    return render_template(
        "sessione_manuale.html",
        schede=schede,
        giorno=giorno,
        scheda=scheda,
        blocchi=blocchi,
        oggi=date.today(),
        modifica=False,
        sessione=None,
    )


@bp.route("/manuale", methods=["POST"])
def salva_manuale():
    giorno = _giorno_form(date.today())
    if giorno is None:
        flash("Data non valida.", "error")
        return redirect(url_for("sessione.manuale"))

    if giorno > date.today():
        flash("Non puoi registrare un allenamento in una data futura.", "error")
        return redirect(url_for("sessione.manuale", data=date.today().isoformat()))

    scheda_id = request.form.get("scheda_id", type=int)
    scheda = db.session.get(Scheda, scheda_id) if scheda_id else None
    if scheda is None:
        flash("Seleziona una scheda.", "error")
        return redirect(url_for("sessione.manuale", data=giorno.isoformat()))

    sessione = Sessione(
        data=giorno,
        iniziata_alle=datetime.combine(giorno, datetime.min.time()),
        scheda_id=scheda.id,
        completata=True,
    )
    _dati_sessione(sessione)
    db.session.add(sessione)
    db.session.flush()

    serie_create, esercizi_saltati = _leggi_blocchi(
        sessione, blocchi_da_scheda(scheda)
    )
    saltati = len(esercizi_saltati)

    if not serie_create:
        db.session.rollback()
        flash(
            "Non hai compilato nessuna serie: l'allenamento non e' stato salvato.",
            "error",
        )
        return redirect(
            url_for("sessione.manuale", data=giorno.isoformat(), scheda_id=scheda.id)
        )

    db.session.flush()
    pr_trovati = sum(1 for serie in serie_create if controlla_pr(serie))
    db.session.commit()

    messaggio = f"Allenamento registrato: {len(serie_create)} serie."
    if saltati:
        messaggio += f" {saltati} esercizio/i segnato/i come saltato."
    if pr_trovati:
        messaggio += f" {pr_trovati} nuovo/i record personale/i."
    flash(messaggio, "success")
    return redirect(
        url_for("calendario.dettaglio_giorno", giorno=giorno.isoformat())
    )


@bp.route("/<int:sessione_id>/modifica", methods=["GET"])
def modifica(sessione_id):
    """Form di modifica di un allenamento gia' salvato, serie comprese."""
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None:
        flash("Sessione non trovata.", "error")
        return redirect(url_for("calendario.vista_mensile"))
    if not sessione.completata:
        # Finche' e' in corso si modifica dalla pagina della sessione attiva.
        return redirect(url_for("sessione.attiva", sessione_id=sessione.id))

    return render_template(
        "sessione_manuale.html",
        schede=db.session.query(Scheda).filter_by(attiva=True).order_by(Scheda.nome).all(),
        giorno=sessione.data,
        scheda=sessione.scheda,
        blocchi=blocchi_da_sessione(sessione),
        oggi=date.today(),
        modifica=True,
        sessione=sessione,
    )


@bp.route("/<int:sessione_id>/modifica", methods=["POST"])
def salva_modifica(sessione_id):
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None:
        flash("Sessione non trovata.", "error")
        return redirect(url_for("calendario.vista_mensile"))

    giorno = _giorno_form(sessione.data)
    if giorno is None:
        flash("Data non valida.", "error")
        return redirect(url_for("sessione.modifica", sessione_id=sessione.id))
    if giorno > date.today():
        flash("Non puoi spostare un allenamento in una data futura.", "error")
        return redirect(url_for("sessione.modifica", sessione_id=sessione.id))

    # La mappa dei blocchi va costruita prima di svuotare la sessione: e' la
    # stessa con cui e' stato disegnato il form.
    blocchi = blocchi_da_sessione(sessione)
    esercizi_toccati = {blocco["esercizio"].id for blocco in blocchi}
    esercizi_toccati |= {serie.esercizio_libreria_id for serie in sessione.serie}

    for serie in list(sessione.serie):
        db.session.delete(serie)
    for saltato in list(sessione.esercizi_saltati):
        db.session.delete(saltato)
    db.session.flush()

    serie_create, esercizi_saltati = _leggi_blocchi(sessione, blocchi)
    if not serie_create:
        # Un allenamento senza serie non e' una modifica, e' una cancellazione:
        # si annulla tutto e la si lascia fare dal pulsante apposito.
        db.session.rollback()
        flash(
            "Non hai compilato nessuna serie: la modifica non e' stata salvata. "
            "Per togliere del tutto l'allenamento usa Elimina sessione.",
            "error",
        )
        return redirect(url_for("sessione.modifica", sessione_id=sessione_id))

    sessione.data = giorno
    sessione.iniziata_alle = datetime.combine(giorno, sessione.iniziata_alle.time())
    _dati_sessione(sessione)
    # Le note di dolore seguono la sessione, altrimenti resterebbero nel diario
    # del giorno vecchio.
    for nota in sessione.note_dolore:
        nota.data = giorno

    db.session.flush()
    esercizi_toccati |= {serie.esercizio_libreria_id for serie in serie_create}
    ricalcola_pr(esercizi_toccati)
    db.session.commit()

    messaggio = f"Allenamento aggiornato: {len(serie_create)} serie."
    if esercizi_saltati:
        messaggio += f" {len(esercizi_saltati)} esercizio/i segnato/i come saltato."
    flash(messaggio, "success")
    return redirect(
        url_for("calendario.dettaglio_giorno", giorno=giorno.isoformat())
    )


@bp.route("/<int:sessione_id>/annulla", methods=["POST"])
def annulla(sessione_id):
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None:
        flash("Sessione non trovata.", "error")
        return redirect(url_for("calendario.vista_mensile"))

    # Catturati prima della delete: dopo, la relationship non e' piu' leggibile.
    esercizi_toccati = {s.esercizio_libreria_id for s in sessione.serie}
    db.session.delete(sessione)
    db.session.flush()
    # Eventuali PR segnati durante questa sessione non devono restare orfani,
    # puntando a una sessione che non esiste piu'.
    ricalcola_pr(esercizi_toccati)
    db.session.commit()
    flash("Sessione annullata.", "success")
    return redirect(url_for("calendario.vista_mensile"))
