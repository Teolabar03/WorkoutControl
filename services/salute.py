"""Dati di salute importati dal telefono: sonno, alimentazione, peso.

Samsung Health non ha un'API cloud da interrogare: l'unico modo di leggerne i
dati e' partire dal telefono, dove Health Connect fa da hub e un'app ponte
(HC Webhook) spedisce qui il JSON ogni ora. Il flusso e' quindi al contrario
del solito — e' il telefono a chiamare l'app, non l'app a chiedere i dati — e
tutto quello che serve a riceverli sta in questo modulo.

Il punto delicato e' la deduplica: l'app ponte rispedisce a ogni giro una
finestra mobile di 48 ore, percio' ogni scrittura e' un upsert su una chiave
naturale (l'orario di inizio) e non un insert.
"""

from datetime import date, datetime, timedelta

from models import (
    ORIGINE_SAMSUNG,
    PastoNutrizione,
    PesoCorporeo,
    SonnoNotte,
    db,
)
from services.ai_tools import registra_peso_corporeo

# Tetto per singola sincronizzazione: l'endpoint di ingest e' l'unico
# raggiungibile senza login, un payload gonfiato non deve poter tenere occupato
# il server.
MAX_RECORD_PER_TIPO = 5000

# Nomi delle fasi di sonno di Health Connect, raggruppati come li mostriamo noi.
FASI = {
    "profondo": {"DEEP"},
    "rem": {"REM"},
    "leggero": {"LIGHT", "SLEEPING", "SLEEP"},
    "sveglio": {"AWAKE", "AWAKE_IN_BED", "OUT_OF_BED"},
}


# --- Parsing difensivo del payload ----------------------------------------
#
# I nomi dei campi arrivano da un'app di terze parti che puo' cambiarli fra una
# versione e l'altra: si leggono per alias e un record malformato viene saltato
# invece di far fallire l'intera sincronizzazione.


def _dt(valore):
    """Un timestamp ISO-8601 letto come datetime naive in ora locale.

    Il resto dell'app salva orari naive (`datetime.now()`): tenere qui l'offset
    farebbe convivere due convenzioni diverse nello stesso database.
    """
    if not valore:
        return None
    testo = str(valore).strip()
    if testo.endswith(("Z", "z")):
        testo = testo[:-1] + "+00:00"
    try:
        momento = datetime.fromisoformat(testo)
    except ValueError:
        return None
    if momento.tzinfo is not None:
        momento = momento.astimezone().replace(tzinfo=None)
    return momento


def _numero(valore):
    if valore is None or valore == "":
        return None
    try:
        return float(valore)
    except (TypeError, ValueError):
        return None


def _primo(record, *chiavi):
    for chiave in chiavi:
        if record.get(chiave) not in (None, ""):
            return record[chiave]
    return None


def _minuti_per_fase(stages):
    """Somma i minuti delle fasi di una dormita, per gruppo."""
    if not isinstance(stages, list):
        return {}
    totali = {}
    for stage in stages:
        if not isinstance(stage, dict):
            continue
        nome = str(_primo(stage, "stage", "type", "name") or "").upper()
        secondi = _numero(_primo(stage, "duration_seconds", "duration"))
        if secondi is None:
            inizio = _dt(_primo(stage, "start_time", "startTime"))
            fine = _dt(_primo(stage, "end_time", "endTime"))
            if inizio and fine:
                secondi = (fine - inizio).total_seconds()
        if not secondi:
            continue
        for gruppo, nomi in FASI.items():
            if nome in nomi:
                totali[gruppo] = totali.get(gruppo, 0) + round(secondi / 60)
                break
    return totali


# --- Scrittura -------------------------------------------------------------


