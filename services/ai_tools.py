"""Strumenti che l'assistente AI puo' chiamare per leggere e modificare i dati.

Ogni strumento e' una funzione Python con uno schema JSON: lo schema viene
passato al modello (Anthropic e Gemini usano lo stesso formato JSON Schema), la
funzione viene eseguita qui sul database locale. Il modello non tocca mai il DB
direttamente: puo' solo chiedere l'esecuzione di uno di questi strumenti.

Gli strumenti che scrivono sono marcati con `scrive=True`: le loro chiamate
finiscono nel registro azioni mostrato in chat, cosi' resta sempre visibile
cosa l'assistente ha cambiato.
"""

from datetime import date, datetime

from models import (
    LOAD_BAND,
    LOAD_BODYWEIGHT,
    LOAD_WEIGHT,
    MEASURE_REPS,
    MEASURE_TIME,
    EsercizioLibreria,
    EsercizioSaltato,
    EsercizioScheda,
    Impostazione,
    NotaDolore,
    PesoCorporeo,
    Scheda,
    SerieEseguita,
    Sessione,
    db,
)
from services.pr import controlla_pr, pr_attuali, ricalcola_pr

# Registro degli strumenti, nell'ordine di dichiarazione: l'ordine e' stabile
# fra una richiesta e l'altra, cosa che aiuta la cache dei prompt.
STRUMENTI = {}


class ErroreStrumento(Exception):
    """Errore previsto: torna al modello come risultato, non come crash."""


def strumento(nome, descrizione, schema, scrive=False):
    def decoratore(funzione):
        STRUMENTI[nome] = {
            "nome": nome,
            "descrizione": descrizione,
            "schema": schema,
            "funzione": funzione,
            "scrive": scrive,
        }
        return funzione

    return decoratore


def definizioni():
    """Gli strumenti nel formato comune ai due provider."""
    return [
        {
            "nome": s["nome"],
            "descrizione": s["descrizione"],
            "schema": s["schema"],
        }
        for s in STRUMENTI.values()
    ]


def esegui(nome, argomenti):
    """Esegue uno strumento. Restituisce (risultato, azione, errore)."""
    definizione = STRUMENTI.get(nome)
    if definizione is None:
        return None, None, f"Strumento sconosciuto: {nome}"

    try:
        risultato = definizione["funzione"](**(argomenti or {}))
    except ErroreStrumento as exc:
        db.session.rollback()
        return None, None, str(exc)
    except TypeError as exc:
        db.session.rollback()
        return None, None, f"Argomenti non validi per {nome}: {exc}"
    except Exception as exc:  # pragma: no cover - rete di sicurezza
        db.session.rollback()
        return None, None, f"Errore eseguendo {nome}: {exc}"

    azione = None
    if definizione["scrive"]:
        azione = risultato.pop("_azione", nome) if isinstance(risultato, dict) else nome
    return risultato, azione, None


# --- Helper condivisi ------------------------------------------------------


def _data(valore, campo="data"):
    if not valore:
        return None
    try:
        return date.fromisoformat(str(valore)[:10])
    except ValueError:
        raise ErroreStrumento(f"{campo} non valida: usa il formato AAAA-MM-GG.")


def _scheda(scheda_id):
    scheda = db.session.get(Scheda, scheda_id)
    if scheda is None:
        raise ErroreStrumento(f"Nessuna scheda con id {scheda_id}.")
    return scheda


def _sessione(sessione_id):
    sessione = db.session.get(Sessione, sessione_id)
    if sessione is None:
        raise ErroreStrumento(f"Nessun allenamento con id {sessione_id}.")
    return sessione


def _esercizio(riferimento):
    """Trova un esercizio della libreria per id o per nome.

    Il modello ragiona sui nomi, non sugli id: accettare entrambi evita un giro
    di chiamate in piu' solo per risolvere un nome che l'utente ha gia' detto.
    """
    if riferimento is None or riferimento == "":
        raise ErroreStrumento("Indica l'esercizio (id o nome).")

    if isinstance(riferimento, int) or str(riferimento).isdigit():
        trovato = db.session.get(EsercizioLibreria, int(riferimento))
        if trovato is None:
            raise ErroreStrumento(f"Nessun esercizio con id {riferimento}.")
        return trovato

    testo = str(riferimento).strip().lower()
    candidati = db.session.query(EsercizioLibreria).all()
    esatti = [e for e in candidati if e.nome.lower() == testo]
    if esatti:
        return esatti[0]
    parziali = [e for e in candidati if testo in e.nome.lower()]
    if len(parziali) == 1:
        return parziali[0]
    if not parziali:
        raise ErroreStrumento(
            f"Nessun esercizio chiamato «{riferimento}». Usa cerca_esercizi per "
            "vedere quelli disponibili, o crea_esercizio_libreria per aggiungerlo."
        )
    nomi = ", ".join(e.nome for e in parziali[:8])
    raise ErroreStrumento(
        f"«{riferimento}» corrisponde a piu' esercizi: {nomi}. Sii piu' preciso."
    )


