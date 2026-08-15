"""Aggregazioni per la sezione statistiche.

Ogni funzione restituisce strutture pronte per Chart.js e per i template,
e resta corretta anche con database vuoto (liste vuote, mai eccezioni).
"""

from collections import OrderedDict
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


def _sessioni_per_giorno(limite=None):
    """Sessioni completate raggruppate per giorno, dalla piu' recente.

    Piu' sessioni nello stesso giorno (es. una scheda spezzata in due) contano
    come un solo allenamento in tutte le statistiche, non solo nel riepilogo.
    """
    per_giorno = OrderedDict()
    for sessione in sessioni_completate():
        per_giorno.setdefault(sessione.data, []).append(sessione)
    giorni = list(per_giorno.items())
    if limite:
        giorni = giorni[:limite]
    return giorni


def volume_nel_tempo():
    """Carico totale (kg) per giorno, dal piu' vecchio al piu' recente.

    Include solo gli esercizi con peso: elastico e corpo libero non hanno un
    carico misurabile in kg e vengono seguiti con `ripetizioni_nel_tempo`.
    """
    labels, valori = [], []
    for giorno, sessioni in reversed(_sessioni_per_giorno()):
        labels.append(giorno.isoformat())
        valori.append(round(sum(s.volume_kg for s in sessioni), 1))
    return {"labels": labels, "valori": valori}


def ripetizioni_nel_tempo():
    """Ripetizioni totali per giorno: copre anche elastico e corpo libero."""
    labels, valori = [], []
    for giorno, sessioni in reversed(_sessioni_per_giorno()):
        totale = sum(s.ripetizioni or 0 for sessione in sessioni for s in sessione.serie)
        labels.append(giorno.isoformat())
        valori.append(totale)
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
    """Numero di allenamenti per settimana nelle ultime N settimane.

    Più sessioni nello stesso giorno contano come un solo allenamento.
    """
    oggi = date.today()
    lunedi_corrente = oggi - timedelta(days=oggi.weekday())
    conteggi = OrderedDict()
    for indietro in range(settimane - 1, -1, -1):
        inizio = lunedi_corrente - timedelta(weeks=indietro)
        conteggi[inizio] = 0

    giorni_visti = set()
    for sessione in db.session.query(Sessione).filter_by(completata=True).all():
        if sessione.data in giorni_visti:
            continue
        giorni_visti.add(sessione.data)
        inizio = sessione.data - timedelta(days=sessione.data.weekday())
        if inizio in conteggi:
            conteggi[inizio] += 1

    return {
        "labels": [d.strftime("%d/%m") for d in conteggi],
        "valori": list(conteggi.values()),
    }


def aderenza_schede(limite=15):
    """Percentuale di serie completate rispetto al target, per giorno.

    Se lo stesso giorno ha piu' sessioni su piu' schede, il target e' la
    somma dei target di ciascuna scheda coinvolta quel giorno.
    """
    labels, valori = [], []
    for giorno, sessioni in reversed(_sessioni_per_giorno(limite)):
        schede = {s.scheda.id: s.scheda for s in sessioni if s.scheda}
        if not schede:
            continue
        target = sum(sum(e.serie_target for e in scheda.esercizi) for scheda in schede.values())
        if target == 0:
            continue
        fatte = sum(len(s.serie) for s in sessioni)
        labels.append(giorno.isoformat())
        valori.append(round(min(fatte / target, 1.5) * 100, 1))
    return {"labels": labels, "valori": valori}


def aderenza_riepilogo(limite=15):
    """Media di aderenza sulle ultime N sessioni con scheda, come testo pronto.

    Il grafico a barre da solo non dice se il complesso e' buono o no: qui si
    riduce a una singola percentuale leggibile a colpo d'occhio.
    """
    dati = aderenza_schede(limite)
    if not dati["valori"]:
        return None
    media = sum(dati["valori"]) / len(dati["valori"])
    return {"media": round(media, 1), "n_sessioni": len(dati["valori"])}


def andamento_peso_corporeo():
    misure = db.session.query(PesoCorporeo).order_by(PesoCorporeo.data.asc()).all()
    return {
        "labels": [m.data.isoformat() for m in misure],
        "valori": [m.valore_kg for m in misure],
    }


def riepilogo():
    """Numeri di sintesi mostrati in cima alla pagina statistiche.

    Più sessioni nello stesso giorno contano come un solo allenamento.
    """
    completate = sessioni_completate()
    giorni_allenamento = {s.data for s in completate}
    volume_totale = sum(s.volume_kg for s in completate)
    giorni_30 = {s.data for s in completate if (date.today() - s.data).days <= 30}
    durate = [s.durata_minuti for s in completate if s.durata_minuti]
    return {
        "totale_sessioni": len(giorni_allenamento),
        "sessioni_30_giorni": len(giorni_30),
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
