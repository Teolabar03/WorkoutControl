"""Popolamento iniziale del database a partire da `Schede.txt`.

I dati sono trascritti esplicitamente invece di essere parsati: `Schede.txt`
ha righe vuote irregolari e colonne disallineate, e questa importazione avviene
una volta sola. Il file resta nel repo come documento di origine.

`applica_seed()` e' idempotente: puo' girare a ogni avvio senza duplicare nulla.
"""

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

# (nome, attrezzatura, gruppo, tipo_carico, tipo_misura, carichi_per_serie, note_tecniche)
ESERCIZI = [
    # --- Sessione 1 ---
    (
        "Floor Press (presa neutra)",
        "Manubri, Tappeto",
        "Petto",
        LOAD_WEIGHT,
        MEASURE_REPS,
        2,
        "Sdraiato a terra su tappeto + Manubri",
    ),
    (
        "Dip su Sedia",
        "Sedia",
        "Tricipiti",
        LOAD_BODYWEIGHT,
        MEASURE_REPS,
        0,
        "Sedia appoggiata al muro, mani sul bordo",
    ),
    (
        "Croci a terra (Floor Flyes)",
        "Manubri, Tappeto",
        "Petto",
        LOAD_WEIGHT,
        MEASURE_REPS,
        2,
        "Sdraiato a terra su tappeto + Manubri",
    ),
    (
        "Rematore al tavolo/sedia",
        "Manubri, Tavolo",
        "Dorso",
        LOAD_WEIGHT,
        MEASURE_REPS,
        1,
        "Mano sul tavolo, busto flesso, tiro verso il fianco",
    ),
    (
        "Rematore con elastico",
        "Elastico",
        "Dorso",
        LOAD_BAND,
        MEASURE_REPS,
        0,
        "Seduto a terra, elastico sotto i piedi",
    ),
    (
        "Squat a corpo libero",
        "Manubri",
        "Gambe",
        LOAD_WEIGHT,
        MEASURE_REPS,
        2,
        "Manubri in mano lungo i fianchi",
    ),
    (
        "Leg Extension",
        "Elastico, Sedia",
        "Quadricipiti",
        LOAD_BAND,
        MEASURE_REPS,
        0,
        "Seduto su sedia, elastico legato alla caviglia",
    ),
    (
        "Extension tricipiti dietro nuca",
        "Manubri, Sedia",
        "Tricipiti",
        LOAD_WEIGHT,
        MEASURE_REPS,
        1,
        "Seduto su sedia con manubrio",
    ),
    (
        "Alzate laterali",
        "Manubri",
        "Spalle",
        LOAD_WEIGHT,
        MEASURE_REPS,
        2,
        "In piedi + Manubri leggerissimi (0.5-1.5 kg)",
    ),
    (
        "Crunch",
        "Tappeto",
        "Addome",
        LOAD_BODYWEIGHT,
        MEASURE_REPS,
        0,
        "A terra su tappeto",
    ),
    # --- Sessione 2 ---
    (
        "Lat machine con elastico",
        "Elastico, Porta",
        "Dorso",
        LOAD_BAND,
        MEASURE_REPS,
        0,
        "Elastico fissato con nodo in alto sopra la porta",
    ),
    (
        "Trazioni orizzontali",
        "Elastico, Porta",
        "Dorso",
        LOAD_BAND,
        MEASURE_REPS,
        0,
        "Elastico alla maniglia, tiro verso i fianchi",
    ),
    (
        "Pull Down a braccia tese",
        "Elastico, Porta",
        "Dorso",
        LOAD_BAND,
        MEASURE_REPS,
        0,
        "Elastico in alto sulla porta, braccia tese in basso",
    ),
    (
        "Floor Press (presa classica)",
        "Manubri, Tappeto",
        "Petto",
        LOAD_WEIGHT,
        MEASURE_REPS,
        2,
        "Sdraiato a terra + Manubri (palmi verso i piedi)",
    ),
    (
        "Croci con elastico",
        "Elastico, Porta",
        "Petto",
        LOAD_BAND,
        MEASURE_REPS,
        0,
        "Elastico alla porta, spalle all'anta, chiusura al petto",
    ),
    (
        "Affondi posteriori alternati",
        "Manubri",
        "Gambe",
        LOAD_WEIGHT,
        MEASURE_REPS,
        2,
        "In piedi + Manubri lungo i fianchi",
    ),
    (
        "Leg Curl con elastico",
        "Elastico, Tappeto",
        "Femorali",
        LOAD_BAND,
        MEASURE_REPS,
        0,
        "Sdraiato a pancia in giu', elastico alla caviglia",
    ),
    (
        "Curl bicipiti (presa a martello)",
        "Manubri",
        "Bicipiti",
        LOAD_WEIGHT,
        MEASURE_REPS,
        2,
        "In piedi + Manubri (palmi verso i fianchi)",
    ),
    (
        "Shoulder Press",
        "Manubri, Sedia",
        "Spalle",
        LOAD_WEIGHT,
        MEASURE_REPS,
        2,
        "Seduto su sedia con schienale + Manubri",
    ),
    (
        "Plank",
        "Tappeto",
        "Core",
        LOAD_BODYWEIGHT,
        MEASURE_TIME,
        0,
        "Posizione statica su avambracci",
    ),
]