def _voce(voce_id):
    voce = db.session.get(EsercizioScheda, voce_id)
    if voce is None:
        raise ErroreStrumento(f"Nessun esercizio di scheda con id {voce_id}.")
    return voce


def _numero(valore, campo, intero=False):
    if valore in (None, ""):
        return None
    try:
        return int(valore) if intero else float(valore)
    except (TypeError, ValueError):
        raise ErroreStrumento(f"{campo} deve essere un numero.")


def _voce_json(voce):
    return {
        "voce_id": voce.id,
        "esercizio": voce.esercizio.nome,
        "esercizio_id": voce.esercizio_libreria_id,
        "ordine": voce.ordine,
        "serie_target": voce.serie_target,
        "rep_target": voce.rep_target,
        "durata_target_sec": voce.durata_target_sec,
        "peso_suggerito_kg": voce.peso_suggerito_kg,
        "note": voce.note or None,
        "timer_recupero_secondi": voce.timer_recupero_secondi,
        "tipo_carico": voce.esercizio.tipo_carico,
        "tipo_misura": voce.esercizio.tipo_misura,
    }


def _sessione_json(sessione, con_serie=False):
    dati = {
        "sessione_id": sessione.id,
        "data": sessione.data.isoformat(),
        "scheda": sessione.nome_scheda,
        "scheda_id": sessione.scheda_id,
        "durata_minuti": sessione.durata_minuti,
        "completata": sessione.completata,
        "n_serie": len(sessione.serie),
        "volume_kg": round(sessione.volume_kg, 1),
        "energia": sessione.energia,
        "sonno": sessione.sonno,
        "umore": sessione.umore,
        "note_generali": sessione.note_generali or None,
    }
    if con_serie:
        dati["serie"] = [
            {
                "serie_id": s.id,
                "esercizio": s.esercizio.nome,
                "numero_serie": s.numero_serie,
                "peso_kg": s.peso_kg,
                "ripetizioni": s.ripetizioni,
                "durata_secondi": s.durata_secondi,
                "note": s.note or None,
                "is_pr": s.is_pr,
            }
            for s in sessione.serie
        ]
        dati["esercizi_saltati"] = [
            {"esercizio": x.esercizio.nome, "motivo": x.motivo or None}
            for x in sessione.esercizi_saltati
        ]
    return dati


# --- Lettura ---------------------------------------------------------------


@strumento(
    "elenco_schede",
    "Elenca le schede di allenamento con id, obiettivo, stato e numero di "
    "esercizi. Usalo prima di modificare una scheda, per avere gli id giusti.",
    {
        "type": "object",
        "properties": {
            "includi_archiviate": {
                "type": "boolean",
                "description": "Se true include anche le schede non attive.",
            }
        },
    },
)
def elenco_schede(includi_archiviate=False):
    query = db.session.query(Scheda)
    if not includi_archiviate:
        query = query.filter_by(attiva=True)
    schede = query.order_by(Scheda.nome).all()
    return {
        "schede": [
            {
                "scheda_id": s.id,
                "nome": s.nome,
                "obiettivo": s.obiettivo or None,
                "descrizione": s.descrizione or None,
                "attiva": s.attiva,
                "n_esercizi": len(s.esercizi),
                "n_allenamenti": len(s.sessioni),
            }
            for s in schede
        ]
    }


@strumento(
    "dettaglio_scheda",
    "Tutti gli esercizi di una scheda con serie/ripetizioni/peso target, note e "
    "l'id di ogni voce (voce_id), necessario per modificarla o rimuoverla.",
    {
        "type": "object",
        "properties": {"scheda_id": {"type": "integer"}},
        "required": ["scheda_id"],
    },
)
def dettaglio_scheda(scheda_id):
    scheda = _scheda(scheda_id)
    return {
        "scheda_id": scheda.id,
        "nome": scheda.nome,
        "obiettivo": scheda.obiettivo or None,
        "descrizione": scheda.descrizione or None,
        "attiva": scheda.attiva,
        "esercizi": [_voce_json(v) for v in scheda.esercizi],
    }


@strumento(
    "cerca_esercizi",
    "Cerca nella libreria esercizi per nome, gruppo muscolare o attrezzatura. "
    "Serve a scegliere esercizi esistenti invece di crearne di duplicati.",
    {
        "type": "object",
        "properties": {
            "testo": {"type": "string", "description": "Parte del nome."},
            "gruppo_muscolare": {"type": "string"},
            "attrezzatura": {
                "type": "string",
                "description": "Es. manubri, elastico, corpo libero.",
            },
            "includi_archiviati": {"type": "boolean"},
        },
    },
)
def cerca_esercizi(testo=None, gruppo_muscolare=None, attrezzatura=None,
                   includi_archiviati=False):
    query = db.session.query(EsercizioLibreria)
    if not includi_archiviati:
        query = query.filter_by(archiviato=False)
    esercizi = query.order_by(
        EsercizioLibreria.gruppo_muscolare, EsercizioLibreria.nome
    ).all()

    def combacia(e):
        if testo and testo.lower() not in e.nome.lower():
            return False
        if gruppo_muscolare and gruppo_muscolare.lower() not in e.gruppo_muscolare.lower():
            return False
        if attrezzatura and attrezzatura.lower() not in e.attrezzatura.lower():
            return False
        return True

    return {
        "esercizi": [
            {
                "esercizio_id": e.id,
                "nome": e.nome,
                "gruppo_muscolare": e.gruppo_muscolare or None,
                "attrezzatura": e.attrezzatura or None,
                "tipo_carico": e.tipo_carico,
                "tipo_misura": e.tipo_misura,
                "carichi_per_serie": e.carichi_per_serie,
                "note_tecniche": e.note_tecniche or None,
                "archiviato": e.archiviato,
            }
            for e in esercizi
            if combacia(e)
        ]
    }


