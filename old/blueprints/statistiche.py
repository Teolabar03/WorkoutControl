"""Statistiche, grafici, peso corporeo, diario dolori e analisi AI."""

from datetime import date

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
    RUOLO_UTENTE,
    Conversazione,
    Impostazione,
    MessaggioChat,
    NotaDolore,
    PesoCorporeo,
    db,
)
from services import ai, stats
from services.pr import pr_attuali, storico_pr

bp = Blueprint("statistiche", __name__, url_prefix="/statistiche")


@bp.route("/")
def vista():
    esercizi = stats.esercizi_con_dati()
    scelto_id = request.args.get("esercizio", type=int)
    if scelto_id is None and esercizi:
        scelto_id = esercizi[0].id

    return render_template(
        "statistiche.html",
        riepilogo=stats.riepilogo(),
        volume=stats.volume_nel_tempo(),
        ripetizioni=stats.ripetizioni_nel_tempo(),
        frequenza=stats.frequenza_settimanale(),
        aderenza=stats.aderenza_schede(),
        aderenza_riepilogo=stats.aderenza_riepilogo(),
        peso=stats.andamento_peso_corporeo(),
        progressione=stats.progressione_esercizio(scelto_id) if scelto_id else None,
        esercizi=esercizi,
        esercizio_scelto=scelto_id,
        pr_correnti=pr_attuali(),
        storico=storico_pr()[:20],
        n_default=Impostazione.get_int("analisi_n_sessioni", 10),
    )


# --- Chat con l'assistente AI --------------------------------------------

SUGGERIMENTI = [
    "Analizza i miei ultimi allenamenti",
    "Su quali esercizi sono fermo?",
    "Fammi vedere le mie schede",
    "Crea una scheda per la schiena con quello che ho in casa",
]


def _chat_disponibile():
    """Senza chiavi la chat non esiste: le rotte rimandano alle statistiche."""
    if ai.disponibile():
        return None
    flash(
        "L'assistente AI non è configurato: aggiungi ANTHROPIC_API_KEY, "
        "GEMINI_API_KEY oppure OLLAMA_MODEL in .env e riavvia l'app.",
        "error",
    )
    return redirect(url_for("statistiche.vista"))


@bp.route("/chat")
@bp.route("/chat/<int:conversazione_id>")
def chat(conversazione_id=None):
    non_disponibile = _chat_disponibile()
    if non_disponibile:
        return non_disponibile

    if conversazione_id is None:
        conversazione = ai.conversazione_corrente()
    else:
        conversazione = db.session.get(Conversazione, conversazione_id)
        if conversazione is None:
            flash("Conversazione non trovata.", "error")
            return redirect(url_for("statistiche.chat"))

    return render_template(
        "chat.html",
        conversazione=conversazione,
        conversazioni=ai.conversazioni(),
        n_default=Impostazione.get_int("analisi_n_sessioni", 10),
        totale_sessioni=len(stats.sessioni_completate()),
        suggerimenti=SUGGERIMENTI,
        etichetta_provider=ai.etichetta_provider(),
        modello_attivo=ai.modello_attivo(),
        # Il menu dei modelli si riempie dopo, da `modelli_ai`: qui basta la
        # scelta corrente. Interrogare i provider a ogni apertura della chat
        # non varrebbe l'attesa — stesso motivo per cui non si chiede a Ollama
        # se e' acceso.
        modello_chiave=ai.chiave_modello_attivo(),
        modello_riserva=ai.modello_riserva(),
    )


@bp.route("/chat/nuova", methods=["POST"])
def nuova_chat():
    non_disponibile = _chat_disponibile()
    if non_disponibile:
        return non_disponibile
    conversazione = ai.nuova_conversazione()
    return redirect(url_for("statistiche.chat", conversazione_id=conversazione.id))