def registra_sonno(
    inizio, fine, durata_minuti=None, fasi=None, origine=ORIGINE_SAMSUNG
):
    """Salva (o aggiorna) una dormita. Chiave: l'orario di inizio."""
    if inizio is None or fine is None or fine <= inizio:
        return None
    if durata_minuti is None:
        durata_minuti = round((fine - inizio).total_seconds() / 60)

    notte = db.session.query(SonnoNotte).filter_by(inizio=inizio).first()
    if notte is None:
        notte = SonnoNotte(inizio=inizio)
        db.session.add(notte)
    notte.fine = fine
    # La dormita si attribuisce al giorno del risveglio: chi va a letto dopo
    # mezzanotte non deve vedersela contata sul giorno prima.
    notte.data = fine.date()
    notte.durata_minuti = max(0, int(durata_minuti))
    fasi = fasi or {}
    notte.minuti_profondo = fasi.get("profondo")
    notte.minuti_rem = fasi.get("rem")
    notte.minuti_leggero = fasi.get("leggero")
    notte.minuti_sveglio = fasi.get("sveglio")
    notte.origine = origine
    return notte


def registra_pasto(inizio, nome="", origine=ORIGINE_SAMSUNG, **valori):
    """Salva (o aggiorna) un pasto.

    Un pasto con un nome ("Colazione", "Pranzo") e' unico nella sua giornata, e
    la chiave e' quella: giorno piu' nome. Non l'orario, perche' le due fonti lo
    danno diverso — il telefono manda l'ora del pasto, l'export quella in cui e'
    stato registrato — e a chiave sull'orario la stessa colazione entrerebbe due
    volte, raddoppiando le calorie del giorno. Per i pasti senza nome quella
    chiave collasserebbe tutto in un record solo, quindi li' resta l'orario.
    """
    if inizio is None:
        return None
    nome = (nome or "").strip()[:160]

    if nome:
        pasto = (
            db.session.query(PastoNutrizione)
            .filter_by(data=inizio.date(), nome=nome)
            .first()
        )
    else:
        pasto = (
            db.session.query(PastoNutrizione).filter_by(inizio=inizio, nome=nome).first()
        )
    if pasto is None:
        pasto = PastoNutrizione(inizio=inizio, nome=nome)
        db.session.add(pasto)
    pasto.inizio = inizio
    pasto.data = inizio.date()
    for campo in (
        "kcal",
        "proteine_g",
        "carboidrati_g",
        "grassi_g",
        "fibre_g",
        "zuccheri_g",
    ):
        setattr(pasto, campo, valori.get(campo))
    pasto.origine = origine
    return pasto


def _ingerisci_sonno(record):
    inizio = _dt(_primo(record, "session_start_time", "start_time", "startTime"))
    fine = _dt(_primo(record, "session_end_time", "end_time", "endTime"))
    secondi = _numero(_primo(record, "duration_seconds", "duration"))
    if inizio is None and fine is not None and secondi:
        inizio = fine - timedelta(seconds=secondi)
    if fine is None and inizio is not None and secondi:
        fine = inizio + timedelta(seconds=secondi)
    durata = round(secondi / 60) if secondi else None
    return registra_sonno(inizio, fine, durata, _minuti_per_fase(record.get("stages")))


def _ingerisci_pasto(record):
    inizio = _dt(_primo(record, "start_time", "startTime", "time"))
    return registra_pasto(
        inizio,
        nome=_primo(record, "name", "meal_name") or "",
        kcal=_numero(_primo(record, "calories", "energy_kcal", "kcal")),
        proteine_g=_numero(_primo(record, "protein_grams", "protein")),
        carboidrati_g=_numero(
            _primo(record, "carbs_grams", "carbohydrates_grams", "carbs")
        ),
        grassi_g=_numero(_primo(record, "fat_grams", "total_fat_grams", "fat")),
        fibre_g=_numero(_primo(record, "dietary_fiber_grams", "fiber_grams")),
        zuccheri_g=_numero(_primo(record, "sugar_grams", "sugar")),
    )