@strumento(
    "elenco_allenamenti",
    "Elenca gli allenamenti registrati in un periodo, con data, scheda, durata "
    "e volume. Restituisce il sessione_id da usare con gli altri strumenti.",
    {
        "type": "object",
        "properties": {
            "dal": {"type": "string", "description": "Data inizio AAAA-MM-GG."},
            "al": {"type": "string", "description": "Data fine AAAA-MM-GG."},
            "limite": {"type": "integer", "description": "Massimo di risultati."},
        },
    },
)
def elenco_allenamenti(dal=None, al=None, limite=30):
    query = db.session.query(Sessione)
    inizio, fine = _data(dal, "dal"), _data(al, "al")
    if inizio:
        query = query.filter(Sessione.data >= inizio)
    if fine:
        query = query.filter(Sessione.data <= fine)
    sessioni = (
        query.order_by(Sessione.data.desc(), Sessione.id.desc())
        .limit(max(1, min(int(limite or 30), 200)))
        .all()
    )
    return {"allenamenti": [_sessione_json(s) for s in sessioni]}


@strumento(
    "dettaglio_allenamento",
    "Tutte le serie di un allenamento con il serie_id di ognuna, gli esercizi "
    "saltati e i dati di sessione. Usalo prima di correggere una serie.",
    {
        "type": "object",
        "properties": {"sessione_id": {"type": "integer"}},
        "required": ["sessione_id"],
    },
)
def dettaglio_allenamento(sessione_id):
    return _sessione_json(_sessione(sessione_id), con_serie=True)


@strumento(
    "storico_peso_corporeo",
    "Le misurazioni del peso corporeo, dalla piu' recente.",
    {"type": "object", "properties": {"limite": {"type": "integer"}}},
)
def storico_peso_corporeo(limite=30):
    misure = (
        db.session.query(PesoCorporeo)
        .order_by(PesoCorporeo.data.desc())
        .limit(max(1, min(int(limite or 30), 365)))
        .all()
    )
    return {
        "misure": [
            {"data": m.data.isoformat(), "kg": m.valore_kg, "note": m.note or None}
            for m in misure
        ]
    }


@strumento(
    "storico_dolori",
    "Le note del diario dolori/recupero, dalla piu' recente.",
    {"type": "object", "properties": {"limite": {"type": "integer"}}},
)
def storico_dolori(limite=30):
    note = (
        db.session.query(NotaDolore)
        .order_by(NotaDolore.data.desc())
        .limit(max(1, min(int(limite or 30), 365)))
        .all()
    )
    return {
        "note": [
            {
                "nota_id": n.id,
                "data": n.data.isoformat(),
                "zona": n.zona_corporea,
                "gravita": n.gravita,
                "descrizione": n.descrizione or None,
                "sessione_id": n.sessione_id,
            }
            for n in note
        ]
    }


@strumento(
    "record_personali",
    "I record personali attuali per ogni esercizio (peso, ripetizioni o secondi "
    "a seconda del tipo di esercizio).",
    {"type": "object", "properties": {"esercizio": {"type": "string"}}},
)
def record_personali(esercizio=None):
    record = pr_attuali()
    if esercizio:
        testo = esercizio.lower()
        record = [p for p in record if testo in p.esercizio.nome.lower()]
    return {
        "record": [
            {
                "esercizio": p.esercizio.nome,
                "tipo": p.tipo,
                "valore": p.valore,
                "ripetizioni": p.ripetizioni,
                "data": p.data.isoformat(),
                "etichetta": p.etichetta,
            }
            for p in record
        ]
    }


@strumento(
    "leggi_impostazioni",
    "Le preferenze dell'app: durata di default del timer di recupero e numero "
    "di allenamenti usati come contesto per l'assistente.",
    {"type": "object", "properties": {}},
)
def leggi_impostazioni():
    return {
        "timer_default_sec": Impostazione.get_int("timer_default_sec", 90),
        "analisi_n_sessioni": Impostazione.get_int("analisi_n_sessioni", 10),
    }


# --- Schede ----------------------------------------------------------------