def _n_sessioni(valore):
    """Quanti allenamenti mettere nel contesto, entro limiti sensati.

    La scelta viene anche salvata: e' l'ultima usata, ed e' quella che la chat
    ripropone alla riapertura.
    """
    n = valore or Impostazione.get_int("analisi_n_sessioni", 10)
    try:
        n = max(1, min(int(n), 100))
    except (TypeError, ValueError):
        n = 10
    Impostazione.set("analisi_n_sessioni", n)
    db.session.commit()
    return n


@bp.route("/chat/<int:conversazione_id>/messaggio", methods=["POST"])
def invia_messaggio(conversazione_id):
    """Manda un messaggio e restituisce la risposta. Risponde JSON."""
    if not ai.disponibile():
        return jsonify({"ok": False, "errore": "Assistente AI non configurato."}), 400

    conversazione = db.session.get(Conversazione, conversazione_id)
    if conversazione is None:
        return jsonify({"ok": False, "errore": "Conversazione non trovata."}), 404

    dati = request.get_json(silent=True) or {}
    testo = (dati.get("testo") or "").strip()
    n = _n_sessioni(dati.get("n_sessioni"))

    try:
        messaggio = ai.rispondi(conversazione, testo, n)
    except ai.AIConfigError as exc:
        return jsonify({"ok": False, "errore": str(exc)}), 400
    except ai.AIOllamaSpentoError as exc:
        # Caso rimediabile dall'utente: il flag fa comparire il pulsante di
        # avvio accanto all'errore, invece di lasciarlo a copiare comandi.
        return jsonify(
            {"ok": False, "errore": str(exc), "ollama_da_avviare": True}
        ), 502
    except ai.AIRequestError as exc:
        return jsonify({"ok": False, "errore": str(exc)}), 502

    return jsonify(_risposta_json(conversazione, messaggio))


def _risposta_json(conversazione, messaggio):
    """Il corpo comune a un messaggio nuovo e a uno riprocessato."""
    return {
        "ok": True,
        "risposta": messaggio.contenuto,
        "data": messaggio.data.strftime("%d/%m/%Y %H:%M"),
        "titolo": conversazione.titolo,
        "n_sessioni_contesto": messaggio.n_sessioni_contesto,
        "modello": messaggio.modello,
        "azioni": messaggio.elenco_azioni,
        "avviso": messaggio.avviso,
        "id_assistente": messaggio.id,
        # Il messaggio dell'utente e' quello scritto subito prima: serve al
        # client per attaccargli il pulsante "Modifica".
        "id_utente": _id_ultimo_utente(conversazione),
    }


def _id_ultimo_utente(conversazione):
    for messaggio in reversed(conversazione.messaggi):
        if messaggio.ruolo == RUOLO_UTENTE:
            return messaggio.id
    return None


@bp.route("/chat/<int:conversazione_id>/messaggio/<int:messaggio_id>/rigenera",
          methods=["POST"])