def registra_peso_se_manca(kg, giorno, note=""):
    """Salva il peso solo se quel giorno non ne ha gia' uno.

    La tabella ammette una misura al giorno, quindi il peso che arriva da
    Samsung e quello digitato a mano si contendono la stessa riga. Vince chi
    c'era prima: una misura scritta a mano e' un gesto deliberato, spesso con
    una nota che la spiega ("post pasto", "pesata dubbia"), e sovrascriverla
    distruggerebbe un dato che l'utente non puo' recuperare da nessuna parte.
    Per farla rimpiazzare basta cancellarla dall'app.

    Torna comunque True quando la misura e' stata riconosciuta, anche se non
    scritta: i conteggi descrivono quello che la sorgente conteneva, e devono
    restare identici se si reimporta lo stesso file.
    """
    if not kg or kg <= 0 or giorno is None:
        return None
    if db.session.query(PesoCorporeo).filter_by(data=giorno).first() is not None:
        return True
    registra_peso_corporeo(valore_kg=kg, data=giorno.isoformat(), note=note)
    return True


def _ingerisci_peso(record):
    """Il peso confluisce nella tabella che l'app usa gia', non in una nuova."""
    kg = _numero(_primo(record, "kilograms", "weight_kilograms", "kg"))
    momento = _dt(_primo(record, "time", "start_time", "startTime"))
    if momento is None:
        return None
    return registra_peso_se_manca(kg, momento.date())


def ingerisci_health_connect(payload):
    """Salva quello che riconosciamo di un payload di HC Webhook.

    Il payload contiene tutti i tipi che l'app ponte legge da Health Connect
    (passi, battito, saturazione...): qui interessano solo sonno, peso e
    alimentazione, il resto viene ignorato senza errore. Un tipo assente e'
    normale, non un problema.
    """
    if not isinstance(payload, dict):
        return {"sonno": 0, "pasti": 0, "peso": 0}

    conteggi = {"sonno": 0, "pasti": 0, "peso": 0}
    for chiave, gestore, etichetta in (
        ("sleep", _ingerisci_sonno, "sonno"),
        ("nutrition", _ingerisci_pasto, "pasti"),
        ("weight", _ingerisci_peso, "peso"),
    ):
        record = payload.get(chiave)
        if not isinstance(record, list):
            continue
        for voce in record[:MAX_RECORD_PER_TIPO]:
            if isinstance(voce, dict) and gestore(voce) is not None:
                conteggi[etichetta] += 1

    db.session.commit()
    return conteggi


# --- Lettura ---------------------------------------------------------------


def ci_sono_dati():
    """Vero se e' mai arrivato qualcosa dal telefono.

    E' questo — non la presenza del token in configurazione — a decidere se la
    sezione Salute compare nell'app: finche' la catena non ha funzionato
    davvero, l'interfaccia resta quella di prima.
    """
    return bool(
        db.session.query(SonnoNotte.id).first()
        or db.session.query(PastoNutrizione.id).first()
    )


def ci_sono_pasti():
    """Vero se c'e' almeno un pasto registrato.

    La sezione Nutrizione ha una sua condizione, separata da quella del sonno:
    l'alimentazione e' il dato che Samsung Health riversa piu' malvolentieri su
    Health Connect, e spesso arriva solo dall'export. Con un flag unico, chi ha
    il sonno ma non i pasti si troverebbe una sezione perennemente vuota.
    """
    return db.session.query(PastoNutrizione.id).first() is not None


def _vuoto(giorno):
    return {
        "data": giorno.isoformat(),
        "sonno_minuti": 0,
        "sonno_inizio": None,
        "sonno_fine": None,
        "fasi": {},
        "kcal": None,
        "proteine_g": None,
        "carboidrati_g": None,
        "grassi_g": None,
        "peso_kg": None,
    }