@strumento(
    "crea_scheda",
    "Crea una nuova scheda di allenamento, con la sua lista di esercizi. Gli "
    "esercizi si indicano per nome (devono esistere in libreria: se non ci "
    "sono, creali prima con crea_esercizio_libreria).",
    {
        "type": "object",
        "properties": {
            "nome": {"type": "string"},
            "descrizione": {"type": "string"},
            "obiettivo": {
                "type": "string",
                "description": "Es. forza, ipertrofia, resistenza.",
            },
            "esercizi": {
                "type": "array",
                "description": "Esercizi della scheda, nell'ordine di esecuzione.",
                "items": {
                    "type": "object",
                    "properties": {
                        "esercizio": {
                            "type": "string",
                            "description": "Nome (o id) dell'esercizio in libreria.",
                        },
                        "serie_target": {"type": "integer"},
                        "rep_target": {"type": "integer"},
                        "durata_target_sec": {
                            "type": "integer",
                            "description": "Solo per esercizi a tempo (es. plank).",
                        },
                        "peso_suggerito_kg": {
                            "type": "number",
                            "description": "Peso del singolo manubrio, non il totale.",
                        },
                        "note": {"type": "string"},
                        "timer_recupero_secondi": {"type": "integer"},
                    },
                    "required": ["esercizio"],
                },
            },
        },
        "required": ["nome"],
    },
    scrive=True,
)
def crea_scheda(nome, descrizione="", obiettivo="", esercizi=None):
    nome = (nome or "").strip()
    if not nome:
        raise ErroreStrumento("Il nome della scheda e' obbligatorio.")

    scheda = Scheda(
        nome=nome,
        descrizione=(descrizione or "").strip(),
        obiettivo=(obiettivo or "").strip(),
        data_creazione=date.today(),
    )
    db.session.add(scheda)
    db.session.flush()

    for ordine, voce in enumerate(esercizi or []):
        _aggiungi_voce(scheda, voce, ordine)

    db.session.commit()
    return {
        "_azione": f"Creata scheda «{scheda.nome}» con {len(scheda.esercizi)} esercizi",
        "scheda_id": scheda.id,
        "esercizi": [_voce_json(v) for v in scheda.esercizi],
    }


def _aggiungi_voce(scheda, dati, ordine):
    esercizio = _esercizio(dati.get("esercizio"))
    voce = EsercizioScheda(
        scheda_id=scheda.id,
        esercizio_libreria_id=esercizio.id,
        ordine=ordine,
        serie_target=_numero(dati.get("serie_target"), "serie_target", True) or 4,
        rep_target=_numero(dati.get("rep_target"), "rep_target", True),
        durata_target_sec=_numero(dati.get("durata_target_sec"), "durata_target_sec", True),
        peso_suggerito_kg=_numero(dati.get("peso_suggerito_kg"), "peso_suggerito_kg"),
        note=(dati.get("note") or "").strip(),
        timer_recupero_secondi=_numero(
            dati.get("timer_recupero_secondi"), "timer_recupero_secondi", True
        ),
    )
    db.session.add(voce)
    return voce


@strumento(
    "aggiorna_scheda",
    "Cambia nome, descrizione, obiettivo o stato attivo/archiviato di una "
    "scheda. I campi non indicati restano come sono.",
    {
        "type": "object",
        "properties": {
            "scheda_id": {"type": "integer"},
            "nome": {"type": "string"},
            "descrizione": {"type": "string"},
            "obiettivo": {"type": "string"},
            "attiva": {"type": "boolean"},
        },
        "required": ["scheda_id"],
    },
    scrive=True,
)
def aggiorna_scheda(scheda_id, nome=None, descrizione=None, obiettivo=None, attiva=None):
    scheda = _scheda(scheda_id)
    if nome is not None:
        if not nome.strip():
            raise ErroreStrumento("Il nome della scheda non puo' essere vuoto.")
        scheda.nome = nome.strip()
    if descrizione is not None:
        scheda.descrizione = descrizione.strip()
    if obiettivo is not None:
        scheda.obiettivo = obiettivo.strip()
    if attiva is not None:
        scheda.attiva = bool(attiva)
    db.session.commit()
    return {
        "_azione": f"Aggiornata scheda «{scheda.nome}»",
        "scheda": {
            "scheda_id": scheda.id,
            "nome": scheda.nome,
            "obiettivo": scheda.obiettivo or None,
            "attiva": scheda.attiva,
        },
    }