def rigenera_messaggio(conversazione_id, messaggio_id):
    """Riscrive l'ultimo messaggio dell'utente e rifa' la risposta. JSON.

    Solo l'ultimo: rigiocare un messaggio in mezzo vorrebbe dire rigiocare tutti
    i turni successivi, e ognuno di quelli poteva aver scritto sul database.

    Quello che gli strumenti hanno gia' scritto **non** viene annullato: le
    azioni della risposta scartata restano fatte. Per questo la prima chiamata
    le restituisce e si ferma; il client le mostra e richiama con `conferma`.
    """
    if not ai.disponibile():
        return jsonify({"ok": False, "errore": "Assistente AI non configurato."}), 400

    conversazione = db.session.get(Conversazione, conversazione_id)
    if conversazione is None:
        return jsonify({"ok": False, "errore": "Conversazione non trovata."}), 404

    messaggio = db.session.get(MessaggioChat, messaggio_id)
    if messaggio is None or messaggio.conversazione_id != conversazione.id:
        return jsonify({"ok": False, "errore": "Messaggio non trovato."}), 404
    if messaggio.ruolo != RUOLO_UTENTE:
        return jsonify(
            {"ok": False, "errore": "Si puo' modificare solo un tuo messaggio."}
        ), 400
    if messaggio.id != _id_ultimo_utente(conversazione):
        return jsonify(
            {
                "ok": False,
                "errore": "Si puo' modificare solo l'ultimo messaggio inviato.",
            }
        ), 400

    dati = request.get_json(silent=True) or {}
    testo = (dati.get("testo") or "").strip()
    if not testo:
        return jsonify({"ok": False, "errore": "Scrivi un messaggio."}), 400

    azioni_perse = [
        azione
        for m in conversazione.messaggi
        if m.id >= messaggio.id
        for azione in m.elenco_azioni
    ]
    if azioni_perse and not dati.get("conferma"):
        return jsonify({"ok": False, "conferma_richiesta": True, "azioni": azioni_perse})

    n = _n_sessioni(dati.get("n_sessioni"))

    # I vecchi messaggi li sostituisce `rispondi`, e solo a risposta ottenuta:
    # cancellarli qui vorrebbe dire perderli quando il modello non risponde.
    try:
        nuovo = ai.rispondi(conversazione, testo, n, sostituisci_da=messaggio.id)
    except ai.AIConfigError as exc:
        db.session.rollback()
        return jsonify({"ok": False, "errore": str(exc)}), 400
    except ai.AIOllamaSpentoError as exc:
        db.session.rollback()
        return jsonify(
            {"ok": False, "errore": str(exc), "ollama_da_avviare": True}
        ), 502
    except ai.AIRequestError as exc:
        # Il rollback e' la rete di sicurezza che rende vera la promessa del
        # commento qui sopra: qualunque cosa fosse in sospeso, la conversazione
        # resta com'era.
        db.session.rollback()
        return jsonify({"ok": False, "errore": str(exc)}), 502

    return jsonify(_risposta_json(conversazione, nuovo))


@bp.route("/ai/modelli")
def modelli_ai():
    """Il catalogo dei modelli selezionabili. JSON.

    Interroga i provider, quindi non va chiamata mentre si costruisce una
    pagina: il client la carica da sola dopo aver mostrato la chat.
    """
    if request.args.get("ricarica"):
        ai.svuota_cache_catalogo()
    return jsonify(
        {
            "ok": True,
            "attivo": ai.chiave_modello_attivo(),
            "gruppi": ai.catalogo_modelli(),
        }
    )


@bp.route("/ai/modello", methods=["POST"])
def cambia_modello_ai():
    """Cambia il modello dell'assistente. JSON."""
    dati = request.get_json(silent=True) or {}
    scelta = (dati.get("modello") or "").strip()

    errore = _salva_modello_ai(scelta)
    if errore:
        return jsonify({"ok": False, "errore": errore}), 400

    db.session.commit()
    return jsonify(
        {
            "ok": True,
            "attivo": ai.chiave_modello_attivo(),
            "modello": ai.modello_attivo(),
            "provider": ai.etichetta_provider(),
            "riserva": ai.modello_riserva(),
        }
    )


@bp.route("/ollama/stato")
def stato_ollama():
    """Stato del server locale. Risponde JSON.

    Interroga Ollama ma non carica nessun modello: serve a sapere se e' acceso
    prima di mandare un messaggio, invece di scoprirlo da un errore.
    """
    return jsonify(ai.stato_ollama())


@bp.route("/ollama/avvia", methods=["POST"])
def avvia_ollama():
    """Avvia il server Ollama in locale. Risponde JSON.

    Lancia un eseguibile fisso senza parametri presi dalla richiesta: qui non
    c'e' nessun input dell'utente da cui possa uscire un comando arbitrario.
    """
    ok, messaggio = ai.avvia_ollama()
    return jsonify({"ok": ok, "messaggio": messaggio}), (200 if ok else 502)


