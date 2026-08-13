"""Aggregazioni per la sezione statistiche.

Ogni funzione restituisce strutture pronte per Chart.js e per i template,
e resta corretta anche con database vuoto (liste vuote, mai eccezioni).
"""

from collections import OrderedDict, defaultdict
from datetime import date, timedelta

from models import (
    LOAD_WEIGHT,
    MEASURE_TIME,
    EsercizioLibreria,
    PesoCorporeo,
    SerieEseguita,
    Sessione,
    db,
)


def sessioni_completate(limite=None):
    query = (
        db.session.query(Sessione)
        .filter_by(completata=True)
        .order_by(Sessione.data.desc(), Sessione.id.desc())
    )
    if limite:
        query = query.limit(limite)
    return query.all()


def volume_nel_tempo():
    """Carico totale (kg) per sessione, dalla piu' vecchia alla piu' recente.

    Include solo gli esercizi con peso: elastico e corpo libero non hanno un
    carico misurabile in kg e vengono seguiti con `ripetizioni_nel_tempo`.
    """
    labels, valori = [], []
    for sessione in reversed(sessioni_completate()):
        labels.append(sessione.data.isoformat())
        valori.append(round(sessione.volume_kg, 1))
    return {"labels": labels, "valori": valori}


def ripetizioni_nel_tempo():
    """Ripetizioni totali per sessione: copre anche elastico e corpo libero."""
    labels, valori = [], []
    for sessione in reversed(sessioni_completate()):
        labels.append(sessione.data.isoformat())
        valori.append(sum(s.ripetizioni or 0 for s in sessione.serie))
    return {"labels": labels, "valori": valori}


def progressione_esercizio(esercizio_id):
    """Miglior serie per data: peso per i manubri, ripetizioni/secondi altrove."""
    esercizio = db.session.get(EsercizioLibreria, esercizio_id)
    if esercizio is None:
        return {"labels": [], "valori": [], "unita": "", "nome": ""}

    if esercizio.tipo_misura == MEASURE_TIME:
        campo, unita = "durata_secondi", "sec"
    elif esercizio.tipo_carico == LOAD_WEIGHT:
        campo, unita = "peso_kg", "kg"
    else:
        campo, unita = "ripetizioni", "rip."

    per_data = OrderedDict()
    righe = (
        db.session.query(SerieEseguita)
        .join(Sessione)
        .filter(
            SerieEseguita.esercizio_libreria_id == esercizio_id,
            Sessione.completata.is_(True),
        )
        .order_by(Sessione.data.asc())
        .all()
    )
    for serie in righe:
        valore = getattr(serie, campo)
        if valore is None:
            continue
        giorno = serie.sessione.data.isoformat()
        per_data[giorno] = max(per_data.get(giorno, 0), valore)

    return {
        "labels": list(per_data.keys()),
        "valori": [round(v, 2) for v in per_data.values()],
        "unita": unita,
        "nome": esercizio.nome,
    }


def frequenza_settimanale(settimane=12):
    """Numero di allenamenti per settimana nelle ultime N settimane."""
    oggi = date.today()
    lunedi_corrente = oggi - timedelta(days=oggi.weekday())
    conteggi = OrderedDict()
    for indietro in range(settimane - 1, -1, -1):
        inizio = lunedi_corrente - timedelta(weeks=indietro)
        conteggi[inizio] = 0

    prima_settimana = next(iter(conteggi), lunedi_corrente)
    for sessione in db.session.query(Sessione).filter_by(completata=True).all():
        inizio = sessione.data - timedelta(days=sessione.data.weekday())
        if inizio in conteggi:
            conteggi[inizio] += 1
        elif inizio < prima_settimana:
            continue

    return {
        "labels": [d.strftime("%d/%m") for d in conteggi],
        "valori": list(conteggi.values()),
    }


def aderenza_schede(limite=15):
    """Percentuale di serie completate rispetto al target, per sessione."""
    labels, valori = [], []
    for sessione in reversed(sessioni_completate(limite)):
        if not sessione.scheda:
            continue
        target = sum(e.serie_target for e in sessione.scheda.esercizi)
        if target == 0:
            continue
        fatte = len(sessione.serie)
        labels.append(sessione.data.isoformat())
        valori.append(round(min(fatte / target, 1.5) * 100, 1))
    return {"labels": labels, "valori": valori}


def andamento_peso_corporeo():
    misure = db.session.query(PesoCorporeo).order_by(PesoCorporeo.data.asc()).all()
    return {
        "labels": [m.data.isoformat() for m in misure],
        "valori": [m.valore_kg for m in misure],
    }


def riepilogo():
    """Numeri di sintesi mostrati in cima alla pagina statistiche."""
    completate = sessioni_completate()
    volume_totale = sum(s.volume_kg for s in completate)
    ultimi_30 = [
        s for s in completate if (date.today() - s.data).days <= 30
    ]
    durate = [s.durata_minuti for s in completate if s.durata_minuti]
    return {
        "totale_sessioni": len(completate),
        "sessioni_30_giorni": len(ultimi_30),
        "volume_totale_kg": round(volume_totale, 1),
        "durata_media_min": round(sum(durate) / len(durate)) if durate else None,
        "ultima_sessione": completate[0].data if completate else None,
    }


def esercizi_con_dati():
    """Esercizi effettivamente allenati, per popolare il selettore progressione."""
    ids = {
        riga[0]
        for riga in db.session.query(SerieEseguita.esercizio_libreria_id).distinct()
    }
    if not ids:
        return []
    return (
        db.session.query(EsercizioLibreria)
        .filter(EsercizioLibreria.id.in_(ids))
        .order_by(EsercizioLibreria.nome)
        .all()
    )


def dolori_per_esercizio():
    """Quante volte ogni esercizio compare in sessioni con un dolore segnalato.

    Segnale grezzo di co-occorrenza: la correlazione vera la fa l'analisi AI,
    qui serve solo a dare un ordine di grandezza nella vista diario.
    """
    conteggi = defaultdict(int)
    sessioni = (
        db.session.query(Sessione)
        .filter(Sessione.note_dolore.any())
        .all()
    )
    for sessione in sessioni:
        for nome in {s.esercizio.nome for s in sessione.serie}:
            conteggi[nome] += 1
    return sorted(conteggi.items(), key=lambda kv: kv[1], reverse=True)