@strumento(
    "duplica_scheda",
    "Copia una scheda con tutti i suoi esercizi, utile per creare una variante "
    "o la progressione del mese dopo senza perdere l'originale.",
    {
        "type": "object",
        "properties": {
            "scheda_id": {"type": "integer"},
            "nuovo_nome": {"type": "string"},
        },
        "required": ["scheda_id"],
    },
    scrive=True,
)
def duplica_scheda(scheda_id, nuovo_nome=None):
    originale = _scheda(scheda_id)
    copia = Scheda(
        nome=(nuovo_nome or f"{originale.nome} (copia)").strip(),
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
    return {
        "_azione": f"Duplicata «{originale.nome}» in «{copia.nome}»",
        "scheda_id": copia.id,
    }


@strumento(
    "elimina_scheda",
    "Elimina una scheda. Se ha allenamenti collegati viene archiviata invece "
    "che cancellata, per non rompere lo storico.",
    {
        "type": "object",
        "properties": {"scheda_id": {"type": "integer"}},
        "required": ["scheda_id"],
    },
    scrive=True,
)
def elimina_scheda(scheda_id):
    scheda = _scheda(scheda_id)
    nome = scheda.nome
    if scheda.sessioni:
        scheda.attiva = False
        db.session.commit()
        return {
            "_azione": f"Archiviata scheda «{nome}» (ha allenamenti collegati)",
            "archiviata": True,
        }
    db.session.delete(scheda)
    db.session.commit()
    return {"_azione": f"Eliminata scheda «{nome}»", "eliminata": True}


@strumento(
    "aggiungi_esercizio_a_scheda",
    "Aggiunge un esercizio della libreria in fondo a una scheda esistente.",
    {
        "type": "object",
        "properties": {
            "scheda_id": {"type": "integer"},
            "esercizio": {"type": "string", "description": "Nome o id in libreria."},
            "serie_target": {"type": "integer"},
            "rep_target": {"type": "integer"},
            "durata_target_sec": {"type": "integer"},
            "peso_suggerito_kg": {"type": "number"},
            "note": {"type": "string"},
            "timer_recupero_secondi": {"type": "integer"},
        },
        "required": ["scheda_id", "esercizio"],
    },
    scrive=True,
)
def aggiungi_esercizio_a_scheda(scheda_id, esercizio, **campi):
    scheda = _scheda(scheda_id)
    ordine = max((v.ordine for v in scheda.esercizi), default=-1) + 1
    voce = _aggiungi_voce(scheda, dict(campi, esercizio=esercizio), ordine)
    db.session.commit()
    return {
        "_azione": f"Aggiunto {voce.esercizio.nome} alla scheda «{scheda.nome}»",
        "voce": _voce_json(voce),
    }


@strumento(
    "aggiorna_esercizio_scheda",
    "Cambia i target di un esercizio dentro una scheda (serie, ripetizioni, "
    "peso suggerito, note, timer). Serve il voce_id da dettaglio_scheda.",
    {
        "type": "object",
        "properties": {
            "voce_id": {"type": "integer"},
            "serie_target": {"type": "integer"},
            "rep_target": {"type": "integer"},
            "durata_target_sec": {"type": "integer"},
            "peso_suggerito_kg": {"type": "number"},
            "note": {"type": "string"},
            "timer_recupero_secondi": {"type": "integer"},
        },
        "required": ["voce_id"],
    },
    scrive=True,
)
def aggiorna_esercizio_scheda(voce_id, serie_target=None, rep_target=None,
                              durata_target_sec=None, peso_suggerito_kg=None,
                              note=None, timer_recupero_secondi=None):
    voce = _voce(voce_id)
    if serie_target is not None:
        voce.serie_target = _numero(serie_target, "serie_target", True)
    if rep_target is not None:
        voce.rep_target = _numero(rep_target, "rep_target", True)
    if durata_target_sec is not None:
        voce.durata_target_sec = _numero(durata_target_sec, "durata_target_sec", True)
    if peso_suggerito_kg is not None:
        voce.peso_suggerito_kg = _numero(peso_suggerito_kg, "peso_suggerito_kg")
    if note is not None:
        voce.note = note.strip()
    if timer_recupero_secondi is not None:
        voce.timer_recupero_secondi = _numero(
            timer_recupero_secondi, "timer_recupero_secondi", True
        )
    db.session.commit()
    return {
        "_azione": f"Aggiornato {voce.esercizio.nome} nella scheda «{voce.scheda.nome}»",
        "voce": _voce_json(voce),
    }


@strumento(
    "rimuovi_esercizio_da_scheda",
    "Toglie un esercizio da una scheda (non lo cancella dalla libreria).",
    {
        "type": "object",
        "properties": {"voce_id": {"type": "integer"}},
        "required": ["voce_id"],
    },
    scrive=True,
)
def rimuovi_esercizio_da_scheda(voce_id):
    voce = _voce(voce_id)
    descrizione = f"{voce.esercizio.nome} dalla scheda «{voce.scheda.nome}»"
    db.session.delete(voce)
    db.session.commit()
    return {"_azione": f"Rimosso {descrizione}", "rimosso": True}


@strumento(
    "crea_esercizio_libreria",
    "Aggiunge un esercizio alla libreria. Usalo solo se cerca_esercizi non "
    "trova niente di equivalente. tipo_carico: peso (manubri), elastico o "
    "corpo_libero; tipo_misura: reps o tempo. carichi_per_serie e' quanti "
    "manubri si impugnano (2 per esercizi a due manubri, 1 se unilaterale).",
    {
        "type": "object",
        "properties": {
            "nome": {"type": "string"},
            "gruppo_muscolare": {"type": "string"},
            "attrezzatura": {"type": "string"},
            "tipo_carico": {
                "type": "string",
                "enum": [LOAD_WEIGHT, LOAD_BAND, LOAD_BODYWEIGHT],
            },
            "tipo_misura": {"type": "string", "enum": [MEASURE_REPS, MEASURE_TIME]},
            "carichi_per_serie": {"type": "integer"},
            "note_tecniche": {"type": "string"},
        },
        "required": ["nome"],
    },
    scrive=True,
)
def crea_esercizio_libreria(nome, gruppo_muscolare="", attrezzatura="",
                            tipo_carico=LOAD_BODYWEIGHT, tipo_misura=MEASURE_REPS,
                            carichi_per_serie=None, note_tecniche=""):
    nome = (nome or "").strip()
    if not nome:
        raise ErroreStrumento("Il nome dell'esercizio e' obbligatorio.")
    if db.session.query(EsercizioLibreria).filter_by(nome=nome).first():
        raise ErroreStrumento(f"Esiste gia' un esercizio chiamato «{nome}».")
    if tipo_carico not in (LOAD_WEIGHT, LOAD_BAND, LOAD_BODYWEIGHT):
        raise ErroreStrumento("tipo_carico deve essere peso, elastico o corpo_libero.")
    if tipo_misura not in (MEASURE_REPS, MEASURE_TIME):
        raise ErroreStrumento("tipo_misura deve essere reps o tempo.")

    if carichi_per_serie is None:
        carichi_per_serie = 2 if tipo_carico == LOAD_WEIGHT else 0

    esercizio = EsercizioLibreria(
        nome=nome,
        gruppo_muscolare=(gruppo_muscolare or "").strip(),
        attrezzatura=(attrezzatura or "").strip(),
        tipo_carico=tipo_carico,
        tipo_misura=tipo_misura,
        carichi_per_serie=int(carichi_per_serie),
        note_tecniche=(note_tecniche or "").strip(),
        is_custom=True,
    )
    db.session.add(esercizio)
    db.session.commit()
    return {
        "_azione": f"Aggiunto «{nome}» alla libreria esercizi",
        "esercizio_id": esercizio.id,
    }


# --- Allenamenti -----------------------------------------------------------


@strumento(
    "registra_allenamento",
    "Registra a posteriori un allenamento nel calendario, con le serie svolte. "
    "I pesi sono quelli del singolo manubrio. I record personali vengono "
    "aggiornati automaticamente.",
    {
        "type": "object",
        "properties": {
            "data": {"type": "string", "description": "AAAA-MM-GG, non nel futuro."},
            "scheda_id": {
                "type": "integer",
                "description": "Scheda seguita; omettila per un allenamento libero.",
            },
            "durata_minuti": {"type": "integer"},
            "energia": {"type": "integer", "description": "Da 1 a 5."},
            "sonno": {"type": "integer", "description": "Da 1 a 5."},
            "umore": {"type": "integer", "description": "Da 1 a 5."},
            "note_generali": {"type": "string"},
            "esercizi": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "esercizio": {"type": "string"},
                        "serie": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "peso_kg": {"type": "number"},
                                    "ripetizioni": {"type": "integer"},
                                    "durata_secondi": {"type": "integer"},
                                    "note": {"type": "string"},
                                },
                            },
                        },
                    },
                    "required": ["esercizio", "serie"],
                },
            },
            "saltati": {
                "type": "array",
                "description": "Esercizi della scheda dichiarati come non svolti.",
                "items": {
                    "type": "object",
                    "properties": {
                        "esercizio": {"type": "string"},
                        "motivo": {"type": "string"},
                    },
                    "required": ["esercizio"],
                },
            },
        },
        "required": ["data", "esercizi"],
    },
    scrive=True,
)
def registra_allenamento(data, esercizi, scheda_id=None, durata_minuti=None,
                         energia=None, sonno=None, umore=None, note_generali="",
                         saltati=None):
    giorno = _data(data)
    if giorno > date.today():
        raise ErroreStrumento("Non si possono registrare allenamenti nel futuro.")

    scheda = _scheda(scheda_id) if scheda_id else None
    per_voce = (
        {v.esercizio_libreria_id: v for v in scheda.esercizi} if scheda else {}
    )

    sessione = Sessione(
        data=giorno,
        iniziata_alle=datetime.combine(giorno, datetime.min.time()),
        scheda_id=scheda.id if scheda else None,
        durata_minuti=_numero(durata_minuti, "durata_minuti", True),
        energia=_numero(energia, "energia", True),
        sonno=_numero(sonno, "sonno", True),
        umore=_numero(umore, "umore", True),
        note_generali=(note_generali or "").strip(),
        completata=True,
    )
    db.session.add(sessione)
    db.session.flush()

    create = []
    for blocco in esercizi or []:
        esercizio = _esercizio(blocco.get("esercizio"))
        voce = per_voce.get(esercizio.id)
        for numero, serie in enumerate(blocco.get("serie") or [], start=1):
            ripetizioni = _numero(serie.get("ripetizioni"), "ripetizioni", True)
            durata = _numero(serie.get("durata_secondi"), "durata_secondi", True)
            if ripetizioni is None and durata is None:
                raise ErroreStrumento(
                    f"Serie {numero} di {esercizio.nome}: servono le ripetizioni "
                    "o i secondi."
                )
            riga = SerieEseguita(
                sessione_id=sessione.id,
                esercizio_scheda_id=voce.id if voce else None,
                esercizio_libreria_id=esercizio.id,
                numero_serie=numero,
                peso_kg=_numero(serie.get("peso_kg"), "peso_kg"),
                ripetizioni=ripetizioni,
                durata_secondi=durata,
                note=(serie.get("note") or "").strip(),
            )
            db.session.add(riga)
            create.append(riga)

    if not create:
        db.session.rollback()
        raise ErroreStrumento("Nessuna serie da registrare.")

    for saltato in saltati or []:
        esercizio = _esercizio(saltato.get("esercizio"))
        voce = per_voce.get(esercizio.id)
        db.session.add(
            EsercizioSaltato(
                sessione_id=sessione.id,
                esercizio_scheda_id=voce.id if voce else None,
                esercizio_libreria_id=esercizio.id,
                motivo=(saltato.get("motivo") or "").strip(),
            )
        )

    db.session.flush()
    pr = sum(1 for riga in create if controlla_pr(riga))
    db.session.commit()
    return {
        "_azione": (
            f"Registrato allenamento del {giorno.strftime('%d/%m/%Y')} "
            f"({len(create)} serie)"
        ),
        "sessione_id": sessione.id,
        "serie_registrate": len(create),
        "nuovi_record": pr,
    }