@bp.route("/chat/<int:conversazione_id>/elimina", methods=["POST"])
def elimina_chat(conversazione_id):
    conversazione = db.session.get(Conversazione, conversazione_id)
    if conversazione is not None:
        db.session.delete(conversazione)
        db.session.commit()
        flash("Conversazione eliminata.", "success")
    return redirect(url_for("statistiche.chat"))


# --- Peso corporeo -------------------------------------------------------


@bp.route("/peso")
def peso():
    misure = (
        db.session.query(PesoCorporeo).order_by(PesoCorporeo.data.desc()).all()
    )
    return render_template(
        "peso.html",
        misure=misure,
        grafico=stats.andamento_peso_corporeo(),
        oggi=date.today(),
    )


@bp.route("/peso/nuovo", methods=["POST"])
def nuovo_peso():
    valore = request.form.get("valore_kg", type=float)
    if not valore or valore <= 0:
        flash("Inserisci un peso valido.", "error")
        return redirect(url_for("statistiche.peso"))

    giorno_str = request.form.get("data") or date.today().isoformat()
    try:
        giorno = date.fromisoformat(giorno_str)
    except ValueError:
        flash("Data non valida.", "error")
        return redirect(url_for("statistiche.peso"))

    # Una misura al giorno: la seconda sovrascrive la prima.
    misura = db.session.query(PesoCorporeo).filter_by(data=giorno).first()
    if misura is None:
        misura = PesoCorporeo(data=giorno)
        db.session.add(misura)
    misura.valore_kg = valore
    misura.note = request.form.get("note", "").strip()

    db.session.commit()
    flash("Peso registrato.", "success")
    return redirect(url_for("statistiche.peso"))


@bp.route("/peso/<int:misura_id>/elimina", methods=["POST"])
def elimina_peso(misura_id):
    misura = db.session.get(PesoCorporeo, misura_id)
    if misura is not None:
        db.session.delete(misura)
        db.session.commit()
        flash("Misura eliminata.", "success")
    return redirect(url_for("statistiche.peso"))


# --- Diario dolori -------------------------------------------------------


@bp.route("/diario")
def diario():
    note = db.session.query(NotaDolore).order_by(NotaDolore.data.desc()).all()
    return render_template(
        "diario.html",
        note=note,
        correlazioni=stats.dolori_per_esercizio(),
        oggi=date.today(),
    )


@bp.route("/diario/nuova", methods=["POST"])
def nuova_nota():
    zona = request.form.get("zona_corporea", "").strip()
    if not zona:
        flash("Indica la zona del corpo.", "error")
        return redirect(url_for("statistiche.diario"))

    giorno_str = request.form.get("data") or date.today().isoformat()
    try:
        giorno = date.fromisoformat(giorno_str)
    except ValueError:
        flash("Data non valida.", "error")
        return redirect(url_for("statistiche.diario"))

    db.session.add(
        NotaDolore(
            data=giorno,
            zona_corporea=zona,
            descrizione=request.form.get("descrizione", "").strip(),
            gravita=request.form.get("gravita", type=int) or 1,
        )
    )
    db.session.commit()
    flash("Nota aggiunta al diario.", "success")
    return redirect(url_for("statistiche.diario"))


@bp.route("/diario/<int:nota_id>/elimina", methods=["POST"])
def elimina_nota(nota_id):
    nota = db.session.get(NotaDolore, nota_id)
    if nota is not None:
        db.session.delete(nota)
        db.session.commit()
        flash("Nota eliminata.", "success")
    return redirect(url_for("statistiche.diario"))


# --- Impostazioni --------------------------------------------------------