# (nome_esercizio, serie, rep, durata_sec, peso_suggerito_kg, note)
SESSIONE_1 = [
    ("Floor Press (presa neutra)", 4, 12, None, 1.5, ""),
    ("Dip su Sedia", 4, 12, None, None, ""),
    ("Croci a terra (Floor Flyes)", 4, 12, None, 1.5, ""),
    ("Rematore al tavolo/sedia", 4, 12, None, 1.5, ""),
    ("Rematore con elastico", 4, 12, None, None, ""),
    ("Squat a corpo libero", 4, 12, None, 1.5, ""),
    ("Leg Extension", 4, 12, None, None, ""),
    ("Extension tricipiti dietro nuca", 4, 12, None, 1.5, ""),
    ("Alzate laterali", 4, 12, None, 0.5, ""),
    ("Crunch", 4, 20, None, None, ""),
]

SESSIONE_2 = [
    ("Lat machine con elastico", 4, 12, None, None, ""),
    ("Trazioni orizzontali", 4, 12, None, None, ""),
    ("Pull Down a braccia tese", 4, 12, None, None, ""),
    ("Floor Press (presa classica)", 4, 12, None, 1.5, ""),
    ("Croci con elastico", 4, 12, None, None, ""),
    ("Affondi posteriori alternati", 4, 12, None, 1.5, ""),
    ("Leg Curl con elastico", 4, 12, None, None, ""),
    ("Curl bicipiti (presa a martello)", 4, 12, None, 1.5, ""),
    ("Shoulder Press", 4, 12, None, 1.5, ""),
    ("Plank", 4, None, 45, None, ""),
]

SCHEDE = [
    ("Sessione 1", "Petto, dorso, gambe e braccia — richiami su spalle e addome.", SESSIONE_1),
    ("Sessione 2", "Focus dorso con elastico, spinta e catena posteriore.", SESSIONE_2),
]


def applica_seed():
    """Crea impostazioni, libreria esercizi e schede se non esistono gia'."""
    for chiave, valore in Impostazione.DEFAULTS.items():
        if db.session.get(Impostazione, chiave) is None:
            db.session.add(Impostazione(chiave=chiave, valore=valore))

    per_nome = {}
    for nome, attrezzatura, gruppo, carico, misura, carichi, note in ESERCIZI:
        esercizio = db.session.query(EsercizioLibreria).filter_by(nome=nome).first()
        if esercizio is None:
            esercizio = EsercizioLibreria(
                nome=nome,
                attrezzatura=attrezzatura,
                gruppo_muscolare=gruppo,
                tipo_carico=carico,
                tipo_misura=misura,
                carichi_per_serie=carichi,
                note_tecniche=note,
            )
            db.session.add(esercizio)
        per_nome[nome] = esercizio

    # Serve l'id degli esercizi appena inseriti per collegarli alle schede.
    db.session.flush()

    for nome_scheda, descrizione, righe in SCHEDE:
        if db.session.query(Scheda).filter_by(nome=nome_scheda).first() is not None:
            continue
        scheda = Scheda(nome=nome_scheda, descrizione=descrizione, obiettivo="Ipertrofia")
        db.session.add(scheda)
        db.session.flush()
        for ordine, (nome_es, serie, rep, durata, peso, note) in enumerate(righe):
            db.session.add(
                EsercizioScheda(
                    scheda_id=scheda.id,
                    esercizio_libreria_id=per_nome[nome_es].id,
                    ordine=ordine,
                    serie_target=serie,
                    rep_target=rep,
                    durata_target_sec=durata,
                    peso_suggerito_kg=peso,
                    note=note,
                )
            )

    db.session.commit()