@strumento(
    "aggiorna_allenamento",
    "Cambia i dati generali di un allenamento gia' registrato: data, scheda, "
    "durata, energia/sonno/umore, note.",
    {
        "type": "object",
        "properties": {
            "sessione_id": {"type": "integer"},
            "data": {"type": "string"},
            "scheda_id": {"type": "integer"},
            "durata_minuti": {"type": "integer"},
            "energia": {"type": "integer"},
            "sonno": {"type": "integer"},
            "umore": {"type": "integer"},
            "note_generali": {"type": "string"},
        },
        "required": ["sessione_id"],
    },
    scrive=True,
)
def aggiorna_allenamento(sessione_id, data=None, scheda_id=None, durata_minuti=None,
                         energia=None, sonno=None, umore=None, note_generali=None):
    sessione = _sessione(sessione_id)
    if data is not None:
        giorno = _data(data)
        if giorno > date.today():
            raise ErroreStrumento("Non si possono spostare allenamenti nel futuro.")
        sessione.data = giorno
        for nota in sessione.note_dolore:
            nota.data = giorno
    if scheda_id is not None:
        sessione.scheda_id = _scheda(scheda_id).id
    if durata_minuti is not None:
        sessione.durata_minuti = _numero(durata_minuti, "durata_minuti", True)
    if energia is not None:
        sessione.energia = _numero(energia, "energia", True)
    if sonno is not None:
        sessione.sonno = _numero(sonno, "sonno", True)
    if umore is not None:
        sessione.umore = _numero(umore, "umore", True)
    if note_generali is not None:
        sessione.note_generali = note_generali.strip()

    db.session.flush()
    ricalcola_pr({s.esercizio_libreria_id for s in sessione.serie})
    db.session.commit()
    return {
        "_azione": (
            f"Aggiornato allenamento del {sessione.data.strftime('%d/%m/%Y')}"
        ),
        "allenamento": _sessione_json(sessione),
    }