def _salva_modello_ai(scelta):
    """Cambia il modello dell'assistente. Restituisce l'errore, o None.

    `scelta` e' una chiave "provider:modello" fra quelle del catalogo. Stringa
    vuota vuol dire "torna alla scelta automatica" ed e' sempre valida. Una
    chiave che non c'e' viene rifiutata qui: altrimenti diventerebbe un errore
    del provider al primo messaggio in chat, cioe' lontano dalla causa.

    Il modello locale che lascia il posto viene tolto dalla memoria subito,
    senza aspettare il keep_alive del server: il computer serve anche ad altro.
    """
    if scelta == (Impostazione.get("ai_modello") or "").strip():
        return None

    if scelta and scelta not in ai.chiavi_valide():
        return f"«{scelta}» non è fra i modelli disponibili: modello non cambiato."

    precedente = ai.modello_ollama()
    Impostazione.set("ai_modello", scelta)
    # Il flush serve a far vedere la scelta appena fatta a chi rilegge
    # l'impostazione: un oggetto non ancora scritto non e' visibile a
    # `session.get()`, e il modello nuovo risulterebbe ancora quello vecchio.
    db.session.flush()
    ai.svuota_cache_catalogo()

    # Il modello locale si scarica solo se non serve piu' a nessuno: resta in
    # gioco anche da riserva di un provider remoto.
    nuovo = ai.modello_ollama()
    if precedente and precedente != nuovo:
        ai.scarica_modello_ollama(precedente)
    return None


def _salva_modello_ollama(scelto):
    """Cambia quale modello locale usare quando tocca a Ollama.

    Distinto da `_salva_modello_ai`: quello decide chi risponde, questo quale
    modello locale sia — anche solo da riserva di un provider remoto, che e'
    l'unico modo per sceglierlo quando a rispondere e' un altro.

    Stringa vuota vuol dire "torna al predefinito di .env" ed e' sempre valida.
    Un nome che non e' fra quelli utilizzabili viene rifiutato qui: altrimenti
    diventerebbe un errore di Ollama al primo messaggio in chat, cioe' lontano
    dalla causa.
    """
    if scelto == (Impostazione.get("ollama_modello") or "").strip():
        return

    if scelto:
        utilizzabili = ai.modelli_utilizzabili_ollama()
        if utilizzabili is None:
            flash("Ollama non risponde: modello locale non cambiato.", "error")
            return
        if scelto not in [m["nome"] for m in utilizzabili]:
            flash(
                f"«{scelto}» non è utilizzabile come assistente: modello non cambiato.",
                "error",
            )
            return

    precedente = ai.modello_ollama()
    Impostazione.set("ollama_modello", scelto)
    db.session.flush()
    ai.svuota_cache_catalogo(ai.PROVIDER_OLLAMA)
    nuovo = ai.modello_ollama()
    if precedente and precedente != nuovo:
        ai.scarica_modello_ollama(precedente)


@bp.route("/impostazioni", methods=["GET", "POST"])
def impostazioni():
    if request.method == "POST":
        timer = request.form.get("timer_default_sec", type=int)
        if timer and 5 <= timer <= 900:
            Impostazione.set("timer_default_sec", timer)
        n = request.form.get("analisi_n_sessioni", type=int)
        if n and 1 <= n <= 100:
            Impostazione.set("analisi_n_sessioni", n)
        if "ai_modello" in request.form:
            errore = _salva_modello_ai(request.form.get("ai_modello", "").strip())
            if errore:
                flash(errore, "error")
        if "ollama_modello" in request.form:
            _salva_modello_ollama(request.form.get("ollama_modello", "").strip())
        db.session.commit()
        flash("Impostazioni salvate.", "success")
        return redirect(url_for("statistiche.impostazioni"))

    return render_template(
        "impostazioni.html",
        timer_default=Impostazione.get_int("timer_default_sec", 90),
        n_default=Impostazione.get_int("analisi_n_sessioni", 10),
        etichetta_provider=ai.etichetta_provider(),
        modello_attivo=ai.modello_attivo(),
        # Unica pagina che interroga davvero i provider: altrove basta sapere
        # quali sono configurati.
        gruppi_modelli=ai.catalogo_modelli(),
        modello_scelto=(Impostazione.get("ai_modello") or ""),
        stato_ollama=ai.stato_ollama(),
    )
