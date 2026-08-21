"""Dict-builder per le risposte dell'API JSON (`/api/*`).

Serializzano gli oggetti SQLAlchemy per il frontend React con tutti i campi
che l'interfaccia deve mostrare. Sono volutamente distinti dai dict compatti
di `services/ai_tools.py` (pensati per il consumo token-efficiente del
modello AI, non per popolare form/tabelle): stessa fonte dati, forma diversa
in base a chi consuma la risposta.
"""


def serialize_esercizio_libreria(e):
    return {
        "id": e.id,
        "nome": e.nome,
        "attrezzatura": e.attrezzatura,
        "gruppo_muscolare": e.gruppo_muscolare,
        "tipo_carico": e.tipo_carico,
        "tipo_misura": e.tipo_misura,
        "carichi_per_serie": e.carichi_per_serie,
        "note_tecniche": e.note_tecniche,
        "is_custom": e.is_custom,
        "archiviato": e.archiviato,
        "usa_peso": e.usa_peso,
        "a_tempo": e.a_tempo,
    }


def serialize_esercizio_scheda(v):
    return {
        "id": v.id,
        "scheda_id": v.scheda_id,
        "ordine": v.ordine,
        "serie_target": v.serie_target,
        "rep_target": v.rep_target,
        "durata_target_sec": v.durata_target_sec,
        "peso_suggerito_kg": v.peso_suggerito_kg,
        "note": v.note,
        "timer_recupero_secondi": v.timer_recupero_secondi,
        "timer_effettivo": v.timer_effettivo,
        "esercizio": serialize_esercizio_libreria(v.esercizio),
    }


def serialize_scheda(s, con_esercizi=True):
    dati = {
        "id": s.id,
        "nome": s.nome,
        "descrizione": s.descrizione,
        "obiettivo": s.obiettivo,
        "data_creazione": s.data_creazione.isoformat(),
        "attiva": s.attiva,
        "n_esercizi": len(s.esercizi),
        "n_allenamenti": len(s.sessioni),
    }
    if con_esercizi:
        dati["esercizi"] = [serialize_esercizio_scheda(v) for v in s.esercizi]
    return dati


def serialize_serie(s):
    return {
        "id": s.id,
        "sessione_id": s.sessione_id,
        "esercizio_scheda_id": s.esercizio_scheda_id,
        "esercizio_libreria_id": s.esercizio_libreria_id,
        "esercizio": serialize_esercizio_libreria(s.esercizio),
        "numero_serie": s.numero_serie,
        "peso_kg": s.peso_kg,
        "ripetizioni": s.ripetizioni,
        "durata_secondi": s.durata_secondi,
        "note": s.note,
        "is_pr": s.is_pr,
        "volume_kg": round(s.volume_kg, 1),
        "registrata_alle": s.registrata_alle.isoformat(),
    }


def serialize_esercizio_saltato(x):
    return {
        "id": x.id,
        "sessione_id": x.sessione_id,
        "esercizio_scheda_id": x.esercizio_scheda_id,
        "esercizio_libreria_id": x.esercizio_libreria_id,
        "esercizio": serialize_esercizio_libreria(x.esercizio),
        "motivo": x.motivo,
    }


def serialize_sessione(s, con_dettaglio=False):
    dati = {
        "id": s.id,
        "data": s.data.isoformat(),
        "iniziata_alle": s.iniziata_alle.isoformat(),
        "scheda_id": s.scheda_id,
        "nome_scheda": s.nome_scheda,
        "durata_minuti": s.durata_minuti,
        "energia": s.energia,
        "sonno": s.sonno,
        "umore": s.umore,
        "note_generali": s.note_generali,
        "completata": s.completata,
        "n_serie": len(s.serie),
        "volume_kg": round(s.volume_kg, 1),
    }
    if con_dettaglio:
        dati["serie"] = [serialize_serie(x) for x in s.serie]
        dati["note_dolore"] = [serialize_nota_dolore(n) for n in s.note_dolore]
        dati["esercizi_saltati"] = [
            serialize_esercizio_saltato(x) for x in s.esercizi_saltati
        ]
    return dati


def serialize_peso_corporeo(m):
    return {
        "id": m.id,
        "data": m.data.isoformat(),
        "valore_kg": m.valore_kg,
        "note": m.note,
    }


def serialize_pasto(p):
    """Un singolo pasto, con tutto quello che ne sappiamo.

    Gli aggregati giornalieri di `services/salute.py` sommano solo kcal e i tre
    macro principali: fibre e zuccheri esistono nel database (l'export di
    Samsung Health li porta) ma non erano esposti da nessuna parte. Qui ci sono,
    a null quando la sorgente non li ha dati.
    """
    return {
        "id": p.id,
        "data": p.data.isoformat(),
        "inizio": p.inizio.isoformat(),
        "nome": p.nome,
        "kcal": p.kcal,
        "proteine_g": p.proteine_g,
        "carboidrati_g": p.carboidrati_g,
        "grassi_g": p.grassi_g,
        "fibre_g": p.fibre_g,
        "zuccheri_g": p.zuccheri_g,
        "origine": p.origine,
    }


def serialize_pr(p):
    return {
        "id": p.id,
        "esercizio_libreria_id": p.esercizio_libreria_id,
        "esercizio": p.esercizio.nome,
        "tipo": p.tipo,
        "valore": p.valore,
        "peso_kg": p.peso_kg,
        "ripetizioni": p.ripetizioni,
        "data": p.data.isoformat(),
        "sessione_id": p.sessione_id,
        "etichetta": p.etichetta,
    }


def serialize_nota_dolore(n):
    return {
        "id": n.id,
        "data": n.data.isoformat(),
        "sessione_id": n.sessione_id,
        "zona_corporea": n.zona_corporea,
        "descrizione": n.descrizione,
        "gravita": n.gravita,
    }


def serialize_conversazione(c, con_messaggi=False):
    dati = {
        "id": c.id,
        "titolo": c.titolo,
        "data_creazione": c.data_creazione.isoformat(),
        "data_ultimo_messaggio": c.data_ultimo_messaggio.isoformat(),
        "anteprima": c.anteprima,
    }
    if con_messaggi:
        dati["messaggi"] = [serialize_messaggio(m) for m in c.messaggi]
    return dati


def serialize_messaggio(m):
    return {
        "id": m.id,
        "conversazione_id": m.conversazione_id,
        "ruolo": m.ruolo,
        "contenuto": m.contenuto,
        "data": m.data.isoformat(),
        "n_sessioni_contesto": m.n_sessioni_contesto,
        "modello": m.modello,
        "azioni": m.elenco_azioni,
        "avviso": m.avviso,
    }