@strumento(
    "modifica_serie",
    "Corregge una singola serie gia' registrata (peso, ripetizioni, secondi, "
    "note). Serve il serie_id da dettaglio_allenamento. I record personali "
    "vengono ricalcolati su tutto lo storico.",
    {
        "type": "object",
        "properties": {
            "serie_id": {"type": "integer"},
            "peso_kg": {"type": "number", "description": "Peso del singolo manubrio."},
            "ripetizioni": {"type": "integer"},
            "durata_secondi": {"type": "integer"},
            "note": {"type": "string"},
        },
        "required": ["serie_id"],
    },
    scrive=True,
)
def modifica_serie(serie_id, peso_kg=None, ripetizioni=None, durata_secondi=None,
                   note=None):
    serie = db.session.get(SerieEseguita, serie_id)
    if serie is None:
        raise ErroreStrumento(f"Nessuna serie con id {serie_id}.")
    if peso_kg is not None:
        serie.peso_kg = _numero(peso_kg, "peso_kg")
    if ripetizioni is not None:
        serie.ripetizioni = _numero(ripetizioni, "ripetizioni", True)
    if durata_secondi is not None:
        serie.durata_secondi = _numero(durata_secondi, "durata_secondi", True)
    if note is not None:
        serie.note = note.strip()

    db.session.flush()
    ricalcola_pr({serie.esercizio_libreria_id})
    db.session.commit()
    return {
        "_azione": (
            f"Corretta la serie {serie.numero_serie} di {serie.esercizio.nome} "
            f"del {serie.sessione.data.strftime('%d/%m/%Y')}"
        ),
        "serie": {
            "serie_id": serie.id,
            "peso_kg": serie.peso_kg,
            "ripetizioni": serie.ripetizioni,
            "durata_secondi": serie.durata_secondi,
            "note": serie.note or None,
            "is_pr": serie.is_pr,
        },
    }