def giorni_salute(dal, al):
    """Una riga per giorno con sonno, macro e peso, dal piu' recente.

    I totali dei pasti si sommano qui e non si salvano da nessuna parte: un
    pasto che arriva in ritardo o corretto a posteriori si riflette subito,
    senza dover ricalcolare niente.
    """
    giorni = {}

    notti = (
        db.session.query(SonnoNotte)
        .filter(SonnoNotte.data >= dal, SonnoNotte.data <= al)
        .order_by(SonnoNotte.inizio.asc())
        .all()
    )
    for notte in notti:
        riga = giorni.setdefault(notte.data, _vuoto(notte.data))
        riga["sonno_minuti"] += notte.durata_minuti
        # Con piu' dormite nello stesso giorno (pisolini) la finestra mostrata
        # e' quella della piu' lunga, che e' la notte vera e propria.
        if notte.durata_minuti >= riga.get("_max_minuti", 0):
            riga["_max_minuti"] = notte.durata_minuti
            riga["sonno_inizio"] = notte.inizio.isoformat()
            riga["sonno_fine"] = notte.fine.isoformat()
            # Solo le fasi davvero misurate: una notte registrata dal telefono
            # senza orologio non ne ha nessuna, e una manciata di null nel JSON
            # sarebbe solo rumore per il grafico e per l'assistente.
            riga["fasi"] = {
                etichetta: valore
                for etichetta, valore in (
                    ("profondo", notte.minuti_profondo),
                    ("rem", notte.minuti_rem),
                    ("leggero", notte.minuti_leggero),
                    ("sveglio", notte.minuti_sveglio),
                )
                if valore
            }

    pasti = (
        db.session.query(PastoNutrizione)
        .filter(PastoNutrizione.data >= dal, PastoNutrizione.data <= al)
        .all()
    )
    for pasto in pasti:
        riga = giorni.setdefault(pasto.data, _vuoto(pasto.data))
        for campo in ("kcal", "proteine_g", "carboidrati_g", "grassi_g"):
            valore = getattr(pasto, campo)
            if valore is not None:
                riga[campo] = round((riga[campo] or 0) + valore, 1)

    misure = (
        db.session.query(PesoCorporeo)
        .filter(PesoCorporeo.data >= dal, PesoCorporeo.data <= al)
        .all()
    )
    for misura in misure:
        riga = giorni.setdefault(misura.data, _vuoto(misura.data))
        riga["peso_kg"] = misura.valore_kg

    righe = []
    for giorno in sorted(giorni, reverse=True):
        riga = giorni[giorno]
        riga.pop("_max_minuti", None)
        righe.append(riga)
    return righe


def ultimo_aggiornamento():
    """Data dell'ultimo dato ricevuto per tipo, per il pannello in Impostazioni."""

    def _ultimo(colonna):
        valore = db.session.query(db.func.max(colonna)).scalar()
        if isinstance(valore, str):
            return valore
        return valore.isoformat() if valore else None

    return {
        "ultimo_sonno": _ultimo(SonnoNotte.data),
        "ultimo_pasto": _ultimo(PastoNutrizione.data),
        "ultimo_peso": _ultimo(PesoCorporeo.data),
    }


def riepilogo_salute(dal):
    """Sonno e alimentazione per il payload dell'assistente, in forma compatta.

    Torna due liste separate: l'assistente deve poter dire "manca il dato" per
    l'una senza confondersi con l'altra, cosa che una riga unica piena di null
    renderebbe piu' ambigua.
    """
    righe = giorni_salute(dal, date.today())
    sonno = [
        {
            "data": r["data"],
            "ore": round(r["sonno_minuti"] / 60, 1),
            "dalle": r["sonno_inizio"],
            "alle": r["sonno_fine"],
            "fasi_minuti": {k: v for k, v in r["fasi"].items() if v},
        }
        for r in reversed(righe)
        if r["sonno_minuti"]
    ]
    alimentazione = [
        {
            "data": r["data"],
            "kcal": r["kcal"],
            "proteine_g": r["proteine_g"],
            "carboidrati_g": r["carboidrati_g"],
            "grassi_g": r["grassi_g"],
        }
        for r in reversed(righe)
        if r["kcal"] is not None
    ]
    return sonno, alimentazione