@strumento(
    "elimina_allenamento",
    "Cancella un allenamento e tutte le sue serie. Chiedi conferma all'utente "
    "prima di usarlo: non e' reversibile.",
    {
        "type": "object",
        "properties": {"sessione_id": {"type": "integer"}},
        "required": ["sessione_id"],
    },
    scrive=True,
)
def elimina_allenamento(sessione_id):
    sessione = _sessione(sessione_id)
    giorno = sessione.data
    esercizi = {s.esercizio_libreria_id for s in sessione.serie}
    db.session.delete(sessione)
    db.session.flush()
    ricalcola_pr(esercizi)
    db.session.commit()
    return {
        "_azione": f"Eliminato l'allenamento del {giorno.strftime('%d/%m/%Y')}",
        "eliminato": True,
    }


# --- Peso, dolori, impostazioni -------------------------------------------


@strumento(
    "registra_peso_corporeo",
    "Salva una misurazione del peso corporeo. Una sola per giorno: se ce n'e' "
    "gia' una in quella data viene sovrascritta.",
    {
        "type": "object",
        "properties": {
            "valore_kg": {"type": "number"},
            "data": {"type": "string", "description": "AAAA-MM-GG, default oggi."},
            "note": {"type": "string"},
        },
        "required": ["valore_kg"],
    },
    scrive=True,
)
def registra_peso_corporeo(valore_kg, data=None, note=""):
    valore = _numero(valore_kg, "valore_kg")
    if not valore or valore <= 0:
        raise ErroreStrumento("Il peso deve essere maggiore di zero.")
    giorno = _data(data) or date.today()

    misura = db.session.query(PesoCorporeo).filter_by(data=giorno).first()
    if misura is None:
        misura = PesoCorporeo(data=giorno)
        db.session.add(misura)
    misura.valore_kg = valore
    misura.note = (note or "").strip()
    db.session.commit()
    return {
        "_azione": f"Registrato peso {valore:g} kg il {giorno.strftime('%d/%m/%Y')}",
        "data": giorno.isoformat(),
    }


@strumento(
    "aggiungi_nota_dolore",
    "Aggiunge una voce al diario dolori/recupero, collegabile a un allenamento.",
    {
        "type": "object",
        "properties": {
            "zona_corporea": {"type": "string", "description": "Es. spalla destra."},
            "descrizione": {"type": "string"},
            "gravita": {"type": "integer", "description": "Da 1 a 5."},
            "data": {"type": "string", "description": "AAAA-MM-GG, default oggi."},
            "sessione_id": {"type": "integer"},
        },
        "required": ["zona_corporea"],
    },
    scrive=True,
)
def aggiungi_nota_dolore(zona_corporea, descrizione="", gravita=1, data=None,
                         sessione_id=None):
    zona = (zona_corporea or "").strip()
    if not zona:
        raise ErroreStrumento("Indica la zona del corpo.")
    giorno = _data(data) or date.today()
    if sessione_id:
        _sessione(sessione_id)

    nota = NotaDolore(
        data=giorno,
        sessione_id=sessione_id,
        zona_corporea=zona,
        descrizione=(descrizione or "").strip(),
        gravita=max(1, min(int(gravita or 1), 5)),
    )
    db.session.add(nota)
    db.session.commit()
    return {
        "_azione": f"Aggiunta nota dolore «{zona}» del {giorno.strftime('%d/%m/%Y')}",
        "nota_id": nota.id,
    }


@strumento(
    "imposta_preferenza",
    "Cambia una preferenza dell'app: timer_default_sec (recupero di default, "
    "5-900 secondi) o analisi_n_sessioni (quanti allenamenti recenti tenere nel "
    "contesto dell'assistente, 1-100).",
    {
        "type": "object",
        "properties": {
            "chiave": {
                "type": "string",
                "enum": ["timer_default_sec", "analisi_n_sessioni"],
            },
            "valore": {"type": "integer"},
        },
        "required": ["chiave", "valore"],
    },
    scrive=True,
)
def imposta_preferenza(chiave, valore):
    limiti = {"timer_default_sec": (5, 900), "analisi_n_sessioni": (1, 100)}
    if chiave not in limiti:
        raise ErroreStrumento("Preferenza sconosciuta.")
    numero = _numero(valore, "valore", True)
    minimo, massimo = limiti[chiave]
    if numero is None or not (minimo <= numero <= massimo):
        raise ErroreStrumento(f"{chiave} deve stare fra {minimo} e {massimo}.")

    Impostazione.set(chiave, numero)
    db.session.commit()
    return {"_azione": f"Impostato {chiave} = {numero}", chiave: numero}
